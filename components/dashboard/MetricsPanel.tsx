"use client";

import type { AnalysisResult } from "@/lib/ml/types";
import { Card } from "@/components/ui/primitives";

function MetricBar({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-sm font-semibold text-brand-700">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
    </div>
  );
}

export function MetricsPanel({ result }: { result: AnalysisResult }) {
  const { confusion: cm, testSize } = result.metrics;
  const cells = [
    { label: "Correctly caught churn", value: cm.truePositive, tone: "bg-emerald-50 text-emerald-700" },
    { label: "False alarms", value: cm.falsePositive, tone: "bg-amber-50 text-amber-800" },
    { label: "Missed churn", value: cm.falseNegative, tone: "bg-brand-50 text-brand-700" },
    { label: "Correctly cleared", value: cm.trueNegative, tone: "bg-paper text-ink/60" },
  ];

  const { summary } = result;
  const headline = [
    {
      label: "Cross-validated ROC-AUC",
      value: `${summary.cvAucMean.toFixed(3)} ± ${summary.cvAucStd.toFixed(3)}`,
      hint: `${result.cvAuc.folds}-fold, SMOTE fit inside each fold`,
    },
    {
      label: "Held-out ROC-AUC",
      value: summary.modelAuc.toFixed(3),
      hint: `on ${testSize.toLocaleString()} untouched customers`,
    },
    {
      label: "Brier score",
      value: summary.brier.toFixed(3),
      hint: `${result.calibration.method} calibration · lower is better`,
    },
  ];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Model performance</h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/10">
          {result.summary.modelName} · CV AUC {summary.cvAucMean.toFixed(3)} ± {summary.cvAucStd.toFixed(3)}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Reported as cross-validated mean ± std — not a single lucky split.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {headline.map((h) => (
          <div key={h.label} className="rounded-xl bg-paper p-4">
            <p className="text-2xl font-semibold tracking-tight text-ink">{h.value}</p>
            <p className="mt-0.5 text-sm font-medium text-ink">{h.label}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{h.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <MetricBar
            label="Accuracy"
            value={result.summary.modelAccuracy}
            hint="Overall correct predictions."
          />
          <MetricBar
            label="Precision"
            value={result.summary.modelPrecision}
            hint="When we flag churn, how often we're right."
          />
          <MetricBar
            label="Recall"
            value={result.summary.modelRecall}
            hint="Of customers who churned, how many we caught."
          />
          <MetricBar
            label="F1 score"
            value={result.summary.modelF1}
            hint="Balance of precision and recall."
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Confusion matrix</p>
          <div className="grid grid-cols-2 gap-2">
            {cells.map((c) => (
              <div key={c.label} className={`rounded-xl p-4 ${c.tone}`}>
                <p className="text-2xl font-semibold">{c.value}</p>
                <p className="mt-1 text-xs font-medium">{c.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Gradient-boosted trees with SMOTE applied <em>inside</em> each CV fold (no leakage) and
            probabilities calibrated to the true churn rate — a leakage-corrected take on our IEEE
            R10-HTC 2023 paper. Confusion matrix shown at the current decision threshold.
          </p>
        </div>
      </div>
    </Card>
  );
}
