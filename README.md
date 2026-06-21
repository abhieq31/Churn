# ChurnLens

**Predict which customers will churn, understand *why*, and know *what to do* — all in your browser.**

ChurnLens turns peer-reviewed customer-churn research into a self-serve product. Drop in
a CSV of your customers and, in seconds, you get a ranked list of at-risk customers, a
plain-English reason behind each one, and prioritized retention recommendations. The entire
machine-learning pipeline runs **client-side in your browser** — your customer data is never
uploaded.

Built on:

> A. Patel and A. G. Kumar, “Predicting Customer Churn in Telecom Industry: A Machine
> Learning Approach for Improving Customer Retention,” *2023 IEEE 11th Region 10 Humanitarian
> Technology Conference (R10-HTC)*, 2023. DOI:
> [10.1109/R10-HTC57504.2023.10461822](https://doi.org/10.1109/R10-HTC57504.2023.10461822) ·
> [IEEE Xplore](https://ieeexplore.ieee.org/document/10461822)

## What it does

1. **Auto-detects your columns** — types, the churn label, and an optional revenue/MRR field.
2. **Balances the classes with SMOTE** so the model learns rare churners properly.
3. **Trains a Random Forest** (hand-written in TypeScript, no Python, no server).
4. **Scores honestly** on a held-out test set — accuracy, precision, recall, F1, confusion matrix.
5. **Explains every at-risk customer** with the specific factors driving their risk.
6. **Recommends actions** by clustering at-risk customers into cohorts.
7. **Exports** the at-risk list (with probabilities + reasons) as CSV.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind v4**
- **Web Worker + Comlink** — the ML pipeline runs off the main thread so the UI never freezes
- **papaparse** (CSV), **recharts** (charts)
- **Supabase** (optional) — accounts + saved analysis history
- Deploys to **Vercel** as a static/client app (no backend required)

## Machine learning, from scratch

All ML lives in [`lib/ml/`](lib/ml/) with **no ML dependencies**:

| File | Responsibility |
| --- | --- |
| `preprocess.ts` | Column detection, encoding, leakage-safe imputation/scaling, stratified split |
| `smote.ts` | SMOTE oversampling (training split only, after the split) |
| `gbm.ts` | Gradient-boosted trees (XGBoost-style, second-order) — the shipped model |
| `model.ts` | CART decision tree + bagged Random Forest (alternative) + shared `ChurnModel` interface |
| `metrics.ts` | Confusion matrix, accuracy/precision/recall/F1 + ROC AUC on the held-out test set |
| `explain.ts` | Per-customer reasons (risk-direction gated) + cohort recommendations |
| `pipeline.ts` | Orchestrates the whole flow; this is what the Web Worker calls |

Validate the core without the UI:

```bash
npx tsx scripts/smoke.ts
```

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

The app is fully functional with **no configuration** — accounts/history just stay hidden.

## Optional: enable accounts + saved history (Supabase)

Only **aggregate** results are ever saved (counts, model scores, recommendations) — raw
customer rows never leave the browser.

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor (creates the
   `analyses` table with row-level security).
3. Add env vars (locally in `.env.local`, on Vercel via the dashboard or the native Supabase
   integration):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   ```

## Privacy

Your CSV is parsed, the model is trained, customers are scored, and explanations are
generated entirely in your browser (in a background Web Worker). Nothing is uploaded. The
dataset lives only in memory and is gone when you close the tab.
