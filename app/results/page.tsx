"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/ml/explain";
import { useAnalysis } from "@/lib/state/AnalysisProvider";
import { SummaryStats } from "@/components/dashboard/SummaryStats";
import { RecommendationsPanel } from "@/components/dashboard/RecommendationsPanel";
import { AtRiskTable } from "@/components/dashboard/AtRiskTable";
import { MetricsPanel } from "@/components/dashboard/MetricsPanel";
import { ThresholdSlider } from "@/components/dashboard/ThresholdSlider";
import { CalibrationCurve } from "@/components/dashboard/CalibrationCurve";
import { ImportanceChart } from "@/components/dashboard/ImportanceChart";
import { SaveAnalysis } from "@/components/dashboard/SaveAnalysis";
import { Badge, Card, Eyebrow, LinkButton } from "@/components/ui/primitives";

export default function ResultsPage() {
  const { result, rows, datasetName } = useAnalysis();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);

  const effectiveThreshold = threshold ?? result?.threshold ?? 0.5;
  const live = useMemo(() => {
    if (!result) return { atRiskCount: 0, revenueAtRisk: null as number | null };
    const probs = result.activeProbabilities;
    const revs = result.activeRevenue;
    let count = 0;
    let rev = 0;
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] >= effectiveThreshold) {
        count++;
        if (revs) rev += revs[i];
      }
    }
    return { atRiskCount: count, revenueAtRisk: revs ? rev : null };
  }, [result, effectiveThreshold]);

  if (!result || !rows) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-28 text-center sm:px-8">
        <Card className="p-12">
          <h1 className="display text-3xl font-semibold text-ink">Nothing to show yet</h1>
          <p className="mt-3 text-ink/55">
            Upload a customer CSV or try the sample data to see your churn dashboard.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <LinkButton href="/upload">Analyze churn</LinkButton>
            <LinkButton href="/" variant="secondary">
              Back home
            </LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  const s = result.summary;
  const activeCount = s.totalCustomers - s.historicalChurnCount;
  const atRiskCount = live.atRiskCount;
  const revenueAtRisk = live.revenueAtRisk;
  const pctActive = activeCount > 0 ? (atRiskCount / activeCount) * 100 : 0;
  const factors = result.globalImportance.slice(0, 2).map((g) => g.column);
  const topAction = result.recommendations[0];

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="emerald">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Analysis complete
          </Badge>
          <Badge tone="zinc">
            {s.modelName} · CV AUC {s.cvAucMean.toFixed(3)} ± {s.cvAucStd.toFixed(3)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <SaveAnalysis result={result} defaultName={datasetName ?? "Untitled analysis"} />
          <Link
            href="/upload"
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            New analysis
          </Link>
        </div>
      </div>

      {/* The one clear insight */}
      <div className="animate-fade-up mt-8">
        <Eyebrow>{datasetName ?? "Your dataset"}</Eyebrow>
        {atRiskCount > 0 ? (
          <h1 className="display mt-4 max-w-4xl text-4xl font-semibold text-ink sm:text-5xl">
            <span className="text-brand-600">{atRiskCount.toLocaleString()}</span> of your{" "}
            {activeCount.toLocaleString()} active customers are{" "}
            <span className="serif-accent">likely to churn.</span>
          </h1>
        ) : (
          <h1 className="display mt-4 max-w-4xl text-4xl font-semibold text-ink sm:text-5xl">
            No active customers cross the <span className="serif-accent">churn-risk line.</span>
          </h1>
        )}
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink/55">
          That&apos;s {pctActive.toFixed(1)}% of your active base
          {revenueAtRisk != null && revenueAtRisk > 0 ? (
            <>
              , putting{" "}
              <span className="font-medium text-ink">{formatCurrency(revenueAtRisk)}/mo</span> of
              revenue on the line
            </>
          ) : null}
          .
          {factors.length > 0 && (
            <>
              {" "}
              The strongest signals are{" "}
              <span className="font-medium text-ink">{factors.join(" and ")}</span>.
            </>
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="mt-10">
        <SummaryStats result={result} atRiskCount={atRiskCount} revenueAtRisk={revenueAtRisk} />
      </div>

      {/* Do this first */}
      {topAction && (
        <div className="animate-fade-up mt-12">
          <Card className="overflow-hidden bg-ink p-8 sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-400">
                  Do this first
                </p>
                <p className="mt-4 text-2xl font-semibold leading-snug tracking-tight text-paper">
                  {topAction.body}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-serif text-5xl italic text-brand-400">
                  {topAction.churnMultiplier.toFixed(1)}×
                </p>
                <p className="text-sm text-paper/50">base churn rate</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Recommendations */}
      <div className="animate-fade-up mt-12">
        <RecommendationsPanel
          recommendations={result.recommendations}
          activeTag={activeTag}
          onFocusCohort={setActiveTag}
        />
      </div>

      {/* Decision threshold — tune precision/recall live */}
      <div className="animate-fade-up mt-12">
        <ThresholdSlider
          sweep={result.thresholdSweep}
          value={effectiveThreshold}
          onChange={setThreshold}
          flagged={atRiskCount}
          totalActive={activeCount}
        />
      </div>

      {/* Table + importance */}
      <div className="animate-fade-up mt-12 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AtRiskTable result={result} rows={rows} activeTag={activeTag} threshold={effectiveThreshold} />
        </div>
        <div className="lg:col-span-1">
          <ImportanceChart importance={result.globalImportance} />
        </div>
      </div>

      {/* Calibration + metrics */}
      <div className="animate-fade-up mt-6 grid gap-6 lg:grid-cols-2">
        <CalibrationCurve calibration={result.calibration} />
        <MetricsPanel result={result} />
      </div>
    </div>
  );
}
