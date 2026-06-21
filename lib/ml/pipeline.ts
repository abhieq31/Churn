// The end-to-end pipeline. This is the single function the Web Worker calls.
//
// Order matters for correctness:
//   1. split (stratified)        -> train / test indices
//   2. fit encoder on TRAIN only -> no leakage of test statistics
//   3. SMOTE on TRAIN only       -> balance classes without touching test
//   4. train forest on balanced train
//   5. evaluate on untouched TEST -> honest metrics
//   6. score active customers     -> actionable at-risk list
//   7. explain                    -> per-customer reasons + recommendations

import {
  aggregateImportance,
  buildBaselines,
  buildRecommendations,
  explainCustomer,
} from "./explain";
import { DEFAULT_GBM_OPTIONS, GradientBoosting } from "./gbm";
import { evaluate } from "./metrics";
import type { ChurnModel } from "./model";
import {
  analyzeColumns,
  extractLabels,
  fitEncoder,
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
} from "./types";

const TEST_FRACTION = 0.2;
const SEED = 42;

export interface PipelineOptions {
  threshold?: number;
  onProgress?: ProgressCallback;
}

export function runPipeline(
  rows: RawRow[],
  mapping: ColumnMapping,
  options: PipelineOptions = {},
): AnalysisResult {
  // After SMOTE balances the classes, 0.5 is the principled decision threshold.
  const threshold = options.threshold ?? 0.5;
  const progress = options.onProgress ?? (() => {});
  const rng = new Rng(SEED);

  if (rows.length < 20) {
    throw new Error("Need at least 20 rows to build a reliable model.");
  }

  progress("preprocessing");
  const labels = extractLabels(rows, mapping);
  const churnCount = labels.reduce((a, b) => a + b, 0);
  if (churnCount === 0 || churnCount === labels.length) {
    throw new Error(
      "The churn column has only one outcome — need both churned and retained customers to learn from.",
    );
  }

  const columnInfo = analyzeColumns(rows);
  const columnTypes = new Map<string, ColumnType>(columnInfo.map((c) => [c.name, c.type]));

  // 1. Stratified split into train (80%) and test (20%).
  const { trainIdx, testIdx } = stratifiedSplit(labels, TEST_FRACTION, rng);
  const labelsTrain = trainIdx.map((i) => labels[i]);

  // 2. Fit encoder on the training rows only (no leakage of test stats).
  const encoder = fitEncoder(
    trainIdx.map((i) => rows[i]),
    mapping,
  );

  // 3. SMOTE on the training set only, after the split.
  progress("balancing-classes");
  const balanced = smote(encoder.transform(trainIdx.map((i) => rows[i])), labelsTrain, rng);

  // 4. Train the model. We use Gradient Boosting — the boosting family that won
  //    our IEEE benchmark (XGBoost, 94%). After SMOTE the classes are balanced,
  //    so the principled decision threshold is 0.5.
  progress("training-model");
  const model: ChurnModel = new GradientBoosting({ ...DEFAULT_GBM_OPTIONS, seed: SEED });
  model.train(balanced.X, balanced.y);

  // 5. Evaluate on the untouched test set.
  progress("evaluating");
  const yTest = testIdx.map((i) => labels[i]);
  const testProba = model.predictProbaBatch(encoder.transform(testIdx.map((i) => rows[i])));
  const metrics = evaluate(yTest, testProba, threshold);

  // 6. Score every currently-active customer (label = retained) for the at-risk list.
  progress("scoring-customers");
  const XAll = encoder.transform(rows);
  const allProba = XAll.map((x) => model.predictProba(x));

  // 7. Explanations.
  progress("generating-explanations");
  const importances = model.featureImportances();
  const rankedColumns = aggregateImportance(encoder.features, importances);
  const baselines = buildBaselines(rows, labels, mapping, columnTypes);

  const atRiskCustomers: AtRiskCustomer[] = [];
  for (let i = 0; i < rows.length; i++) {
    // Only flag customers who are still active (haven't already churned).
    if (labels[i] === 1) continue;
    if (allProba[i] < threshold) continue;
    atRiskCustomers.push(
      explainCustomer(rows[i], i, allProba[i], mapping, baselines, rankedColumns),
    );
  }
  atRiskCustomers.sort((a, b) => b.probability - a.probability);

  const recommendations = buildRecommendations(
    atRiskCustomers,
    rows,
    labels,
    mapping,
    baselines,
  );

  const revenueAtRisk = mapping.revenueColumn
    ? atRiskCustomers.reduce((sum, c) => sum + (c.revenue ?? 0), 0)
    : null;

  progress("complete");

  return {
    summary: {
      totalCustomers: rows.length,
      historicalChurnCount: churnCount,
      historicalChurnRate: churnCount / rows.length,
      atRiskCount: atRiskCustomers.length,
      revenueAtRisk,
      modelAccuracy: metrics.accuracy,
      modelPrecision: metrics.precision,
      modelRecall: metrics.recall,
      modelF1: metrics.f1,
      modelAuc: metrics.auc,
      modelName: model.name,
    },
    metrics,
    atRiskCustomers,
    recommendations,
    globalImportance: rankedColumns,
    mapping,
    threshold,
    generatedAt: new Date().toISOString(),
  };
}
