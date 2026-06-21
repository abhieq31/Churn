"use client";

import type { PipelineStage } from "@/lib/ml/types";

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "preprocessing", label: "Reading & encoding your data" },
  { key: "balancing-classes", label: "Balancing churned vs retained (SMOTE)" },
  { key: "training-model", label: "Training the gradient-boosted model" },
  { key: "evaluating", label: "Measuring accuracy on held-out data" },
  { key: "scoring-customers", label: "Scoring your active customers" },
  { key: "generating-explanations", label: "Writing explanations & recommendations" },
];

export function ProgressOverlay({ stage }: { stage: PipelineStage }) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage);
  const activeIndex = stage === "complete" ? STAGES.length : currentIndex;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-7 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75 [animation:pulse-ring_1.5s_ease-out_infinite]" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-600" />
          </span>
          <h3 className="font-semibold text-ink">Analyzing your customers…</h3>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Running entirely in your browser. Nothing is uploaded.
        </p>
        <ol className="mt-5 space-y-3">
          {STAGES.map((s, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-brand-600 text-white"
                        : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {done ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={`text-sm ${
                    active ? "font-medium text-ink" : done ? "text-zinc-500" : "text-zinc-400"
                  }`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
