"use client";

import { formatCurrency } from "@/lib/ml/explain";
import type { Recommendation } from "@/lib/ml/types";
import { Badge, Card } from "@/components/ui/primitives";

export function RecommendationsPanel({
  recommendations,
  activeTag,
  onFocusCohort,
}: {
  recommendations: Recommendation[];
  activeTag: string | null;
  onFocusCohort: (tag: string | null) => void;
}) {
  if (recommendations.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ink">Recommended actions</h2>
        <p className="mt-2 text-sm text-zinc-500">
          No clear at-risk cohorts emerged — your churn signals look evenly spread. Work the
          ranked at-risk list directly.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Recommended actions</h2>
        {activeTag && (
          <button
            onClick={() => onFocusCohort(null)}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Clear filter
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        At-risk customers grouped by their top shared risk factor. Click one to filter the
        list below.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {recommendations.map((r, i) => {
          const active = activeTag === r.tag;
          return (
            <Card
              key={r.tag}
              className={`cursor-pointer p-5 transition-all ${
                active ? "ring-2 ring-brand-500" : "hover:shadow-md"
              }`}
            >
              <button
                className="block w-full text-left"
                onClick={() => onFocusCohort(active ? null : r.tag)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                      {i + 1}
                    </span>
                    <Badge tone={r.churnMultiplier >= 2 ? "rose" : "amber"}>
                      {r.churnMultiplier.toFixed(1)}× churn rate
                    </Badge>
                  </div>
                  {r.revenueAtRisk != null && r.revenueAtRisk > 0 && (
                    <span className="text-sm font-semibold text-rose-600">
                      {formatCurrency(r.revenueAtRisk)}/mo
                    </span>
                  )}
                </div>
                <p className="mt-3 font-semibold text-ink">
                  {r.cohortSize} at-risk customers
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{r.body}</p>
                <span className="mt-3 inline-block text-sm font-medium text-brand-600">
                  {active ? "Showing this cohort ↓" : "Filter to this cohort →"}
                </span>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
