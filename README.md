# ChurnLens

**Churn is a leak in the rocket. You don't fix a leak by writing a report about it — you find the part that's failing and you fix that part.**

ChurnLens finds the part. Upload a CSV of your customers. It tells you who's about to leave,
the specific variable causing it, and the action that moves the number. No dashboard to
interpret. No analyst required. The output is a decision, not a chart.

It runs entirely in your browser. There is no server processing your customer data, because
there is no server in the loop at all. That's not a privacy feature bolted on top — it's a
consequence of the architecture being as simple as the problem allows.

**[churnlens-one.vercel.app →](https://churnlens-one.vercel.app)**

---

## First principles

Strip the problem to physics: a subscription business has a revenue inflow (new customers) and
a leak (churn). Most companies instrument the inflow obsessively and the leak barely at all.
That's backwards — plugging a 2-point leak on a $10M ARR base is worth roughly $200K/year, and
it's usually cheaper than acquiring the customers to replace the loss.

Existing tools solve the wrong part of this. They cost five or six figures a year, take weeks
to integrate, and output a risk score with no causal explanation attached — which means a human
still has to do the actual diagnostic work before anyone can act. A number without a reason is
not an answer. It's homework.

So: rebuild it from the math up. The underlying research, validated and published:

> A. Patel and A. G. Kumar, "Predicting Customer Churn in Telecom Industry: A Machine
> Learning Approach for Improving Customer Retention," *2023 IEEE 11th Region 10 Humanitarian
> Technology Conference (R10-HTC)*, 2023. DOI:
> [10.1109/R10-HTC57504.2023.10461822](https://doi.org/10.1109/R10-HTC57504.2023.10461822) ·
> [IEEE Xplore](https://ieeexplore.ieee.org/document/10461822)

## The algorithm

Every part of this product was run through the same five questions, in this order, because
doing them out of order wastes effort polishing something that should have been cut:

1. **Question the requirement.** Does a churn tool need an account, a backend, a database, a
   subscription? No — the only hard requirement is "look at customer data, output a ranked risk
   list with reasons." Everything else is optional scaffolding.
2. **Delete the part.** No server means no infrastructure to provision, secure, or pay for —
   zero marginal cost per user, full stop. No charting library for a static bar chart. No model
   class sitting in the bundle that nothing calls. If a part doesn't earn its weight, it's gone.
3. **Simplify what's left.** One model, one decision threshold, one explanation engine. Not
   three competing approaches hedging against each other.
4. **Speed it up.** Training runs in a Web Worker so the UI thread never blocks. Cutting the
   unused charting library alone dropped the shipped JS by 24%.
5. **Automate last.** The column mapping, the churn-label detection, the threshold — all
   auto-set from the data. Automation only after the first four steps, never before, because
   automating a process that shouldn't exist just makes the waste run faster.

## What it actually does

1. Reads your CSV and guesses the schema — churn column, revenue column, feature columns. You
   confirm it; you don't configure it from scratch.
2. Rebalances the training data with SMOTE, because churn is rare and a model that's lazy will
   just predict "nobody leaves" and call it 85% accurate. That's not a model, that's a constant.
3. Trains gradient-boosted decision trees — the same algorithm family that scored highest (94%)
   in the underlying research — written from raw math in TypeScript. No Python runtime, no GPU,
   no API call to a model you don't control.
4. Reports accuracy, precision, recall, F1, and ROC AUC measured only on data the model never
   trained on. A number you can't audit isn't a number, it's marketing.
5. Attaches a reason to every flagged customer: *"Customer service calls (5) — more than double
   the retained-customer average."* Cause, not just correlation-shaped fear.
6. Groups customers by shared cause into one task instead of a hundred individual alerts. Fix
   the cause once, not the symptom a hundred times.
7. Exports the full list as CSV. Your data, your format, your next move.

## Engineering

- **Next.js 16 / React 19 / TypeScript / Tailwind v4** — current tooling, no legacy weight.
- **Web Worker + Comlink** — the heaviest computation never touches the render thread.
- **papaparse** for CSV parsing. Everything else — including the dashboard charts — is
  hand-rolled CSS/SVG. A charting library for one static bar chart is dead weight; cut it.
- **Supabase**, optional. The product works at full capability with it absent. An account
  should be a convenience, never a dependency.
- Deployed on **Vercel** as a static client app. No server to scale, patch, or page you at 3 a.m.

## The model, built from raw math

Everything in [`lib/ml/`](lib/ml/) — every line of it — is hand-written. No imported ML
library, because a product whose pitch is "trust the math" can't be built on math it can't show
you:

| File | Job |
| --- | --- |
| `preprocess.ts` | Column detection, encoding, leakage-safe imputation/scaling, stratified split |
| `smote.ts` | Synthetic oversampling — training split only, after the split, never before |
| `gbm.ts` | Gradient-boosted trees (XGBoost-style, second-order Newton method) — the shipped model |
| `metrics.ts` | Confusion matrix, accuracy/precision/recall/F1, ROC AUC — on held-out data only |
| `explain.ts` | Per-customer causal reasons, gated by actual risk direction — plus cohort-level actions |
| `pipeline.ts` | The full sequence, end to end — what the Web Worker actually runs |

Verify the math yourself, no UI required:

```bash
npx tsx scripts/smoke.ts
```

Current numbers on the reference dataset: **92.0% accuracy, 70.9% F1, 0.913 AUC** — on customers
the model never saw during training.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Zero configuration required. No `.env` file needed to use the full product. Accounts are an
add-on, not a gate.

## Accounts (optional, off by default)

Only the *output* of an analysis is ever saved — counts, scores, recommendations. Never one row
of raw customer data. The data that matters stays exactly where it landed: your browser.

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) — creates the `analyses` table with
   row-level security on from the first row.
3. Set the keys (`.env.local` locally, or Vercel's dashboard/native integration in production):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   ```

## Privacy is a side effect of good engineering

There's no server for your data to reach, so there's no server that can leak it. Not a policy
decision, not a checkbox in a settings page — a direct result of deleting the part of the system
that didn't need to exist. Close the tab and the data is gone, because it was never anywhere
else to begin with.
