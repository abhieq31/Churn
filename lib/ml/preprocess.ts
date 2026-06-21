// Preprocessing: column-type detection, churn/revenue auto-detection, and a
// leakage-safe encoder. Imputation and scaling statistics are ALWAYS fit on the
// training split only, then applied unchanged to the test split.

import { Rng } from "./random";
import type {
  ColumnInfo,
  ColumnMapping,
  ColumnType,
  EncodedFeature,
  RawRow,
} from "./types";

const TRUE_TOKENS = new Set(["yes", "true", "1", "y", "t", "churn", "churned"]);
const FALSE_TOKENS = new Set(["no", "false", "0", "n", "f", "active", "retained"]);

const MISSING = "__missing__";

export function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function parseNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = cellToString(v).replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function isMissing(v: unknown): boolean {
  const s = cellToString(v).toLowerCase();
  return s === "" || s === "na" || s === "n/a" || s === "null" || s === "none";
}

/** Classify every column so the mapping UI can pre-fill sensible defaults. */
export function analyzeColumns(rows: RawRow[]): ColumnInfo[] {
  if (rows.length === 0) return [];
  const columns = Object.keys(rows[0]);
  const sampleSize = Math.min(rows.length, 2000);

  return columns.map((name) => {
    const distinct = new Set<string>();
    let missingCount = 0;
    let numericCount = 0;
    let nonMissing = 0;
    const sampleValues: string[] = [];

    for (let i = 0; i < sampleSize; i++) {
      const raw = rows[i][name];
      if (isMissing(raw)) {
        missingCount++;
        continue;
      }
      nonMissing++;
      const s = cellToString(raw);
      if (distinct.size < 200) distinct.add(s);
      if (sampleValues.length < 5 && !sampleValues.includes(s)) sampleValues.push(s);
      if (!Number.isNaN(parseNumber(raw))) numericCount++;
    }

    const distinctValues = distinct.size;
    const numericRatio = nonMissing > 0 ? numericCount / nonMissing : 0;
    const lowerDistinct = new Set([...distinct].map((d) => d.toLowerCase()));
    const looksBoolean =
      distinctValues <= 2 &&
      [...lowerDistinct].every((d) => TRUE_TOKENS.has(d) || FALSE_TOKENS.has(d));

    let type: ColumnType;
    if (looksBoolean) {
      type = "boolean";
    } else if (numericRatio >= 0.9) {
      // Mostly-numeric. If almost every value is unique it's an identifier, not a feature.
      type = distinctValues > 0.95 * nonMissing && nonMissing > 20 ? "identifier" : "numeric";
    } else if (distinctValues >= 0.95 * nonMissing && nonMissing > 20) {
      type = "identifier";
    } else if (distinctValues <= 50) {
      type = "categorical";
    } else {
      // High-cardinality free text — treat as identifier (excluded from features).
      type = "identifier";
    }

    return {
      name,
      type,
      distinctValues,
      missingCount,
      sampleValues,
      values: distinctValues <= 50 ? [...distinct] : [],
    };
  });
}

const CHURN_NAME_HINTS = [
  "churn",
  "churned",
  "cancelled",
  "canceled",
  "exited",
  "attrition",
  "status",
  "active",
  "retained",
  "is_active",
  "subscription_status",
  "left",
];

const REVENUE_NAME_HINTS = [
  "mrr",
  "monthlycharge",
  "monthly_charge",
  "monthlycharges",
  "price",
  "revenue",
  "amount",
  "subscriptionvalue",
  "plan_price",
  "planprice",
  "totalcharge",
  "monthly",
];

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, "");
}

/** Score each column as the likely churn label; returns the best guess. */
export function detectChurnColumn(rows: RawRow[], columns: ColumnInfo[]): string | null {
  let best: { name: string; score: number } | null = null;

  for (const col of columns) {
    if (col.type === "identifier" || col.type === "numeric") continue;
    const norm = normalizeName(col.name);
    let score = 0;
    for (const hint of CHURN_NAME_HINTS) {
      if (norm === normalizeName(hint)) score += 6;
      else if (norm.includes(normalizeName(hint))) score += 3;
    }
    // A binary column whose minority class is in a plausible churn-rate band is a strong signal.
    if (col.distinctValues === 2) {
      const rate = minorityRate(rows, col.name);
      if (rate >= 0.02 && rate <= 0.6) score += 2;
      if (col.type === "boolean") score += 1;
    }
    if (best === null || score > best.score) best = { name: col.name, score };
  }

  return best && best.score > 0 ? best.name : null;
}

function minorityRate(rows: RawRow[], column: string): number {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (isMissing(row[column])) continue;
    const key = cellToString(row[column]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }
  if (total === 0 || counts.size === 0) return 0;
  const min = Math.min(...counts.values());
  return min / total;
}

/** Given the churn column, guess which value means "churned" (the minority / truthy value). */
export function detectChurnPositiveValue(rows: RawRow[], churnColumn: string): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (isMissing(row[churnColumn])) continue;
    const key = cellToString(row[churnColumn]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()];
  // Prefer an explicit truthy token if present.
  const truthy = entries.find(([v]) => TRUE_TOKENS.has(v.toLowerCase()));
  if (truthy) return truthy[0];
  const cancelled = entries.find(([v]) =>
    ["cancelled", "canceled", "exited", "left", "churn", "churned", "inactive"].includes(
      v.toLowerCase(),
    ),
  );
  if (cancelled) return cancelled[0];
  // Otherwise the minority value (churn is virtually always the minority class).
  entries.sort((a, b) => a[1] - b[1]);
  return entries.length > 0 ? entries[0][0] : "";
}

export function detectRevenueColumn(columns: ColumnInfo[]): string | null {
  for (const col of columns) {
    if (col.type !== "numeric") continue;
    const norm = normalizeName(col.name);
    if (REVENUE_NAME_HINTS.some((h) => norm.includes(normalizeName(h)))) return col.name;
  }
  return null;
}

/** Build a default mapping from auto-detection. */
export function buildDefaultMapping(rows: RawRow[]): ColumnMapping | null {
  const columns = analyzeColumns(rows);
  const churnColumn = detectChurnColumn(rows, columns);
  if (!churnColumn) return null;
  const churnPositiveValue = detectChurnPositiveValue(rows, churnColumn);
  const revenueColumn = detectRevenueColumn(columns);
  const idColumn =
    columns.find((c) => c.type === "identifier")?.name ?? null;

  const featureColumns = columns
    .filter(
      (c) =>
        c.name !== churnColumn &&
        c.name !== idColumn &&
        c.type !== "identifier",
    )
    .map((c) => c.name);

  return { churnColumn, churnPositiveValue, revenueColumn, idColumn, featureColumns };
}

/** Turn the churn column into a 0/1 label array (1 = churned). */
export function extractLabels(rows: RawRow[], mapping: ColumnMapping): number[] {
  const positive = mapping.churnPositiveValue.toLowerCase();
  return rows.map((row) =>
    cellToString(row[mapping.churnColumn]).toLowerCase() === positive ? 1 : 0,
  );
}

interface NumericStat {
  median: number;
  mean: number;
  std: number;
}

/** A fitted encoder: holds transform stats so train/test/scoring all use the SAME mapping. */
export interface Encoder {
  features: EncodedFeature[];
  numericColumns: string[];
  booleanColumns: string[];
  categoricalColumns: string[];
  numericStats: Record<string, NumericStat>;
  categories: Record<string, string[]>;
  transform(rows: RawRow[]): number[][];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function boolToNum(v: unknown): number {
  const s = cellToString(v).toLowerCase();
  if (TRUE_TOKENS.has(s)) return 1;
  if (FALSE_TOKENS.has(s)) return 0;
  // Unknown token: fall back to 0 (treated as the negative/base level).
  return 0;
}

/**
 * Fit an encoder on the training rows only. Categorical columns are one-hot
 * encoded; booleans become a single 0/1 feature; numerics are median-imputed
 * then standardized. All statistics come from `trainRows`.
 */
export function fitEncoder(trainRows: RawRow[], mapping: ColumnMapping): Encoder {
  const info = analyzeColumns(trainRows);
  const typeByName = new Map(info.map((c) => [c.name, c.type]));

  const numericColumns: string[] = [];
  const booleanColumns: string[] = [];
  const categoricalColumns: string[] = [];

  for (const col of mapping.featureColumns) {
    const t = typeByName.get(col);
    if (t === "numeric") numericColumns.push(col);
    else if (t === "boolean") booleanColumns.push(col);
    else if (t === "categorical") categoricalColumns.push(col);
    // identifiers are ignored
  }

  const numericStats: Record<string, NumericStat> = {};
  for (const col of numericColumns) {
    const present = trainRows
      .map((r) => parseNumber(r[col]))
      .filter((n) => !Number.isNaN(n));
    const med = median(present);
    const filled = trainRows.map((r) => {
      const n = parseNumber(r[col]);
      return Number.isNaN(n) ? med : n;
    });
    const mean = filled.reduce((a, b) => a + b, 0) / Math.max(filled.length, 1);
    const variance =
      filled.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(filled.length, 1);
    const std = Math.sqrt(variance) || 1;
    numericStats[col] = { median: med, mean, std };
  }

  const categories: Record<string, string[]> = {};
  for (const col of categoricalColumns) {
    const set = new Set<string>();
    for (const r of trainRows) {
      set.add(isMissing(r[col]) ? MISSING : cellToString(r[col]));
    }
    if (![...set].includes(MISSING)) set.add(MISSING);
    // Cap categories to keep the matrix sane on very wide columns.
    categories[col] = [...set].slice(0, 60);
  }

  const features: EncodedFeature[] = [];
  for (const col of numericColumns) {
    features.push({ name: col, sourceColumn: col, kind: "numeric" });
  }
  for (const col of booleanColumns) {
    features.push({ name: col, sourceColumn: col, kind: "numeric" });
  }
  for (const col of categoricalColumns) {
    for (const cat of categories[col]) {
      features.push({
        name: `${col} = ${cat === MISSING ? "(missing)" : cat}`,
        sourceColumn: col,
        kind: "onehot",
        category: cat,
      });
    }
  }

  const transform = (rows: RawRow[]): number[][] => {
    return rows.map((row) => {
      const vec: number[] = [];
      for (const col of numericColumns) {
        const { median: med, mean, std } = numericStats[col];
        let n = parseNumber(row[col]);
        if (Number.isNaN(n)) n = med;
        vec.push((n - mean) / std);
      }
      for (const col of booleanColumns) {
        vec.push(boolToNum(row[col]));
      }
      for (const col of categoricalColumns) {
        const value = isMissing(row[col]) ? MISSING : cellToString(row[col]);
        for (const cat of categories[col]) {
          vec.push(value === cat ? 1 : 0);
        }
      }
      return vec;
    });
  };

  return {
    features,
    numericColumns,
    booleanColumns,
    categoricalColumns,
    numericStats,
    categories,
    transform,
  };
}

export interface Split {
  trainIdx: number[];
  testIdx: number[];
}

/** Stratified train/test split on the label so both halves keep the real churn rate. */
export function stratifiedSplit(labels: number[], testFraction: number, rng: Rng): Split {
  const byClass = new Map<number, number[]>();
  labels.forEach((y, i) => {
    if (!byClass.has(y)) byClass.set(y, []);
    byClass.get(y)!.push(i);
  });

  const trainIdx: number[] = [];
  const testIdx: number[] = [];
  for (const idxs of byClass.values()) {
    rng.shuffle(idxs);
    const nTest = Math.max(1, Math.round(idxs.length * testFraction));
    testIdx.push(...idxs.slice(0, nTest));
    trainIdx.push(...idxs.slice(nTest));
  }
  rng.shuffle(trainIdx);
  rng.shuffle(testIdx);
  return { trainIdx, testIdx };
}

export { MISSING, isMissing, boolToNum };
