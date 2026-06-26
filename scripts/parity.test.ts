// Proves the browser's TypeScript port of the telecom model is identical to
// scikit-learn + the Python `shap` package — encoding, gradient-boosted
// inference, exact TreeSHAP, and calibration — to < 1e-6, on fixtures emitted
// by model/build.py. Run by build.sh after every train.
//
//   npx tsx scripts/parity.test.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCalibration, encodeRow, rawMargin, type WebModel } from "../lib/ml/canonical";
import { ensembleShap } from "../lib/ml/treeshap";

const ROOT = join(__dirname, "..");
const model: WebModel = JSON.parse(
  readFileSync(join(ROOT, "model/telecom.model.web.json"), "utf8"),
);
const fixtures = JSON.parse(
  readFileSync(join(ROOT, "model/telecom.shap_fixtures.json"), "utf8"),
) as {
  base_value: number;
  cases: { row: Record<string, unknown>; encoded: number[]; margin: number; proba: number; shap: number[] }[];
};

const TOL = 1e-6;
let worstEncode = 0;
let worstMargin = 0;
let worstShap = 0;
let worstProba = 0;
let worstAdditive = 0;

const toShapTrees = (m: WebModel) =>
  m.trees.map((t) => ({
    childrenLeft: t.children_left,
    childrenRight: t.children_right,
    feature: t.feature,
    threshold: t.threshold,
    value: t.value,
    cover: t.cover,
  }));

for (const c of fixtures.cases) {
  const x = encodeRow(model, c.row);
  for (let i = 0; i < x.length; i++) {
    worstEncode = Math.max(worstEncode, Math.abs(x[i] - c.encoded[i]));
  }

  const margin = rawMargin(model, c.encoded);
  worstMargin = Math.max(worstMargin, Math.abs(margin - c.margin));

  const shap = ensembleShap(toShapTrees(model), c.encoded, c.encoded.length, model.learning_rate);
  for (let i = 0; i < shap.length; i++) {
    worstShap = Math.max(worstShap, Math.abs(shap[i] - c.shap[i]));
  }

  const sum = shap.reduce((a, b) => a + b, 0);
  worstAdditive = Math.max(worstAdditive, Math.abs(fixtures.base_value + sum - c.margin));

  const proba = applyCalibration(model.calibration, c.margin);
  worstProba = Math.max(worstProba, Math.abs(proba - c.proba));
}

const rows: [string, number][] = [
  ["encoding (vs ColumnTransformer)", worstEncode],
  ["margin (vs decision_function)", worstMargin],
  ["TreeSHAP (vs shap package)", worstShap],
  ["additivity (base + Σshap == margin)", worstAdditive],
  ["calibration (vs isotonic/Platt)", worstProba],
];

console.log(`TS port parity over ${fixtures.cases.length} fixtures:`);
let failed = false;
for (const [label, worst] of rows) {
  const ok = worst < TOL;
  failed = failed || !ok;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(40)} ${worst.toExponential(2)}`);
}

if (failed) {
  console.error("\n✗ TS port diverges from scikit-learn (> 1e-6)");
  process.exit(1);
}
console.log("\n✓ TS port matches scikit-learn + shap within 1e-6");
