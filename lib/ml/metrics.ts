// Classification metrics. Always computed on the untouched, original-distribution
// test set — never on SMOTE-balanced data (that would inflate the numbers).

import type { ConfusionMatrix, Metrics } from "./types";

/** Build a confusion matrix treating class 1 (churn) as the positive class. */
export function confusionMatrix(
  yTrue: number[],
  yPred: number[],
): ConfusionMatrix {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const actual = yTrue[i];
    const pred = yPred[i];
    if (pred === 1 && actual === 1) tp++;
    else if (pred === 1 && actual === 0) fp++;
    else if (pred === 0 && actual === 0) tn++;
    else fn++;
  }
  return { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn };
}

export function metricsFrom(cm: ConfusionMatrix, testSize: number): Metrics {
  const { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn } = cm;
  const total = tp + fp + tn + fn || 1;
  const accuracy = (tp + tn) / total;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { accuracy, precision, recall, f1, auc: 0, confusion: cm, testSize };
}

/** Convenience: probabilities -> metrics at a decision threshold. */
export function evaluate(
  yTrue: number[],
  probabilities: number[],
  threshold = 0.5,
): Metrics {
  const yPred = probabilities.map((p) => (p >= threshold ? 1 : 0));
  const m = metricsFrom(confusionMatrix(yTrue, yPred), yTrue.length);
  m.auc = auc(yTrue, probabilities);
  return m;
}

/** F1 at a given threshold (used for automatic threshold/model selection). */
export function f1At(yTrue: number[], probabilities: number[], threshold: number): number {
  const yPred = probabilities.map((p) => (p >= threshold ? 1 : 0));
  return metricsFrom(confusionMatrix(yTrue, yPred), yTrue.length).f1;
}

/** Scan thresholds and return the one maximising F1 (defaults to 0.5 if degenerate). */
export function bestThresholdByF1(
  yTrue: number[],
  probabilities: number[],
): { threshold: number; f1: number } {
  let best = { threshold: 0.5, f1: f1At(yTrue, probabilities, 0.5) };
  for (let t = 0.05; t <= 0.95; t += 0.01) {
    const f1 = f1At(yTrue, probabilities, t);
    if (f1 > best.f1) best = { threshold: +t.toFixed(2), f1 };
  }
  return best;
}

/**
 * ROC AUC via the rank (Mann–Whitney U) method, with tie-aware average ranks.
 * Matches the "Area Under Curve" column reported in the paper.
 */
export function auc(yTrue: number[], scores: number[]): number {
  const n = yTrue.length;
  const pos = yTrue.reduce((a, b) => a + b, 0);
  const neg = n - pos;
  if (pos === 0 || neg === 0) return 0.5;

  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => scores[a] - scores[b],
  );
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scores[order[j + 1]] === scores[order[i]]) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based average rank for ties
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }
  let sumPosRanks = 0;
  for (let idx = 0; idx < n; idx++) if (yTrue[idx] === 1) sumPosRanks += ranks[idx];
  return (sumPosRanks - (pos * (pos + 1)) / 2) / (pos * neg);
}
