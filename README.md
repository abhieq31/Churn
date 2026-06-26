# ChurnLens

**Churn is a leak in the rocket. You don't fix a leak by writing a report about it — you find the part that's failing and you fix that part.**

ChurnLens finds the part. Upload a CSV of your customers. It tells you who's about to leave,
the specific variable causing it, and the action that moves the number. No dashboard to
interpret. No analyst required. The output is a decision, not a chart.

When you upload your own data it runs entirely in your browser — there is no server in the loop,
so your customer rows never leave the page. The canonical telecom model is trained offline by a
Python factory and **verified to run identically in the browser to `< 1e-6`**.

**[churnlens-one.vercel.app →](https://churnlens-one.vercel.app)**

---

## First principles

Strip the problem to physics: a subscription business has a revenue inflow (new customers) and
a leak (churn). Most companies instrument the inflow obsessively and the leak barely at all.
That's backwards — plugging a 2-point leak on a $10M ARR base is worth roughly $200K/year, and
it's usually cheaper than acquiring the customers to replace the loss.

A number without a reason is not an answer — it's homework. So this is rebuilt from the math up,
on top of validated, published research:

> A. Patel and A. G. Kumar, "Predicting Customer Churn in Telecom Industry: A Machine
> Learning Approach for Improving Customer Retention," *2023 IEEE 11th Region 10 Humanitarian
> Technology Conference (R10-HTC)*, 2023. DOI:
> [10.1109/R10-HTC57504.2023.10461822](https://doi.org/10.1109/R10-HTC57504.2023.10461822) ·
> [IEEE Xplore](https://ieeexplore.ieee.org/document/10461822)

## Honest before clever — the SMOTE-leakage fix

The paper reported ~94% accuracy. That number doesn't survive scrutiny, and shipping it would be
dishonest, so here is the correction in full:

- **The bug.** The paper applied **SMOTE to the entire dataset before the train/test split**.
  SMOTE manufactures synthetic churners by interpolating real ones — so a synthetic copy of a
  test-set churner can end up in the training set. The model is quietly graded on data it has
  already seen. Every metric drifts upward.
- **The fix.** SMOTE now lives **inside an `imblearn` pipeline**, refit separately on each
  cross-validation fold's *training* rows. No test row is ever synthesised from.
- **The honest number.** Cross-validated, leakage-free, on the canonical BigML telecom set:
  **ROC-AUC 0.911 ± 0.016** (5-fold, tuned), **0.913** on a fully held-out test set. That's in
  the same ballpark as the paper's AUC — because ROC-AUC is rank-based and fairly robust to this
  leak. What the leak really inflated was **accuracy**, and at {~}14.6% churn, accuracy was never
  the right metric: predicting "nobody churns" already scores 85%.
- **What the paper never did.** We also **calibrate** the probabilities (Brier 0.046) and report
  the full precision/recall trade-off, so the risk numbers actually mean what they say.

## What it does, step by step

1. Reads your CSV and guesses the schema — churn column, revenue column, feature columns. You
   confirm; you don't configure from scratch.
2. **5-fold cross-validation with SMOTE inside each fold.** Reports ROC-AUC as **mean ± std**, not
   one lucky split.
3. **Calibrates** the probabilities — fits both **Platt** (sigmoid) and **isotonic**, keeps the
   lower **Brier score**, and maps the SMOTE-balanced scores back to the true churn rate. "30%
   risk" now means ~30% actually churn.
4. Trains gradient-boosted trees (the XGBoost family that topped the paper's benchmark), then
   evaluates ROC-AUC, Brier, a reliability curve, and a full threshold sweep on held-out data.
5. **Explains every prediction with exact TreeSHAP** — the same algorithm as the Python `shap`
   package — showing which features pushed *this* customer's risk up or down, and by how much.
6. A **decision-threshold slider** shows precision / recall / F1 at every cut-off; the at-risk
   list and revenue-at-risk update live.
7. Groups customers by shared cause into one task instead of a hundred alerts, and exports the
   list as CSV.

## The research factory + one command

The canonical telecom model is built in [`model/`](model/) with scikit-learn, imbalanced-learn,
and `shap`. One command trains, calibrates, explains, exports, **self-checks parity against
scikit-learn (and the TypeScript port against `shap`) to `< 1e-6`**, and syncs the result into the
app:

```bash
./build.sh
```

It writes a portable `lib/ml/models/telecom.model.json` (the gradient-boosted trees + calibration)
and a `telecom.metrics.json` the Science page renders. Two runtimes, one model, verified identical:

```bash
# Option A — the browser. Nothing leaves the page.
npm run dev

# Option B — a tiny FastAPI endpoint serving the scikit-learn model + exact SHAP
( cd model && .venv/bin/uvicorn serve:app --reload )
#   POST /predict  -> calibrated probability + per-feature SHAP
#   GET  /metrics  -> CV mean±std, calibration, threshold sweep
```

Point the app at the API by setting `NEXT_PUBLIC_CHURN_API_URL`; leave it unset and everything
runs in-browser. The API is optional, exactly like accounts.

## The model, in code

The browser pipeline in [`lib/ml/`](lib/ml/) is hand-written — a product whose pitch is "trust
the math" can't hide the math:

| File | Job |
| --- | --- |
| `preprocess.ts` | Column detection, encoding, leakage-safe imputation/scaling, stratified split + folds |
| `smote.ts` | Synthetic oversampling — fit strictly inside each training fold |
| `gbm.ts` | Gradient-boosted trees (XGBoost-style, second-order Newton) — the shipped model |
| `treeshap.ts` | Exact path-dependent TreeSHAP — identical to the Python `shap` package |
| `calibrate.ts` | Platt + isotonic calibration, chosen by Brier score |
| `metrics.ts` | ROC-AUC, Brier, reliability curve, threshold sweep — held-out data only |
| `canonical.ts` | Runs the Python-exported model natively in TS (the `< 1e-6` parity target) |
| `explain.ts` | Per-customer causal reasons + cohort-level actions |
| `pipeline.ts` | The full sequence the Web Worker runs |

Verify the math yourself, no UI required:

```bash
npx tsx scripts/smoke.ts          # the full client-side pipeline on sample data
npx tsx scripts/parity.test.ts    # TS port == scikit-learn + shap, < 1e-6
( cd model && .venv/bin/pytest test_parity.py -q )   # serving + portable model parity
```

## Engineering

- **Next.js 16 / React 19 / TypeScript / Tailwind v4** — current tooling, no legacy weight.
- **Web Worker + Comlink** — cross-validation, SMOTE, calibration and SHAP never touch the render thread.
- **papaparse** for CSV; every chart is hand-rolled CSS/SVG. A charting library for a few static plots is dead weight.
- **Python factory** — scikit-learn, imbalanced-learn, `shap`, FastAPI. Offline/optional; the browser product needs none of it.
- **Supabase**, optional — only *aggregate* output is ever saved, never a raw customer row.
- Deployed on **Vercel**.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Zero configuration required. Accounts (Supabase) and the FastAPI endpoint are both add-ons, never
gates — set `supabase/schema.sql` + `NEXT_PUBLIC_SUPABASE_*` for saved history, or don't.

## Privacy is a side effect of good engineering

When you analyze your own data there's no server for it to reach, so there's no server that can
leak it. Close the tab and the data is gone, because it was never anywhere else to begin with.
