// Runs the portable telecom model (model/telecom.model.web.json) natively in
// TypeScript: encodes a raw row exactly as scikit-learn's ColumnTransformer
// would, runs the gradient-boosted trees to a raw margin, applies the chosen
// calibration, and produces exact per-feature SHAP. Held identical to
// scikit-learn + the Python `shap` package to < 1e-6 by scripts/parity.test.ts.
//
// This is the StrokeGuard "no Python at runtime" guarantee, generalized from a
// linear model to a tree ensemble.

import { ensembleMargin, ensembleShap, type ShapTree } from "./treeshap";

interface WebTree {
  children_left: number[];
  children_right: number[];
  feature: number[];
  threshold: number[];
  value: number[];
  cover: number[];
}

export type Calibration =
  | { method: "platt"; A: number; B: number }
  | { method: "isotonic"; x: number[]; y: number[] };

export interface WebModel {
  model_type: string;
  name: string;
  base_margin: number;
  learning_rate: number;
  trees: WebTree[];
  calibration: Calibration;
  population_risk: number;
  risk_bands: { moderate: number; higher: number };
  raw_feature_order: string[];
  numeric_features: string[];
  binary_features: string[];
  categorical_features: string[];
  scaler: Record<string, { mean: number; scale: number }>;
  categories: Record<string, string[]>;
  out_feature_order: string[];
}

export type RiskBand = "Lower" | "Moderate" | "Higher";

export interface CanonicalFactor {
  feature: string;
  value: string | number;
  contribution: number; // log-odds; >0 pushes churn up
  direction: "increases" | "decreases";
}

export interface CanonicalPrediction {
  probability: number;
  percent: number;
  margin: number;
  riskBand: RiskBand;
  baseProbability: number;
  timesAverage: number;
  factors: CanonicalFactor[];
}

export const sigmoid = (z: number): number =>
  z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));

function toShapTrees(model: WebModel): ShapTree[] {
  return model.trees.map((t) => ({
    childrenLeft: t.children_left,
    childrenRight: t.children_right,
    feature: t.feature,
    threshold: t.threshold,
    value: t.value,
    cover: t.cover,
  }));
}

function binaryValue(v: unknown): number {
  const s = String(v).trim().toLowerCase();
  if (s === "yes" || s === "true" || s === "1") return 1;
  if (s === "no" || s === "false" || s === "0") return 0;
  return Number(v);
}

function categoryColumn(categorical: string[], rest: string): string {
  for (const col of categorical) {
    if (rest === col || rest.startsWith(col + "_")) return col;
  }
  return rest;
}

/** Raw row -> the encoded vector the trees index into (ColumnTransformer order). */
export function encodeRow(model: WebModel, row: Record<string, unknown>): number[] {
  return model.out_feature_order.map((name) => {
    const sep = name.indexOf("__");
    const kind = name.slice(0, sep);
    const rest = name.slice(sep + 2);
    if (kind === "numeric") {
      const sc = model.scaler[rest];
      return (Number(row[rest]) - sc.mean) / sc.scale;
    }
    if (kind === "binary") return binaryValue(row[rest]);
    const col = categoryColumn(model.categorical_features, rest);
    const cat = rest.slice(col.length + 1);
    return String(row[col]) === cat ? 1 : 0;
  });
}

export function applyCalibration(cal: Calibration, margin: number): number {
  if (cal.method === "platt") return sigmoid(cal.A * margin + cal.B);
  const p = sigmoid(margin);
  const { x, y } = cal;
  if (p <= x[0]) return y[0];
  if (p >= x[x.length - 1]) return y[y.length - 1];
  let lo = 0;
  let hi = x.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= p) lo = mid;
    else hi = mid;
  }
  const span = x[hi] - x[lo];
  if (span === 0) return y[lo];
  return y[lo] + ((p - x[lo]) / span) * (y[hi] - y[lo]);
}

function rawKeyFor(model: WebModel, outName: string): string {
  const sep = outName.indexOf("__");
  const kind = outName.slice(0, sep);
  const rest = outName.slice(sep + 2);
  if (kind === "numeric" || kind === "binary") return rest;
  return categoryColumn(model.categorical_features, rest);
}

export function rawMargin(model: WebModel, x: number[]): number {
  return ensembleMargin(toShapTrees(model), x, model.base_margin, model.learning_rate);
}

export function predict(model: WebModel, row: Record<string, unknown>): CanonicalPrediction {
  const x = encodeRow(model, row);
  const margin = rawMargin(model, x);
  const probability = applyCalibration(model.calibration, margin);
  const shap = ensembleShap(toShapTrees(model), x, x.length, model.learning_rate);

  const agg = new Map<string, number>();
  model.out_feature_order.forEach((name, j) => {
    const key = rawKeyFor(model, name);
    agg.set(key, (agg.get(key) ?? 0) + shap[j]);
  });

  const factors: CanonicalFactor[] = [...agg.entries()]
    .map(([feature, contribution]) => ({
      feature,
      value: (row[feature] as string | number) ?? "",
      contribution,
      direction: (contribution >= 0 ? "increases" : "decreases") as "increases" | "decreases",
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const band: RiskBand =
    probability < model.risk_bands.moderate
      ? "Lower"
      : probability < model.risk_bands.higher
        ? "Moderate"
        : "Higher";

  return {
    probability,
    percent: Math.round(probability * 100),
    margin,
    riskBand: band,
    baseProbability: model.population_risk,
    timesAverage: probability / model.population_risk,
    factors,
  };
}
