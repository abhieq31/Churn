"use client";

import type { PipelineStage } from "@/lib/ml/types";
import { StageScene } from "./StageScene";

export const STAGES: { key: PipelineStage; label: string; caption: string }[] = [
  {
    key: "preprocessing",
    label: "Reading & encoding your data",
    caption: "Detecting each column's type and one-hot encoding — fit on training rows only.",
  },
  {
    key: "cross-validating",
    label: "Cross-validating",
    caption: "5 folds. SMOTE is refit inside each fold's training rows, so no test row leaks.",
  },
  {
    key: "calibrating",
    label: "Calibrating probabilities",
    caption: "Fitting Platt and isotonic, keeping whichever scores the lower Brier.",
  },
  {
    key: "training-model",
    label: "Training the model",
    caption: "Boosting hundreds of small gradient-boosted trees on the full training split.",
  },
  {
    key: "evaluating",
    label: "Measuring performance",
    caption: "ROC-AUC, Brier and a full precision/recall sweep — on held-out data.",
  },
  {
    key: "scoring-customers",
    label: "Scoring your customers",
    caption: "A calibrated churn probability for every still-active customer.",
  },
  {
    key: "generating-explanations",
    label: "Explaining each prediction",
    caption: "Exact per-customer TreeSHAP, then grouping cohorts into recommendations.",
  },
];

export function ProgressOverlay({ stage }: { stage: PipelineStage }) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage);
  const activeIndex = stage === "complete" ? STAGES.length - 1 : Math.max(0, currentIndex);
  const current = STAGES[activeIndex];
  const pct = Math.round(((activeIndex + 1) / STAGES.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        {/* the informatic scene for the current stage */}
        <div className="border-b border-line bg-paper/60 px-6 pt-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75 [animation:pulse-ring_1.5s_ease-out_infinite]" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-600" />
            </span>
            <h3 className="text-sm font-semibold text-ink">Analyzing your customers…</h3>
            <span className="ml-auto text-xs text-zinc-400">
              Step {activeIndex + 1} of {STAGES.length}
            </span>
          </div>
          <StageScene stage={stage} />
        </div>

        {/* current stage + informative caption */}
        <div className="px-6 py-5">
          <p key={`${current.key}-label`} className="animate-fade-up text-lg font-semibold text-ink">
            {current.label}
          </p>
          <p key={`${current.key}-cap`} className="animate-fade-up mt-1 text-sm leading-relaxed text-zinc-500">
            {current.caption}
          </p>

          {/* segmented progress */}
          <div className="mt-4 flex gap-1.5">
            {STAGES.map((s, i) => (
              <span
                key={s.key}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  i < activeIndex ? "bg-brand-300" : i === activeIndex ? "bg-brand-600" : "bg-zinc-200"
                }`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-zinc-400">Running entirely in your browser. Nothing is uploaded.</p>
            <p className="text-xs font-medium text-brand-700">{pct}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
