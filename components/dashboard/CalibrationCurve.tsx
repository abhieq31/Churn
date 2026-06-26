"use client";

import type { CalibrationSummary } from "@/lib/ml/types";
import { Card } from "@/components/ui/primitives";

const S = 240; // square plot

/**
 * Reliability diagram. SMOTE balances the training folds, so the raw model
 * speaks on a ~50/50 scale; calibration (Platt vs isotonic, whichever scored a
 * lower Brier) maps its scores back to the true churn rate. Points on the
 * diagonal mean "when we say 30%, 30% actually churn."
 */
export function CalibrationCurve({ calibration }: { calibration: CalibrationSummary }) {
  const { curve, method, brier, comparison } = calibration;
  const pts = curve.map((b) => ({ x: b.pred * S, y: S - b.obs * S, count: b.count }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Calibration</h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/10">
          {method} · Brier {brier.toFixed(3)}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Predicted churn probability vs the rate actually observed, on held-out data.
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <svg viewBox={`0 0 ${S} ${S}`} className="h-56 w-56 shrink-0">
          <rect x="0" y="0" width={S} height={S} fill="#fafafa" rx="8" />
          {/* perfect-calibration diagonal */}
          <line x1="0" y1={S} x2={S} y2="0" stroke="#d4d4d8" strokeWidth="1" strokeDasharray="4 4" />
          <path d={line} fill="none" stroke="#d0441f" strokeWidth="2" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#d0441f" />
          ))}
        </svg>

        <div className="space-y-2 text-sm">
          <p className="text-zinc-600">
            <span className="font-medium text-ink">Brier score {brier.toFixed(4)}</span> — mean
            squared error of the probabilities (0 is perfect).
          </p>
          <div className="rounded-xl bg-paper p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Chosen by lower Brier
            </p>
            <div className="mt-2 flex gap-4">
              <div>
                <p className={method === "platt" ? "font-semibold text-brand-700" : "text-zinc-500"}>
                  Platt
                </p>
                <p className="text-xs text-zinc-400">{comparison.platt.toFixed(4)}</p>
              </div>
              <div>
                <p className={method === "isotonic" ? "font-semibold text-brand-700" : "text-zinc-500"}>
                  Isotonic
                </p>
                <p className="text-xs text-zinc-400">{comparison.isotonic.toFixed(4)}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-400">
            The dashed diagonal is perfect calibration; the closer the purple line hugs it, the more
            trustworthy each probability is.
          </p>
        </div>
      </div>
    </Card>
  );
}
