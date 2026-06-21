// SMOTE (Synthetic Minority Over-sampling Technique).
//
// CRITICAL: this must run on the TRAINING split only, AFTER the train/test split.
// Synthesising neighbours using any test-set point would leak information and
// inflate the reported metrics. The pipeline enforces this ordering.

import { Rng } from "./random";

export interface BalancedSet {
  X: number[][];
  y: number[];
  /** How many synthetic minority rows were created (0 if the data was already balanced). */
  syntheticCount: number;
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum; // squared distance is fine for nearest-neighbour ranking
}

/**
 * Oversample the minority class (label = 1) up to parity with the majority class
 * by interpolating between a minority point and one of its k nearest minority
 * neighbours: x_new = x + r * (x' - x), r ~ U(0,1).
 */
export function smote(
  X: number[][],
  y: number[],
  rng: Rng,
  k = 5,
): BalancedSet {
  const minority: number[][] = [];
  for (let i = 0; i < X.length; i++) if (y[i] === 1) minority.push(X[i]);
  const majorityCount = y.length - minority.length;
  const needed = majorityCount - minority.length;

  // Already balanced (or minority is actually the majority), or too few to interpolate.
  if (needed <= 0 || minority.length < 2) {
    return { X: [...X], y: [...y], syntheticCount: 0 };
  }

  const kEff = Math.max(1, Math.min(k, minority.length - 1));

  // Precompute k nearest neighbours within the minority class.
  const neighbours: number[][] = minority.map((point, i) => {
    const dists = minority.map((other, j) => ({ j, d: j === i ? Infinity : euclidean(point, other) }));
    dists.sort((a, b) => a.d - b.d);
    return dists.slice(0, kEff).map((e) => e.j);
  });

  const synthX: number[][] = [];
  for (let s = 0; s < needed; s++) {
    const i = rng.int(minority.length);
    const base = minority[i];
    const neighbour = minority[rng.pick(neighbours[i])];
    const r = rng.next();
    const newPoint = base.map((v, d) => v + r * (neighbour[d] - v));
    synthX.push(newPoint);
  }

  const outX = [...X, ...synthX];
  const outY = [...y, ...synthX.map(() => 1)];

  // Shuffle so synthetic rows aren't clustered at the end.
  const order = outX.map((_, i) => i);
  rng.shuffle(order);
  return {
    X: order.map((i) => outX[i]),
    y: order.map((i) => outY[i]),
    syntheticCount: synthX.length,
  };
}
