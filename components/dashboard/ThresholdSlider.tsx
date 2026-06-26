"use client";

import { useMemo } from "react";
import type { ThresholdPoint } from "@/lib/ml/types";
import { Card } from "@/components/ui/primitives";

const W = 520;
const H = 130;

function path(points: ThresholdPoint[], pick: (p: ThresholdPoint) => number): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.threshold * W} ${H - pick(p) * H}`)
    .join(" ");
}

/**
 * The decision-threshold control. The model outputs a calibrated probability;
 * this is where you choose how aggressive to be. Precision/recall/F1 come from
 * the held-out test set, so the trade-off shown is honest.
 */
export function ThresholdSlider({
  sweep,
  value,
  onChange,
  flagged,
  totalActive,
}: {
  sweep: ThresholdPoint[];
  value: number;
  onChange: (t: number) => void;
  flagged: number;
  totalActive: number;
}) {
  const point = useMemo(() => {
    let best = sweep[0];
    for (const p of sweep) {
      if (Math.abs(p.threshold - value) < Math.abs(best.threshold - value)) best = p;
    }
    return best;
  }, [sweep, value]);

  const stats = [
    { label: "Precision", value: point.precision, hint: "of those flagged, how many really churn", color: "text-brand-700" },
    { label: "Recall", value: point.recall, hint: "of churners, how many we catch", color: "text-rose-600" },
    { label: "F1", value: point.f1, hint: "balance of the two", color: "text-emerald-600" },
  ];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Decision threshold</h2>
        <span className="text-sm text-zinc-500">
          Flagging at <span className="font-semibold text-ink">{(value * 100).toFixed(0)}%</span> risk →{" "}
          <span className="font-semibold text-brand-700">{flagged.toLocaleString()}</span> of{" "}
          {totalActive.toLocaleString()} active customers
        </span>
      </div>

      {/* precision / recall curves with a marker at the current threshold */}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-32 w-full" preserveAspectRatio="none">
        <line x1="0" y1={H} x2={W} y2={H} stroke="#e4e4e7" strokeWidth="1" />
        <path d={path(sweep, (p) => p.precision)} fill="none" stroke="#7c5cff" strokeWidth="2" />
        <path d={path(sweep, (p) => p.recall)} fill="none" stroke="#e11d48" strokeWidth="2" />
        <path d={path(sweep, (p) => p.f1)} fill="none" stroke="#059669" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1={value * W} y1="0" x2={value * W} y2={H} stroke="#18181b" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>

      <input
        type="range"
        min={0.05}
        max={0.95}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Decision threshold"
        className="mt-3 w-full accent-brand-600"
      />

      <div className="mt-4 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-paper p-3">
            <p className={`text-2xl font-semibold ${s.color}`}>{(s.value * 100).toFixed(0)}%</p>
            <p className="text-sm font-medium text-ink">{s.label}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{s.hint}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Lower the threshold to catch more churners (higher recall, more false alarms); raise it to
        flag only the most certain (higher precision). Curves measured on held-out data.
      </p>
    </Card>
  );
}
