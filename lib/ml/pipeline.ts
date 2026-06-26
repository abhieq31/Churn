// The end-to-end client-side pipeline — the browser counterpart of
// model/build.py, and the single function the Web Worker calls.
//
// Methodology (mirrors the Python research factory, so the live product is held
// to the same standard as the canonical telecom model):
//   1. stratified train/test split — honest held-out metrics
//   2. 5-fold CV with SMOTE fit STRICTLY inside each fold -> ROC-AUC mean±std
//      (the fix for global-SMOTE leakage) and out-of-fold scores for calibration
//   3. calibrate probabilities (Platt vs isotonic, chosen by Brier) — SMOTE
//      balances the folds, calibration maps scores back to the true churn rate
//   4. final model on the full training split; calibrated held-out evaluation
//      (ROC-AUC, Brier, reliability curve, full threshold sweep)
//   5. score active customers; exact per-customer TreeSHAP (risk up/down)
//   6. cohort recommendations

import {
  aggregateImportance,
  buildBaselines,
  buildRecommendations,
  explainCustomer,
} from "./explain";
import { applyCalibration, chooseCalibrator } from "./calibrate";
import { DEFAULT_GBM_OPTIONS, GradientBoosting } from "./gbm";
import {
  auc,
  brierScore,
  calibrationCurve,
  confusionMatrix,
  metricsFrom,
  thresholdSweep,
} from "./metrics";
import {
  analyzeColumns,
  cellToString,
  type Encoder,
  extractLabels,
  fitEncoder,
  stratifiedFolds,
  stratifiedSplit,
} from "./preprocess";
import { Rng } from "./random";
import { smote } from "./smote";
import type {
  AnalysisResult,
  AtRiskCustomer,
  ColumnMapping,
  ColumnType,
  ProgressCallback,
  RawRow,
  ShapContribution,
  ThresholdPoint,
} from "./types";

const TEST_FRACTION = 0.2;
const CV_FOLDS = 5;
const SEED = 42;
// Bound CV cost on large uploads — the AUC estimate + calibration fit are stable
// well below the 100k row cap, and the final model still trains on the full split.
const CV_MAX_ROWS = 8000;
// Customers below this calibrated probability are never "at risk" at any usable
// threshold, so we skip them entirely.
const RISK_FLOOR = 0.02;
// Heuristic reasons (cheap) are built for this many; exact per-customer SHAP
// (heavier) only for the highest-risk SHAP_CAP, which is all the table shows.
const DETAIL_CAP = 2000;
const SHAP_CAP = 400;

export interface PipelineOptions {
  threshold?: number;
  onProgress?: ProgressCallback;
}

function newGbm(): GradientBoosting {
  return new GradientBoosting({ ...DEFAULT_GBM_OPTIONS, seed: SEED });
}

/** SHAP over encoded features -> signed, sorted contributions per CSV column. */
function shapToColumns(
  encoder: Encoder,
  shapValues: number[],
  row: RawRow,
): ShapContribution[] {
  const byColumn = new Map<string, number>();
  encoder.features.forEach((f, j) => {
    byColumn.set(f.sourceColumn, (byColumn.get(f.sourceColumn) ?? 0) + shapValues[j]);
  });
  return [...byColumn.entries()]
    .map(([column, contribution]) => ({
      column,
      value: cellToString(row[column]) || "—",
      contribution,
      direction: (contribution >= 0 ? "increases" : "decreases") as "increases" | "decreases",
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/** Stratified subsample of indices (keeps class balance) capped at `max`. */
function subsample(indices: number[], labels: number[], max: number, rng: Rng): number[] {
  if (indices.length <= max) return indices;
  const byClass = new Map<number, number[]>();
  for (const i of indices) {
    const y = labels[i];
    if (!byClass.has(y)) byClass.set(y, []);
    byClass.get(y)!.push(i);
  }
  const out: number[] = [];
  for (const idxs of byClass.values()) {
    rng.shuffle(idxs);
    const take = Math.max(1, Math.round((idxs.length / indices.length) * max));
    out.push(...idxs.slice(0, take));
  }
  rng.shuffle(out);
  return out;
}

export function runPipeline(
  rows: RawRow[],
  mapping: ColumnMapping,
  options: PipelineOptions = {},
): AnalysisResult {
  const progress = options.onProgress ?? (() => {});
  const rng = new Rng(SEED);

  if (rows.length < 40) {
    throw new Error("Need at least 40 rows to cross-validate a reliable model.");
  }

  progress("preprocessing");
  const labels = extractLabels(rows, mapping);
  const churnCount = labels.reduce((a, b) => a + b, 0);
  if (churnCount < CV_FOLDS || labels.length - churnCount < CV_FOLDS) {
    throw new Error(
      "Need at least a handful of both churned and retained customers to learn from.",
    );
  }

  const columnInfo = analyzeColumns(rows);
  const columnTypes = new Map<string, ColumnType>(columnInfo.map((c) => [c.name, c.type]));

  // 1. Stratified train/test split.
  const { trainIdx, testIdx } = stratifiedSplit(labels, TEST_FRACTION, rng);

  // 2. Cross-validation with SMOTE strictly inside each fold.
  progress("cross-validating");
  const cvIdx = subsample(trainIdx, labels, CV_MAX_ROWS, rng);
  const cvRows = cvIdx.map((i) => rows[i]);
  const cvLabels = cvIdx.map((i) => labels[i]);
  const folds = stratifiedFolds(cvLabels, CV_FOLDS, rng);
  const oofMargin = new Array<number>(cvIdx.length).fill(0);
  const perFold: number[] = [];

  for (const valPos of folds) {
    const inVal = new Set(valPos);
    const trainPos = cvRows.map((_, p) => p).filter((p) => !inVal.has(p));
    const foldEncoder = fitEncoder(trainPos.map((p) => cvRows[p]), mapping);
    const balanced = smote(
      foldEncoder.transform(trainPos.map((p) => cvRows[p])),
      trainPos.map((p) => cvLabels[p]),
      rng,
    );
    const foldModel = newGbm();
    foldModel.train(balanced.X, balanced.y);
    const valX = foldEncoder.transform(valPos.map((p) => cvRows[p]));
    const valMargins = valX.map((x) => foldModel.predictMargin(x));
    valPos.forEach((p, k) => (oofMargin[p] = valMargins[k]));
    perFold.push(auc(valPos.map((p) => cvLabels[p]), valMargins));
  }
  const cvMean = perFold.reduce((a, b) => a + b, 0) / perFold.length;
  const cvStd = Math.sqrt(
    perFold.reduce((a, b) => a + (b - cvMean) * (b - cvMean), 0) / perFold.length,
  );

  // 3. Calibrate on the out-of-fold scores (Platt vs isotonic, chosen by Brier).
  progress("calibrating");
  const calib = chooseCalibrator(oofMargin, cvLabels);

  // 4. Final model on the full training split.
  progress("training-model");
  const encoder = fitEncoder(trainIdx.map((i) => rows[i]), mapping);
  const balanced = smote(encoder.transform(trainIdx.map((i) => rows[i])), trainIdx.map((i) => labels[i]), rng);
  const model = newGbm();
  model.train(balanced.X, balanced.y);

  // 5. Honest held-out evaluation on calibrated probabilities.
  progress("evaluating");
  const testRows = testIdx.map((i) => rows[i]);
  const testLabels = testIdx.map((i) => labels[i]);
  const testProba = encoder
    .transform(testRows)
    .map((x) => applyCalibration(calib.calibrator, model.predictMargin(x)));
  const sweep = thresholdSweep(testLabels, testProba);
  const threshold = options.threshold ?? operatingThreshold(sweep);
  const testPred = testProba.map((p) => (p >= threshold ? 1 : 0));
  const metrics = metricsFrom(confusionMatrix(testLabels, testPred), testLabels.length);
  metrics.auc = auc(testLabels, testProba);
  const brier = brierScore(testLabels, testProba);
  const reliability = calibrationCurve(testLabels, testProba);

  // 6. Score every customer with the final calibrated model.
  progress("scoring-customers");
  const XAll = encoder.transform(rows);
  const allProba = XAll.map((x) => applyCalibration(calib.calibrator, model.predictMargin(x)));

  const activeProbabilities: number[] = [];
  const activeRevenue: number[] = [];
  const hasRevenue = !!mapping.revenueColumn;
  const detailIdx: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (labels[i] === 1) continue; // already churned
    activeProbabilities.push(allProba[i]);
    if (hasRevenue) {
      const rev = Number(rows[i][mapping.revenueColumn as string]);
      activeRevenue.push(Number.isFinite(rev) ? rev : 0);
    }
    if (allProba[i] >= RISK_FLOOR) detailIdx.push(i);
  }
  detailIdx.sort((a, b) => allProba[b] - allProba[a]);

  // 7. Explanations: heuristic reasons + exact per-customer TreeSHAP.
  progress("generating-explanations");
  const importances = model.featureImportances();
  const rankedColumns = aggregateImportance(encoder.features, importances);
  const baselines = buildBaselines(rows, labels, mapping, columnTypes);

  const atRiskCustomers: AtRiskCustomer[] = detailIdx.slice(0, DETAIL_CAP).map((i, rank) => {
    const shap = rank < SHAP_CAP ? shapToColumns(encoder, model.shapValues(XAll[i]), rows[i]) : [];
    return explainCustomer(rows[i], i, allProba[i], mapping, baselines, rankedColumns, shap);
  });

  const recommendations = buildRecommendations(atRiskCustomers, rows, labels, mapping, baselines);

  const atRiskCount = activeProbabilities.filter((p) => p >= threshold).length;
  const revenueAtRisk = hasRevenue
    ? activeProbabilities.reduce((sum, p, k) => (p >= threshold ? sum + activeRevenue[k] : sum), 0)
    : null;

  progress("complete");

  return {
    summary: {
      totalCustomers: rows.length,
      historicalChurnCount: churnCount,
      historicalChurnRate: churnCount / rows.length,
      atRiskCount,
      revenueAtRisk,
      modelAccuracy: metrics.accuracy,
      modelPrecision: metrics.precision,
      modelRecall: metrics.recall,
      modelF1: metrics.f1,
      modelAuc: metrics.auc,
      cvAucMean: cvMean,
      cvAucStd: cvStd,
      brier,
      modelName: model.name,
    },
    metrics,
    atRiskCustomers,
    recommendations,
    globalImportance: rankedColumns,
    mapping,
    threshold,
    cvAuc: { mean: cvMean, std: cvStd, folds: CV_FOLDS, perFold },
    calibration: {
      method: calib.method,
      brier,
      comparison: calib.comparison,
      curve: reliability,
    },
    thresholdSweep: sweep,
    activeProbabilities,
    activeRevenue: hasRevenue ? activeRevenue : null,
    generatedAt: new Date().toISOString(),
  };
}

/** The F1-optimal threshold from the sweep, clamped to a usable band. */
function operatingThreshold(sweep: ThresholdPoint[]): number {
  let best = sweep[0];
  for (const p of sweep) if (p.f1 > best.f1) best = p;
  return Math.min(0.8, Math.max(0.1, best.threshold));
}
