// Probability calibration for the client-side model — the browser counterpart
// of scikit-learn's CalibratedClassifierCV. SMOTE balances the training folds,
// so the raw model speaks on a ~50/50 scale; calibration maps its scores back
// to the dataset's true churn rate. We fit BOTH Platt (sigmoid) and isotonic
// (PAVA) on out-of-fold predictions and keep whichever has the lower Brier
// score — the same comparison model/build.py runs in Python.

import { applyCalibration, sigmoid, type Calibration } from "./canonical";
import { brierScore } from "./metrics";

export type { Calibration } from "./canonical";
export { applyCalibration } from "./canonical";

/** Platt scaling: fit p = sigmoid(A·margin + B) by Newton/IRLS. */
export function fitPlatt(margins: number[], y: number[]): Calibration {
  let A = 0;
  let B = 0;
  for (let iter = 0; iter < 100; iter++) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 1e-10;
    let h01 = 0;
    let h11 = 1e-10;
    for (let i = 0; i < margins.length; i++) {
      const z = margins[i];
      const p = sigmoid(A * z + B);
      const d = p - y[i];
      const w = Math.max(p * (1 - p), 1e-9);
      g0 += d * z;
      g1 += d;
      h00 += w * z * z;
      h01 += w * z;
      h11 += w;
    }
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-15) break;
    const dA = (h11 * g0 - h01 * g1) / det;
    const dB = (-h01 * g0 + h00 * g1) / det;
    A -= dA;
    B -= dB;
    if (Math.max(Math.abs(dA), Math.abs(dB)) < 1e-10) break;
  }
  return { method: "platt", A, B };
}

/** Isotonic regression by Pool Adjacent Violators on (probability, label). */
export function fitIsotonic(probabilities: number[], y: number[]): Calibration {
  const n = probabilities.length;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => probabilities[a] - probabilities[b],
  );
  const xs = order.map((i) => probabilities[i]);
  const ys = order.map((i) => y[i]);

  // PAVA: merge while the previous block's mean is >= the current value.
  const sum: number[] = [];
  const weight: number[] = [];
  const startX: number[] = [];
  for (let k = 0; k < n; k++) {
    let cs = ys[k];
    let cw = 1;
    let cx = xs[k];
    while (
      sum.length > 0 &&
      sum[sum.length - 1] / weight[weight.length - 1] >= cs / cw
    ) {
      cs += sum.pop()!;
      cw += weight.pop()!;
      cx = startX.pop()!;
    }
    sum.push(cs);
    weight.push(cw);
    startX.push(cx);
  }

  const x: number[] = [];
  const yv: number[] = [];
  for (let b = 0; b < sum.length; b++) {
    const mean = sum[b] / weight[b];
    if (x.length === 0 || startX[b] > x[x.length - 1]) {
      x.push(startX[b]);
      yv.push(mean);
    } else {
      yv[yv.length - 1] = mean; // collapse ties on x, keep the pooled value
    }
  }
  // Extend the last block flat to the maximum observed probability.
  const lastMean = sum[sum.length - 1] / weight[weight.length - 1];
  if (xs[n - 1] > x[x.length - 1]) {
    x.push(xs[n - 1]);
    yv.push(lastMean);
  }
  return { method: "isotonic", x, y: yv };
}

export interface CalibrationChoice {
  calibrator: Calibration;
  method: "platt" | "isotonic";
  brier: number;
  comparison: { platt: number; isotonic: number };
}

/** Fit Platt + isotonic on out-of-fold margins and keep the lower-Brier one. */
export function chooseCalibrator(margins: number[], y: number[]): CalibrationChoice {
  const platt = fitPlatt(margins, y);
  const isotonic = fitIsotonic(margins.map(sigmoid), y);
  const bPlatt = brierScore(y, margins.map((m) => applyCalibration(platt, m)));
  const bIso = brierScore(y, margins.map((m) => applyCalibration(isotonic, m)));
  const useIso = bIso <= bPlatt;
  return {
    calibrator: useIso ? isotonic : platt,
    method: useIso ? "isotonic" : "platt",
    brier: useIso ? bIso : bPlatt,
    comparison: { platt: bPlatt, isotonic: bIso },
  };
}
