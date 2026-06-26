// Classification metrics. Always computed on the untouched, original-distribution
// test set — never on SMOTE-balanced data (that would inflate the numbers).

import type { CalibrationBin, ConfusionMatrix, Metrics, ThresholdPoint } from "./types";

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

/** Mean squared error of probabilistic predictions — lower is better-calibrated. */
export function brierScore(yTrue: number[], probabilities: number[]): number {
  if (yTrue.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const d = probabilities[i] - yTrue[i];
    s += d * d;
  }
  return s / yTrue.length;
}

/** Reliability-diagram bins: predicted vs observed churn rate across [0,1]. */
export function calibrationCurve(
  yTrue: number[],
  probabilities: number[],
  bins = 10,
): CalibrationBin[] {
  const out: CalibrationBin[] = [];
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    let sumP = 0;
    let sumY = 0;
    let count = 0;
    for (let i = 0; i < yTrue.length; i++) {
      const p = probabilities[i];
      const inBin = b === bins - 1 ? p >= lo && p <= hi : p >= lo && p < hi;
      if (inBin) {
        sumP += p;
        sumY += yTrue[i];
        count++;
      }
    }
    if (count > 0) out.push({ pred: sumP / count, obs: sumY / count, count });
  }
  return out;
}

/** Precision / recall / F1 / flag-count across decision thresholds. */
export function thresholdSweep(
  yTrue: number[],
  probabilities: number[],
  steps = 99,
): ThresholdPoint[] {
  const out: ThresholdPoint[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / (steps + 1);
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let flagged = 0;
    for (let i = 0; i < yTrue.length; i++) {
      const pred = probabilities[i] >= t ? 1 : 0;
      if (pred === 1) flagged++;
      if (pred === 1 && yTrue[i] === 1) tp++;
      else if (pred === 1 && yTrue[i] === 0) fp++;
      else if (pred === 0 && yTrue[i] === 1) fn++;
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    out.push({ threshold: t, precision, recall, f1, flagged });
  }
  return out;
}
