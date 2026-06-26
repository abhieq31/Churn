import type { Metadata } from "next";
import { Badge, Card } from "@/components/ui/primitives";
import metrics from "@/lib/ml/models/telecom.metrics.json";

export const metadata: Metadata = {
  title: "The Science — ChurnLens",
  description:
    "How ChurnLens predicts churn — honestly: SMOTE inside every CV fold (no leakage), cross-validated ROC-AUC reported as mean ± std, calibrated probabilities, and exact per-customer SHAP. A leakage-corrected re-do of our IEEE paper.",
};

const cv = metrics.cv_results as Record<string, { cv_roc_auc_mean: number; cv_roc_auc_std: number }>;
const fmt = (n: number) => n.toFixed(3);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
          {n}
        </span>
        <span className="mt-2 w-px flex-1 bg-zinc-200" />
      </div>
      <div className="pb-10">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <div className="mt-2 space-y-3 text-zinc-600">{children}</div>
      </div>
    </div>
  );
}

export default function SciencePage() {
  const modelNames: Record<string, string> = {
    logistic_regression: "Logistic Regression",
    random_forest: "Random Forest",
    gradient_boosting: "Gradient Boosting",
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Badge tone="brand">The Science</Badge>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">
        How ChurnLens predicts churn — honestly
      </h1>
      <p className="mt-4 text-lg text-zinc-600">
        ChurnLens is a productized, <em>leakage-corrected</em> version of our peer-reviewed research
        on telecom churn. Below is the whole method in plain language — including exactly where the
        original paper&apos;s methodology was too optimistic, and what we changed.
      </p>

      {/* Honesty callout */}
      <Card className="mt-8 border-amber-200 bg-amber-50/60 p-6">
        <p className="text-sm font-semibold text-amber-800">The correction, up front</p>
        <p className="mt-2 text-sm text-zinc-700">
          The paper applied <strong>SMOTE to the whole dataset before splitting</strong>. That lets
          synthetic copies of a churner land in <em>both</em> train and test — the model is quietly
          graded on data it has already seen, and the headline <strong>94% accuracy</strong> is
          inflated. We moved SMOTE <strong>inside every cross-validation fold</strong>, so it only
          ever touches training rows. The honest number is a cross-validated{" "}
          <strong>ROC-AUC of {fmt(metrics.tuned_cv_roc_auc)} ± {fmt(cv.gradient_boosting.cv_roc_auc_std)}</strong>{" "}
          — and because churn is only {pct(metrics.positive_rate)} of customers, accuracy was never
          the right yardstick anyway.
        </p>
      </Card>

      {/* Paper citation */}
      <Card className="mt-6 border-brand-200 bg-brand-50/50 p-6">
        <p className="text-sm font-medium text-brand-700">Based on published research</p>
        <p className="mt-2 font-semibold text-ink">
          Predicting Customer Churn in Telecom Industry: A Machine Learning Approach for Improving
          Customer Retention
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          A. Patel and A. G. Kumar, 2023 IEEE 11th Region 10 Humanitarian Technology Conference
          (R10-HTC), 2023.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a
            href="https://ieeexplore.ieee.org/document/10461822"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
          >
            View on IEEE Xplore →
          </a>
          <a
            href="https://doi.org/10.1109/R10-HTC57504.2023.10461822"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 font-medium text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            DOI: 10.1109/R10-HTC57504.2023.10461822
          </a>
        </div>
      </Card>

      {/* Pipeline steps */}
      <div className="mt-12">
        <Step n={1} title="Read & understand your columns">
          <p>
            ChurnLens classifies every column — a number (monthly spend), a yes/no flag (has
            international plan), a category (plan tier), or an ID — auto-detects the churn label, and
            asks you to confirm it before anything runs.
          </p>
        </Step>

        <Step n={2} title="Balance classes — but only inside each fold">
          <p>
            Churn is rare ({pct(metrics.positive_rate)} of customers here). <strong>SMOTE</strong>{" "}
            (Synthetic Minority Over-sampling) fixes the imbalance by interpolating new churner
            examples from real ones. The catch: do it once on the whole dataset and you leak — a
            synthetic point built from a test-set churner ends up training the model.
          </p>
          <p>
            So we run it as a step <em>inside</em> an imbalanced-learn pipeline, refit separately on
            each cross-validation fold&apos;s training rows. No test row is ever synthesised from. This
            is the single change that turns the paper&apos;s optimistic numbers into honest ones.
          </p>
        </Step>

        <Step n={3} title="Cross-validate — report mean ± std, not one lucky split">
          <p>
            A single train/test split is a coin flip. We use 5-fold cross-validation and report the
            spread, so you see how stable the model really is.
          </p>
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium">CV ROC-AUC (mean ± std)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {Object.entries(cv).map(([key, v]) => (
                  <tr key={key} className={key === metrics.best_model ? "bg-brand-50/40" : ""}>
                    <td className="px-4 py-2 text-ink">
                      {modelNames[key] ?? key}
                      {key === metrics.best_model && (
                        <span className="ml-2 text-xs font-medium text-brand-700">← shipped</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium text-ink">
                      {fmt(v.cv_roc_auc_mean)} ± {fmt(v.cv_roc_auc_std)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-zinc-500">
            Gradient boosting (the XGBoost family that topped the paper&apos;s benchmark) wins; tuned, it
            reaches {fmt(metrics.tuned_cv_roc_auc)} CV ROC-AUC and {fmt(metrics.test_roc_auc)} on a
            fully held-out test set.
          </p>
        </Step>

        <Step n={4} title="Calibrate the probabilities">
          <p>
            SMOTE balances the training data to ~50/50, so the raw model talks as if churn were a
            coin flip. We fit two calibrators — <strong>Platt</strong> (a sigmoid) and{" "}
            <strong>isotonic</strong> (a monotonic step fit) — and keep whichever scores the lower{" "}
            <strong>Brier score</strong>, mapping scores back to the true{" "}
            {pct(metrics.positive_rate)} base rate.
          </p>
          <p className="text-sm text-zinc-500">
            Here {metrics.chosen_calibration} won (Brier{" "}
            {metrics.calibration.isotonic.brier.toFixed(4)} vs{" "}
            {metrics.calibration.platt.brier.toFixed(4)}). The result: when ChurnLens says &ldquo;30%
            risk,&rdquo; about 30% of those customers really do churn — so the number, and the
            revenue-at-risk it implies, can be trusted.
          </p>
        </Step>

        <Step n={5} title="Explain every prediction with SHAP">
          <p>
            For each customer we compute exact <strong>TreeSHAP</strong> values — the same algorithm
            as the Python <code>shap</code> package — showing precisely which features pushed{" "}
            <em>their</em> risk up or down, and by how much (on the log-odds scale the model reasons
            on). No heuristics: the bars are the model&apos;s actual arithmetic.
          </p>
          <p>
            Across the dataset, the strongest drivers are{" "}
            <strong>
              {(metrics.shap_global as { column: string }[]).slice(0, 3).map((d) => d.column).join(", ")}
            </strong>{" "}
            — the international-plan and frequent-support-call signals the paper called out, now
            quantified per customer.
          </p>
        </Step>

        <Step n={6} title="Pick your decision threshold">
          <p>
            A calibrated probability isn&apos;t a yes/no — you choose the cut-off. The threshold slider
            shows precision, recall, and F1 at every value (measured on held-out data) so you can
            decide whether to catch more churners (higher recall) or flag only the most certain
            (higher precision). The at-risk list and revenue-at-risk update live.
          </p>
        </Step>

        <Step n={7} title="Turn it into an action plan">
          <p>
            Finally we group at-risk customers by their top shared factor into cohorts and emit one
            prioritized recommendation per cohort — largest, most valuable first.
          </p>
        </Step>
      </div>

      <Card className="mt-4 border-emerald-200 bg-emerald-50/50 p-6">
        <h3 className="font-semibold text-ink">Same model, two runtimes — verified identical</h3>
        <p className="mt-2 text-sm text-zinc-600">
          The model is trained once in Python (scikit-learn + imbalanced-learn), then exported to
          JSON. It runs two ways: a tiny <strong>FastAPI</strong> endpoint serving the scikit-learn
          model with exact SHAP, and a native <strong>TypeScript</strong> port that runs in your
          browser. A build-time test asserts both reproduce scikit-learn&apos;s probabilities — and the
          SHAP values reproduce the <code>shap</code> package — to within{" "}
          <strong>10⁻⁶</strong>. No black box, no drift.
        </p>
      </Card>

      <Card className="mt-4 p-6">
        <h3 className="font-semibold text-ink">A note on privacy</h3>
        <p className="mt-2 text-sm text-zinc-600">
          When you upload your own CSV, the entire pipeline above — cross-validation, SMOTE,
          calibration, SHAP — runs inside your browser in a background thread. Your customer data is
          never uploaded. If you create an account, only the <em>aggregate</em> results are saved,
          never the raw rows.
        </p>
      </Card>
    </div>
  );
}
