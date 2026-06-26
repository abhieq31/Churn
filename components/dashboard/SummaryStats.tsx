"use client";

import { formatCurrency } from "@/lib/ml/explain";
import type { AnalysisResult } from "@/lib/ml/types";
import { Card } from "@/components/ui/primitives";
import { CountUp } from "@/components/ui/CountUp";

function Stat({
  label,
  value,
  format,
  sub,
  tone = "default",
  delay = 0,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  sub?: string;
  tone?: "default" | "rose" | "emerald";
  delay?: number;
}) {
  const valueTone =
    tone === "rose" ? "text-brand-600" : tone === "emerald" ? "text-emerald-600" : "text-ink";
  return (
    <Card className="animate-fade-up p-5" >
      <div style={{ animationDelay: `${delay}ms` }}>
        <p className="text-sm text-zinc-500">{label}</p>
        <p className={`mt-1 text-3xl font-semibold tracking-tight ${valueTone}`}>
          <CountUp value={value} format={format} />
        </p>
        {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
      </div>
    </Card>
  );
}

export function SummaryStats({
  result,
  atRiskCount,
  revenueAtRisk,
}: {
  result: AnalysisResult;
  /** Live override as the threshold slider moves (defaults to the summary values). */
  atRiskCount?: number;
  revenueAtRisk?: number | null;
}) {
  const s = result.summary;
  const activeCount = s.totalCustomers - s.historicalChurnCount;
  const liveAtRisk = atRiskCount ?? s.atRiskCount;
  const liveRevenue = revenueAtRisk !== undefined ? revenueAtRisk : s.revenueAtRisk;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="At-risk customers"
        value={liveAtRisk}
        format={(n) => Math.round(n).toLocaleString()}
        sub={`of ${activeCount.toLocaleString()} active customers`}
        tone="rose"
      />
      <Stat
        label="Revenue at risk"
        value={liveRevenue ?? 0}
        format={(n) => (liveRevenue != null ? `${formatCurrency(n)}/mo` : "—")}
        sub={liveRevenue != null ? "from at-risk customers" : "no revenue column mapped"}
        tone="rose"
        delay={80}
      />
      <Stat
        label="Historical churn rate"
        value={s.historicalChurnRate * 100}
        format={(n) => `${n.toFixed(1)}%`}
        sub={`${s.historicalChurnCount.toLocaleString()} already churned`}
        delay={160}
      />
      <Stat
        label="Model quality (CV ROC-AUC)"
        value={s.cvAucMean}
        format={(n) => n.toFixed(3)}
        sub={`±${s.cvAucStd.toFixed(3)} across folds · Brier ${s.brier.toFixed(3)}`}
        tone="emerald"
        delay={240}
      />
    </div>
  );
}
