# ChurnLens

**Some of your customers have already decided to leave. You just don't know which ones yet.**

ChurnLens tells you. Drop in a CSV, and in seconds you know exactly who's about to churn,
*why*, and *what to do about it* — in plain English, not a probability score you have to
interpret yourself.

No upload. No backend. No account required. The entire machine-learning pipeline — training,
scoring, explaining — runs **inside your browser**. Your customer data never leaves your
computer.

**[churnlens-one.vercel.app →](https://churnlens-one.vercel.app)**

---

## Why this exists

Enterprise churn tools cost thousands a month, take weeks to set up, and are built for teams
with a dedicated analyst to interpret them. Everyone else — the solo founder, the small SaaS
team, the person who already knows their numbers but not their reasons — is left with a
spreadsheet and a gut feeling.

A risk score by itself doesn't change anyone's behavior. *"This customer is 73% likely to
churn"* tells you to worry. It doesn't tell you what to do on Monday morning. ChurnLens closes
that gap: every number comes with a reason, and every reason comes with an action.

This product is the published research behind it, made usable by anyone:

> A. Patel and A. G. Kumar, "Predicting Customer Churn in Telecom Industry: A Machine
> Learning Approach for Improving Customer Retention," *2023 IEEE 11th Region 10 Humanitarian
> Technology Conference (R10-HTC)*, 2023. DOI:
> [10.1109/R10-HTC57504.2023.10461822](https://doi.org/10.1109/R10-HTC57504.2023.10461822) ·
> [IEEE Xplore](https://ieeexplore.ieee.org/document/10461822)

## How it works

Upload a CSV. That's the whole interaction.

1. **It reads your data for you.** Columns, the churn label, an optional revenue field — all
   auto-detected. You confirm, you don't configure.
2. **It corrects for reality.** Most customer lists are mostly customers who stayed. SMOTE
   rebalances the training data so the model actually learns what a churner looks like, instead
   of just learning to guess "stayed" every time.
3. **It trains a real model**, gradient-boosted decision trees, hand-written in TypeScript,
   the same family of model that scored highest in the original research (94% accuracy).
   No Python, no GPU, no server round-trip.
4. **It grades itself honestly** on customers the model never saw during training, then shows
   you that score — not a cherry-picked one.
5. **It explains every at-risk customer** in a sentence a human can act on: *"Customer service
   calls (5) — more than double the retained-customer average."*
6. **It groups customers into action**, not just a list. "31 customers share this risk factor"
   becomes one task, not 31.
7. **It exports** the at-risk list with every probability and reason as CSV, if you want it
   somewhere else.

## What it's built on

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind v4**
- **Web Worker + Comlink** — the model trains off the main thread, so the page never freezes
- **papaparse** for CSV — everything else, including the dashboard charts, is hand-rolled CSS/SVG
  rather than a charting library, on purpose: less to download, less to trust
- **Supabase** (optional) — sign in to save aggregate analysis history; nothing works any
  worse without it
- Ships to **Vercel** as a client-only app — no backend infrastructure to run or pay for

## The machine learning, written from scratch

Everything in [`lib/ml/`](lib/ml/) is hand-rolled — no ML dependency, nothing to trust blindly:

| File | Responsibility |
| --- | --- |
| `preprocess.ts` | Column detection, encoding, leakage-safe imputation/scaling, stratified split |
| `smote.ts` | SMOTE oversampling — training split only, applied after the split, never before |
| `gbm.ts` | Gradient-boosted trees (XGBoost-style, second-order) — the model that ships |
| `metrics.ts` | Confusion matrix, accuracy/precision/recall/F1, ROC AUC — all on held-out data |
| `explain.ts` | Per-customer reasons (gated by actual risk direction, not just global importance) + cohort recommendations |
| `pipeline.ts` | Wires all of it together — what the Web Worker actually calls |

Check the math without touching the UI:

```bash
npx tsx scripts/smoke.ts
```

## Run it yourself

```bash
npm install
npm run dev        # http://localhost:3000
```

Nothing to configure. No `.env` required to use the product — accounts and saved history just
stay quietly out of the way until you turn them on.

## Turning on accounts (optional)

Only ever the *results* of an analysis are saved — counts, scores, recommendations. Never a
single row of customer data.

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor — creates the `analyses`
   table with row-level security already on.
3. Add the keys (locally in `.env.local`, or on Vercel via the dashboard/native integration):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   ```

## Privacy, by construction

There is no server for your data to reach. The CSV is parsed, the model is trained, customers
are scored, and explanations are written — all in a background thread, in your browser. Close
the tab and it's gone. That's not a policy. It's the architecture.
