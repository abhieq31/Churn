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

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Model performance</h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/10">
          {result.summary.modelName} · AUC {result.summary.modelAuc.toFixed(3)}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Measured on {testSize.toLocaleString()} held-out customers the model never trained on.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
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
          <MetricBar
            label="ROC AUC"
            value={result.summary.modelAuc}
            hint="Ranking quality, independent of threshold."
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
            Built on SMOTE class balancing + gradient-boosted trees, following the methodology
            in our IEEE R10-HTC 2023 paper.
          </p>
        </div>
      </div>
    </Card>
  );
}
