// Throwaway smoke test: runs the full ML pipeline against the synthetic sample
// data and prints metrics, importances, explanations and recommendations.
// Run with: npx tsx scripts/smoke.ts

import { buildDefaultMapping } from "../lib/ml/preprocess";
import { runPipeline } from "../lib/ml/pipeline";
import { generateSampleData } from "../lib/sampleData";

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

const t0 = Date.now();
const rows = generateSampleData(4000);

// Sanity-check the generated distributions match the paper's findings.
const churn = rows.filter((r) => r.Churn === "Yes").length;
console.log("=== Sample data sanity ===");
console.log(`Rows: ${rows.length}, churn rate: ${pct(churn / rows.length)} (target ~14.6%)`);

const intlYes = rows.filter((r) => r["International plan"] === "Yes");
const intlNo = rows.filter((r) => r["International plan"] === "No");
const churnRate = (arr: typeof rows) =>
  arr.filter((r) => r.Churn === "Yes").length / arr.length;
console.log(
  `Intl plan churn: Yes=${pct(churnRate(intlYes))} vs No=${pct(churnRate(intlNo))} (Yes should be much higher)`,
);
for (const bucket of [0, 1, 2, 3, 4, 5]) {
  const grp = rows.filter((r) => Number(r["Customer service calls"]) === bucket);
  if (grp.length) console.log(`  service calls = ${bucket}: churn ${pct(churnRate(grp))} (n=${grp.length})`);
}

console.log("\n=== Auto-detected mapping ===");
const mapping = buildDefaultMapping(rows);
if (!mapping) throw new Error("Failed to auto-detect churn column");
console.log(mapping);

console.log("\n=== Running pipeline ===");
const tPipe = Date.now();
const result = runPipeline(rows, mapping, {
  onProgress: (stage) => console.log(`  stage: ${stage}`),
});
console.log(`  pipeline took ${Date.now() - tPipe}ms`);

console.log("\n=== Model metrics (held-out test set) ===");
console.log(`Selected:  ${result.summary.modelName} (threshold ${result.threshold.toFixed(2)})`);
console.log(
  `CV ROC-AUC: ${result.cvAuc.mean.toFixed(3)} ± ${result.cvAuc.std.toFixed(3)} (${result.cvAuc.folds}-fold, SMOTE in-fold)`,
);
console.log(`Holdout AUC: ${result.summary.modelAuc.toFixed(3)}`);
console.log(
  `Calibration: ${result.calibration.method} (Brier ${result.calibration.brier.toFixed(4)}; platt ${result.calibration.comparison.platt.toFixed(4)} vs iso ${result.calibration.comparison.isotonic.toFixed(4)})`,
);
console.log(`Accuracy:  ${pct(result.summary.modelAccuracy)}`);
console.log(`Precision: ${pct(result.summary.modelPrecision)}`);
console.log(`Recall:    ${pct(result.summary.modelRecall)}`);
console.log(`F1:        ${pct(result.summary.modelF1)}`);
console.log(`Confusion: ${JSON.stringify(result.metrics.confusion)}`);

console.log("\n=== Top global importance ===");
result.globalImportance.slice(0, 6).forEach((c) => console.log(`  ${c.column}: ${pct(c.importance)}`));

console.log(`\n=== At-risk customers: ${result.summary.atRiskCount} ===`);
result.atRiskCustomers.slice(0, 3).forEach((c) => {
  console.log(`\n  ${c.label} — churn probability ${pct(c.probability)}`);
  console.log("    SHAP (risk up/down):");
  c.shap.slice(0, 4).forEach((s) =>
    console.log(`      ${s.direction === "increases" ? "▲" : "▼"} ${s.column} (${s.value}) ${s.contribution >= 0 ? "+" : ""}${s.contribution.toFixed(3)}`),
  );
});

console.log(`\n=== Recommendations: ${result.recommendations.length} ===`);
result.recommendations.forEach((r) => console.log(`\n  ▸ ${r.title}\n    ${r.body}`));

console.log(`\nRevenue at risk: ${result.summary.revenueAtRisk}`);
console.log(`\nDone in ${Date.now() - t0}ms`);
