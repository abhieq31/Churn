import type { Metadata } from "next";
import { Badge, Card } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "The Science — ChurnLens",
  description:
    "How ChurnLens predicts churn: SMOTE class balancing, a gradient-boosting classifier, and an explainability engine — based on published IEEE research.",
};

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
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
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Badge tone="brand">The Science</Badge>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">
        How ChurnLens predicts churn
      </h1>
      <p className="mt-4 text-lg text-zinc-600">
        ChurnLens is a productized version of peer-reviewed research on telecom customer
        churn. Below is the whole method in plain language — no ML background needed — plus
        the exact same pipeline now generalized to work on <em>any</em> subscription
        business&apos;s customer data.
      </p>

      {/* Paper citation */}
      <Card className="mt-8 border-brand-200 bg-brand-50/50 p-6">
        <p className="text-sm font-medium text-brand-700">Based on published research</p>
        <p className="mt-2 font-semibold text-ink">
          Predicting Customer Churn in Telecom Industry: A Machine Learning Approach for
          Improving Customer Retention
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          A. Patel and A. G. Kumar, 2023 IEEE 11th Region 10 Humanitarian Technology
          Conference (R10-HTC), 2023.
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
            ChurnLens looks at every column in your CSV and figures out what it is — a
            number (like monthly spend), a yes/no flag (like “has international plan”), a
            category (like plan tier), or an ID. It then auto-detects which column records
            whether a customer churned, and you confirm it before anything runs.
          </p>
        </Step>

        <Step n={2} title="Balance the classes with SMOTE">
          <p>
            Churn is rare — in the research dataset only <strong>14.6%</strong> of customers
            had left. If you train a model on that as-is, it can score 85% accuracy by lazily
            predicting “nobody churns,” which is useless.
          </p>
          <p>
            <strong>SMOTE</strong> (Synthetic Minority Over-sampling Technique) fixes this by
            creating realistic synthetic examples of churned customers — blending real
            churners with their nearest neighbours — until the classes are balanced. We apply
            it <em>only</em> to the training data, after holding out a test set, so the
            accuracy we report stays honest.
          </p>
        </Step>

        <Step n={3} title="Train gradient-boosted trees">
          <p>
            A <strong>decision tree</strong> asks a series of yes/no questions (“more than 3
            service calls? on an international plan?”) to sort customers into churn or
            stay. A single tree is easy to read but a bit unstable.
          </p>
          <p>
            <strong>Gradient boosting</strong> builds many small trees in sequence, where each
            new tree focuses on the mistakes of the ones before it. It&apos;s the same family as
            <strong> XGBoost</strong>, which topped our paper&apos;s benchmark at{" "}
            <strong>94%</strong> accuracy — ahead of Naive Bayes, Logistic Regression, SVM, KNN,
            a single Decision Tree and a Random Forest. ChurnLens implements it from scratch in
            the browser, and it still reports which factors mattered most — which powers the
            explanations below.
          </p>
        </Step>

        <Step n={4} title="Measure honestly on held-out data">
          <p>
            We never grade the model on data it trained on. Metrics — accuracy, precision,
            recall and F1 — are computed on a held-out test set kept at the real churn rate
            (and never touched by SMOTE). Precision answers “when we flag someone, how often
            are we right?”; recall answers “of everyone who actually churned, how many did we
            catch?”
          </p>
        </Step>

        <Step n={5} title="Explain every at-risk customer">
          <p>
            This is what turns a score into a decision. For each at-risk customer we compare
            their values against the average <em>retained</em> customer, but only flag a
            factor if it genuinely pushes risk <em>up</em> for them. That produces lines like
            “Customer service calls (5) — more than double the retained-customer average
            (2.1).”
          </p>
          <p>
            In the research, two signals stood out: customers on an{" "}
            <strong>international plan</strong> churned far more, and risk jumped sharply once
            a customer made <strong>4 or more service calls</strong>. ChurnLens surfaces those
            patterns automatically — whatever the equivalent signals are in your data.
          </p>
        </Step>

        <Step n={6} title="Turn it into an action plan">
          <p>
            Finally we group at-risk customers by their top shared risk factor into cohorts,
            and generate one prioritized recommendation per cohort — e.g. “31 active
            customers contact support frequently; this group churns at 3× the base rate —
            reach out proactively.” Largest, most valuable cohorts first.
          </p>
        </Step>
      </div>

      <Card className="mt-4 p-6">
        <h3 className="font-semibold text-ink">A note on privacy</h3>
        <p className="mt-2 text-sm text-zinc-600">
          Every step above runs inside your browser using WebAssembly-speed JavaScript in a
          background thread. Your CSV is never uploaded. If you choose to create an account,
          only the <em>aggregate</em> results (counts, model scores, recommendations) are
          saved — never the raw customer rows.
        </p>
      </Card>
    </div>
  );
}
