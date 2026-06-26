"use client";

import { useMemo, useState } from "react";
import { atRiskToCsv, downloadText } from "@/lib/csv";
import { formatCurrency } from "@/lib/ml/explain";
import type { AnalysisResult, RawRow, ShapContribution } from "@/lib/ml/types";
import { Badge, Button, Card } from "@/components/ui/primitives";

function RiskBadge({ p }: { p: number }) {
  const tone = p >= 0.8 ? "rose" : p >= 0.65 ? "amber" : "zinc";
  return <Badge tone={tone}>{(p * 100).toFixed(0)}%</Badge>;
}

/** Diverging SHAP bars: which features pushed THIS customer's risk up / down. */
function ShapBars({ shap }: { shap: ShapContribution[] }) {
  const top = shap.slice(0, 6);
  const max = Math.max(...top.map((s) => Math.abs(s.contribution)), 1e-6);
  return (
    <div className="space-y-1.5">
      {top.map((s) => {
        const w = (Math.abs(s.contribution) / max) * 50; // % of half-width
        const up = s.contribution >= 0;
        return (
          <div key={s.column} className="flex items-center gap-2 text-sm">
            <span className="w-40 shrink-0 truncate text-right text-zinc-600" title={`${s.column} = ${s.value}`}>
              {s.column}
            </span>
            <span className="relative flex h-4 flex-1 items-center">
              <span className="absolute left-1/2 top-0 h-4 w-px bg-zinc-300" />
              <span
                className={`absolute h-3 rounded-sm ${up ? "bg-rose-400" : "bg-emerald-400"}`}
                style={up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
              />
            </span>
            <span className={`w-12 shrink-0 text-xs font-medium ${up ? "text-rose-600" : "text-emerald-600"}`}>
              {up ? "+" : ""}
              {s.contribution.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AtRiskTable({
  result,
  rows,
  activeTag,
  threshold,
}: {
  result: AnalysisResult;
  rows: RawRow[];
  activeTag: string | null;
  threshold: number;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [limit, setLimit] = useState(25);

  const filtered = useMemo(() => {
    let list = result.atRiskCustomers.filter((c) => c.probability >= threshold);
    if (activeTag) list = list.filter((c) => c.reasons[0]?.tag === activeTag);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.reasons.some((r) => r.text.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [result.atRiskCustomers, activeTag, query, threshold]);

  const visible = filtered.slice(0, limit);
  const hasRevenue = result.mapping.revenueColumn != null;

  function exportCsv() {
    const csv = atRiskToCsv(rows, filtered);
    downloadText("churnlens-at-risk-customers.csv", csv);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">At-risk customers</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {filtered.length.toLocaleString()} active customers predicted to churn
            {activeTag ? " · filtered to selected cohort" : ""}. Click a row for the why.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers…"
            className="w-40 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:w-48"
          />
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export CSV
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="p-8 text-center text-sm text-zinc-500">No customers match this view.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {visible.map((c) => {
            const open = expanded === c.rowIndex;
            return (
              <li key={c.rowIndex}>
                <button
                  onClick={() => setExpanded(open ? null : c.rowIndex)}
                  className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-zinc-50"
                >
                  <RiskBadge p={c.probability} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{c.label}</span>
                    <span className="block truncate text-sm text-zinc-500">
                      {c.reasons[0]?.text ?? "At-risk pattern detected"}
                    </span>
                  </span>
                  {hasRevenue && c.revenue != null && (
                    <span className="hidden text-sm font-medium text-zinc-600 sm:block">
                      {formatCurrency(c.revenue)}/mo
                    </span>
                  )}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                    className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {open && (
                  <div className="bg-zinc-50/70 px-5 pb-5 pl-16">
                    {c.shap.length > 0 && (
                      <>
                        <p className="pt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                          What moved this prediction (SHAP, log-odds)
                        </p>
                        <div className="mt-2 max-w-md">
                          <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                            <span>← lowers risk</span>
                            <span>raises risk →</span>
                          </div>
                          <ShapBars shap={c.shap} />
                        </div>
                      </>
                    )}
                    <p className="pt-4 text-xs font-medium uppercase tracking-wide text-zinc-400">
                      In plain language
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {c.reasons.map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm text-zinc-700">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                          <span>{r.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > limit && (
        <div className="border-t border-zinc-200 p-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit(limit + 50)}>
            Show more ({filtered.length - limit} remaining)
          </Button>
        </div>
      )}
    </Card>
  );
}
