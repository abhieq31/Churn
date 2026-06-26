// The explanation engine — what makes ChurnLens more than a risk score.
//
// Tier 1: aggregate encoded feature importance back to original columns.
// Tier 2: per-customer reasons, gated by the global risk DIRECTION of each
//         feature so we only show factors actually pushing THIS customer's risk up.
// Tier 3: cluster at-risk customers by their top shared factor into actionable
//         recommendations.

import { cellToString, parseNumber } from "./preprocess";
import type {
  AtRiskCustomer,
  ColumnImportance,
  ColumnMapping,
  ColumnType,
  EncodedFeature,
  RawRow,
  Recommendation,
  RiskReason,
  ShapContribution,
} from "./types";

const TRUE_TOKENS = new Set(["yes", "true", "1", "y", "t"]);

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 100) return n.toFixed(0);
  return n.toFixed(1);
}

export function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Tier 1: roll encoded-feature importances up to the original CSV columns. */
export function aggregateImportance(
  features: EncodedFeature[],
  importances: number[],
): ColumnImportance[] {
  const byColumn = new Map<string, number>();
  features.forEach((f, i) => {
    byColumn.set(f.sourceColumn, (byColumn.get(f.sourceColumn) ?? 0) + (importances[i] ?? 0));
  });
  return [...byColumn.entries()]
    .map(([column, importance]) => ({ column, importance }))
    .sort((a, b) => b.importance - a.importance);
}

interface NumericBaseline {
  retainedMean: number;
  churnedMean: number;
  std: number;
  /** Which direction increases churn risk for this feature. */
  direction: "high" | "low";
}

interface CategoricalBaseline {
  overallChurnRate: number;
  rateByValue: Map<string, number>;
}

export interface Baselines {
  columnTypes: Map<string, ColumnType>;
  numeric: Map<string, NumericBaseline>;
  categorical: Map<string, CategoricalBaseline>;
  overallChurnRate: number;
}

/**
 * Compute descriptive baselines over the FULL dataset (not just the training
 * split). These are for display/explanation only — they never feed model
 * training — so using all rows just makes them more stable.
 */
export function buildBaselines(
  rows: RawRow[],
  labels: number[],
  mapping: ColumnMapping,
  columnTypes: Map<string, ColumnType>,
): Baselines {
  const overallChurnRate = labels.reduce((a, b) => a + b, 0) / Math.max(labels.length, 1);
  const numeric = new Map<string, NumericBaseline>();
  const categorical = new Map<string, CategoricalBaseline>();

  for (const col of mapping.featureColumns) {
    const type = columnTypes.get(col);
    if (type === "numeric") {
      const retained: number[] = [];
      const churned: number[] = [];
      const all: number[] = [];
      rows.forEach((row, i) => {
        const n = parseNumber(row[col]);
        if (Number.isNaN(n)) return;
        all.push(n);
        (labels[i] === 1 ? churned : retained).push(n);
      });
      const mean = (arr: number[]) =>
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const retainedMean = mean(retained);
      const churnedMean = mean(churned);
      const allMean = mean(all);
      const variance = all.length
        ? all.reduce((a, b) => a + (b - allMean) * (b - allMean), 0) / all.length
        : 1;
      const std = Math.sqrt(variance) || 1;
      numeric.set(col, {
        retainedMean,
        churnedMean,
        std,
        direction: churnedMean >= retainedMean ? "high" : "low",
      });
    } else if (type === "categorical" || type === "boolean") {
      const counts = new Map<string, { total: number; churned: number }>();
      rows.forEach((row, i) => {
        const v = cellToString(row[col]) || "(missing)";
        const entry = counts.get(v) ?? { total: 0, churned: 0 };
        entry.total++;
        entry.churned += labels[i];
        counts.set(v, entry);
      });
      const rateByValue = new Map<string, number>();
      for (const [v, e] of counts) rateByValue.set(v, e.churned / Math.max(e.total, 1));
      categorical.set(col, { overallChurnRate, rateByValue });
    }
  }

  return { columnTypes, numeric, categorical, overallChurnRate };
}

/** Prettify a boolean-ish value so reasons read naturally. */
function displayValue(col: string, raw: string): string {
  return raw === "" ? "(missing)" : raw;
}

/**
 * Tier 2: build the ranked list of reasons a single customer is at risk.
 * Only risk-INCREASING factors are included (a globally-important feature that
 * happens to be protective for this customer is skipped).
 */
export function explainCustomer(
  row: RawRow,
  rowIndex: number,
  probability: number,
  mapping: ColumnMapping,
  baselines: Baselines,
  rankedColumns: ColumnImportance[],
  shap: ShapContribution[] = [],
): AtRiskCustomer {
  const candidates: RiskReason[] = [];
  // Look at the most important columns (cap to keep reasons focused).
  const considered = rankedColumns.slice(0, 10);

  for (const { column } of considered) {
    const type = baselines.columnTypes.get(column);

    if (type === "numeric") {
      const base = baselines.numeric.get(column);
      if (!base) continue;
      const v = parseNumber(row[column]);
      if (Number.isNaN(v)) continue;
      const deviation = (v - base.retainedMean) / base.std;
      const isRisky =
        (base.direction === "high" && deviation > 0) ||
        (base.direction === "low" && deviation < 0);
      const magnitude = Math.abs(deviation);
      if (!isRisky || magnitude < 0.5) continue;

      const ratio = base.retainedMean !== 0 ? v / base.retainedMean : 0;
      let phrase: string;
      if (base.direction === "high") {
        if (ratio >= 2) phrase = "more than double";
        else if (ratio >= 1.5) phrase = "well above";
        else phrase = "above";
      } else {
        phrase = ratio <= 0.5 ? "less than half" : "below";
      }
      candidates.push({
        column,
        label: column,
        magnitude,
        tag: `${column}:${base.direction}`,
        text: `${column} (${formatNum(v)}) — ${phrase} the retained-customer average (${formatNum(
          base.retainedMean,
        )}).`,
      });
    } else if (type === "categorical" || type === "boolean") {
      const base = baselines.categorical.get(column);
      if (!base) continue;
      const raw = cellToString(row[column]);
      const v = displayValue(column, raw);
      const rate = base.rateByValue.get(v);
      if (rate === undefined || base.overallChurnRate === 0) continue;
      const ratio = rate / base.overallChurnRate;
      if (ratio < 1.2 || rate <= base.overallChurnRate) continue;
      candidates.push({
        column,
        label: column,
        magnitude: ratio - 1,
        tag: `${column}:${v}`,
        text: `${column}: ${v} — these customers churn at ${ratio.toFixed(1)}× the overall rate.`,
      });
    }
  }

  candidates.sort((a, b) => b.magnitude - a.magnitude);
  let reasons = candidates.slice(0, 4);
  if (reasons.length === 0) {
    reasons = [
      {
        column: "",
        label: "Overall pattern",
        magnitude: 0,
        tag: "overall:pattern",
        text: "This customer's overall usage pattern resembles customers who have churned.",
      },
    ];
  }

  const label =
    mapping.idColumn && cellToString(row[mapping.idColumn])
      ? cellToString(row[mapping.idColumn])
      : `Customer #${rowIndex + 1}`;
  const revenue = mapping.revenueColumn ? parseNumber(row[mapping.revenueColumn]) : NaN;

  return {
    rowIndex,
    label,
    probability,
    revenue: Number.isNaN(revenue) ? null : revenue,
    reasons,
    shap,
  };
}

function actionFor(column: string): string {
  const c = column.toLowerCase();
  if (/(service|support|complaint|ticket|call|help)/.test(c))
    return "Reach out proactively with a service-recovery touch before they cancel.";
  if (/(price|charge|cost|mrr|revenue|bill|fee|amount)/.test(c))
    return "Review pricing for this segment or offer a targeted loyalty discount.";
  if (/(plan|contract|tier|subscription)/.test(c))
    return "Revisit the plan or contract terms driving churn in this segment.";
  if (/(usage|minute|login|active|session|engage|visit)/.test(c))
    return "Re-engage this segment with usage nudges and feature education.";
  return "Prioritise this segment for proactive retention outreach.";
}

/** Historical churn lift for a cohort sharing a given risk tag, vs the base rate. */
function cohortMultiplier(
  tag: string,
  rows: RawRow[],
  labels: number[],
  baselines: Baselines,
): number {
  const overall = baselines.overallChurnRate || 1;
  const sep = tag.lastIndexOf(":");
  const column = tag.slice(0, sep);
  const key = tag.slice(sep + 1);

  if (key === "high" || key === "low") {
    const base = baselines.numeric.get(column);
    if (!base) return 1;
    let total = 0;
    let churned = 0;
    rows.forEach((row, i) => {
      const v = parseNumber(row[column]);
      if (Number.isNaN(v)) return;
      const risky = key === "high" ? v >= base.churnedMean : v <= base.churnedMean;
      if (risky) {
        total++;
        churned += labels[i];
      }
    });
    const rate = total > 0 ? churned / total : overall;
    return rate / overall;
  }

  const base = baselines.categorical.get(column);
  const rate = base?.rateByValue.get(key);
  return rate ? rate / overall : 1;
}

/**
 * Tier 3: group at-risk customers by their single top risk factor and emit one
 * actionable recommendation per cohort, largest (most impactful) first.
 */
export function buildRecommendations(
  atRisk: AtRiskCustomer[],
  rows: RawRow[],
  labels: number[],
  mapping: ColumnMapping,
  baselines: Baselines,
): Recommendation[] {
  const groups = new Map<string, AtRiskCustomer[]>();
  for (const cust of atRisk) {
    const tag = cust.reasons[0]?.tag;
    if (!tag || tag === "overall:pattern") continue;
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push(cust);
  }

  const minSize = Math.max(3, Math.round(atRisk.length * 0.02));
  const recs: Recommendation[] = [];

  for (const [tag, cohort] of groups) {
    if (cohort.length < minSize) continue;
    const sep = tag.lastIndexOf(":");
    const column = tag.slice(0, sep);
    const multiplier = cohortMultiplier(tag, rows, labels, baselines);
    const revenueAtRisk = mapping.revenueColumn
      ? cohort.reduce((sum, c) => sum + (c.revenue ?? 0), 0)
      : null;

    const exemplar = cohort[0].reasons.find((r) => r.tag === tag)?.text ?? column;
    const factorPhrase = exemplar.replace(/\.$/, "");

    const revenuePhrase =
      revenueAtRisk && revenueAtRisk > 0
        ? ` That's ${formatCurrency(revenueAtRisk)}/mo of revenue exposed.`
        : "";

    recs.push({
      tag,
      title: `${cohort.length} at-risk customers share: ${column}`,
      body: `${cohort.length} active customers flagged at risk share this trait — ${factorPhrase}. Historically this cohort churns at ${multiplier.toFixed(
        1,
      )}× the overall rate.${revenuePhrase} ${actionFor(column)}`,
      cohortSize: cohort.length,
      churnMultiplier: multiplier,
      revenueAtRisk,
    });
  }

  recs.sort((a, b) => b.cohortSize - a.cohortSize);
  return recs;
}

export { TRUE_TOKENS };
