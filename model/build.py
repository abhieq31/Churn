"""ChurnLens model factory — the honest re-do of the 2023 IEEE paper.

One run trains + tunes a gradient-boosted classifier, **with SMOTE inside an
imbalanced-learn Pipeline so it only ever sees a fold's training rows** (the fix
for the paper's global-SMOTE leakage), reports cross-validated ROC-AUC as
mean +/- std, calibrates (Platt vs isotonic, picked by Brier), explains with
exact TreeSHAP, and exports a portable JSON the browser runs natively — all
self-checked against scikit-learn to < 1e-6.

Run:  python model/build.py
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    log_loss,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_predict, cross_val_score
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import inference
from config import CONFIG

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
SEED = 42
N_FOLDS = 5


# ---------------------------------------------------------------- data + pipe

def load(csv: str) -> pd.DataFrame:
    df = pd.read_csv(DATA / csv)
    df = df.drop(columns=[c for c in CONFIG["drop_cols"] if c in df.columns])
    for c in CONFIG["binary"]:
        df[c] = df[c].map({"Yes": 1, "No": 0}).astype(int)
    df[CONFIG["target"]] = df[CONFIG["target"]].astype(str).map(
        {"True": 1, "False": 0, "1": 1, "0": 0}
    ).astype(int)
    return df


def preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        [
            ("numeric", StandardScaler(), CONFIG["numeric"]),
            ("binary", "passthrough", CONFIG["binary"]),
            ("categorical", OneHotEncoder(handle_unknown="ignore"), CONFIG["categorical"]),
        ]
    )


def pipe(clf) -> ImbPipeline:
    # SMOTE sits BETWEEN preprocessing and the classifier, so cross-validation
    # fits it only on each fold's training rows. No test row is ever synthesised
    # from — that is the whole point.
    return ImbPipeline(
        [("preprocessor", preprocessor()), ("smote", SMOTE(random_state=SEED)), ("classifier", clf)]
    )


# ---------------------------------------------------------------- calibration

def fit_calibrators(eval_pipe, X, y, cv):
    """OOF margins -> Platt + isotonic. Returns both, each as a portable dict."""
    margins = cross_val_predict(eval_pipe, X, y, cv=cv, method="decision_function")
    platt = LogisticRegression(max_iter=1000).fit(margins.reshape(-1, 1), y)
    platt_cal = {"method": "platt", "A": float(platt.coef_[0][0]), "B": float(platt.intercept_[0])}

    iso = IsotonicRegression(out_of_bounds="clip").fit(_sig(margins), y)
    iso_cal = {
        "method": "isotonic",
        "x": [float(v) for v in iso.X_thresholds_],
        "y": [float(v) for v in iso.y_thresholds_],
    }
    return platt_cal, iso_cal


def _sig(z):
    return 1.0 / (1.0 + np.exp(-z))


def calibrated_proba(cal, margins):
    return np.array([inference.apply_calibration(cal, float(m)) for m in margins])


# ---------------------------------------------------------------- export

def extract_trees(gbc, Xt0):
    lr = float(gbc.learning_rate)
    trees = []
    for est in gbc.estimators_[:, 0]:
        t = est.tree_
        trees.append(
            {
                "children_left": t.children_left.tolist(),
                "children_right": t.children_right.tolist(),
                "feature": t.feature.tolist(),
                "threshold": t.threshold.tolist(),
                "value": t.value.reshape(-1).tolist(),
                "cover": t.weighted_n_node_samples.tolist(),
            }
        )
    # base margin = decision_function - lr * sum(tree outputs), constant across rows
    summed = sum(_eval(tr, Xt0) for tr in trees)
    base = float(gbc.decision_function(Xt0.reshape(1, -1))[0] - lr * summed)
    return base, lr, trees


def _eval(tree, x):
    node, L, R = 0, tree["children_left"], tree["children_right"]
    while L[node] != -1:
        node = L[node] if x[tree["feature"][node]] <= tree["threshold"][node] else R[node]
    return tree["value"][node]


def build_web_model(pre, gbc, calibration, population_risk, encoded_sample):
    num = pre.named_transformers_["numeric"]
    cat = pre.named_transformers_["categorical"]
    out_names = list(pre.get_feature_names_out())
    # one representative encoded row to pin the constant base margin
    base, lr, trees = extract_trees(gbc, encoded_sample)
    return {
        "model_type": "gradient_boosting",
        "name": CONFIG["name"],
        "base_margin": base,
        "learning_rate": lr,
        "trees": trees,
        "calibration": calibration,
        "population_risk": population_risk,
        "risk_bands": CONFIG["risk_bands"],
        "raw_feature_order": CONFIG["numeric"] + CONFIG["binary"] + CONFIG["categorical"],
        "numeric_features": CONFIG["numeric"],
        "binary_features": CONFIG["binary"],
        "categorical_features": CONFIG["categorical"],
        "scaler": {
            f: {"mean": float(num.mean_[i]), "scale": float(num.scale_[i])}
            for i, f in enumerate(CONFIG["numeric"])
        },
        "categories": {
            f: [str(v) for v in cat.categories_[i]] for i, f in enumerate(CONFIG["categorical"])
        },
        "out_feature_order": out_names,
    }


def _encode_first(pre, df, feats):
    xt = pre.transform(df[feats].iloc[[0]])
    xt = xt.toarray() if hasattr(xt, "toarray") else np.asarray(xt)
    return xt[0]


# ---------------------------------------------------------------- main

def build():
    feats = CONFIG["numeric"] + CONFIG["binary"] + CONFIG["categorical"]
    target = CONFIG["target"]

    train = load(CONFIG["train_csv"])
    test = load(CONFIG["test_csv"])
    full = pd.concat([train, test], ignore_index=True)
    Xtr, ytr = train[feats], train[target]
    Xte, yte = test[feats], test[target]
    cv = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)

    # 1. Cross-validated ROC-AUC, SMOTE strictly inside each fold.
    print("  cross-validating (SMOTE inside each fold)…")
    candidates = {
        "logistic_regression": LogisticRegression(max_iter=2000),
        "random_forest": RandomForestClassifier(n_estimators=300, random_state=SEED),
        "gradient_boosting": GradientBoostingClassifier(random_state=SEED),
    }
    cv_results = {}
    for name, clf in candidates.items():
        s = cross_val_score(pipe(clf), Xtr, ytr, cv=cv, scoring="roc_auc", n_jobs=-1)
        cv_results[name] = {"cv_roc_auc_mean": float(s.mean()), "cv_roc_auc_std": float(s.std())}
        print(f"    {name:22} {s.mean():.4f} +/- {s.std():.4f}")

    # 2. Tune the gradient booster (still SMOTE-in-fold).
    print("  tuning gradient booster…")
    grid = GridSearchCV(
        pipe(GradientBoostingClassifier(random_state=SEED)),
        {
            "classifier__n_estimators": [150, 250],
            "classifier__max_depth": [2, 3],
            "classifier__learning_rate": [0.05, 0.1],
        },
        cv=cv, scoring="roc_auc", n_jobs=-1,
    ).fit(Xtr, ytr)
    best = {k.replace("classifier__", ""): v for k, v in grid.best_params_.items()}

    def make_pipe():
        return pipe(GradientBoostingClassifier(random_state=SEED, **best))

    # 3. Calibrate (Platt vs isotonic) on the train fold, judge on the holdout.
    eval_pipe = make_pipe().fit(Xtr, ytr)
    platt_cal, iso_cal = fit_calibrators(make_pipe(), Xtr, ytr, cv)
    margins_te = eval_pipe.decision_function(Xte)
    chosen, calib_comp = pick_calibration(platt_cal, iso_cal, margins_te, yte)

    # 4. Honest holdout metrics on the calibrated probabilities.
    proba_te = calibrated_proba(chosen, margins_te)
    sweep = threshold_sweep(yte.to_numpy(), proba_te)
    op = max(sweep, key=lambda r: r["f1"])  # F1-optimal operating point
    ypred = (proba_te >= op["threshold"]).astype(int)
    metrics = {
        "condition": "telecom",
        "name": CONFIG["name"],
        "best_model": "gradient_boosting",
        "best_params": best,
        "cv_results": cv_results,
        "tuned_cv_roc_auc": float(grid.best_score_),
        "test_roc_auc": float(roc_auc_score(yte, proba_te)),
        "test_pr_auc": float(average_precision_score(yte, proba_te)),
        "calibration": calib_comp,
        "chosen_calibration": chosen["method"],
        "calibration_curve": reliability(yte.to_numpy(), proba_te),
        "threshold_sweep": sweep,
        "operating_threshold": op["threshold"],
        "classification_report": classification_report(yte, ypred, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(yte, ypred).tolist(),
        "n_train": int(len(train)),
        "n_test": int(len(test)),
        "positive_rate": float(full[target].mean()),
        "paper": CONFIG["paper"],
    }

    # 5. Final model on ALL data; recalibrate; population risk.
    final = make_pipe().fit(full[feats], full[target])
    platt_f, iso_f = fit_calibrators(make_pipe(), full[feats], full[target], cv)
    final_cal = platt_f if chosen["method"] == "platt" else iso_f
    margins_full = final.decision_function(full[feats])
    proba_full = calibrated_proba(final_cal, margins_full)
    population_risk = float(proba_full.mean())
    metrics["population_risk"] = population_risk

    pre = final.named_steps["preprocessor"]
    gbc = final.named_steps["classifier"]
    encoded_sample = _encode_first(pre, full, feats)

    # 6. Exact TreeSHAP (margin scale) + global importances.
    shap_globals, fixtures = compute_shap(pre, gbc, final_cal, full, feats)
    metrics["shap_global"] = shap_globals
    metrics["n_features_encoded"] = len(pre.get_feature_names_out())

    # 7. Export: serving bundle, metrics, portable web model, parity fixtures.
    web = build_web_model(pre, gbc, final_cal, population_risk, encoded_sample)
    joblib.dump(
        {"preprocessor": pre, "gbc": gbc, "calibration": final_cal,
         "feature_order": feats, "numeric": CONFIG["numeric"], "binary": CONFIG["binary"],
         "categorical": CONFIG["categorical"], "risk_bands": CONFIG["risk_bands"],
         "population_risk": population_risk, "name": CONFIG["name"]},
        HERE / "telecom_pipeline.joblib",
    )
    (HERE / "telecom.metrics.json").write_text(json.dumps(metrics, indent=2))
    (HERE / "telecom.model.web.json").write_text(json.dumps(web, indent=2))
    (HERE / "telecom.shap_fixtures.json").write_text(json.dumps(fixtures, indent=2))

    # 8. Self-checks vs scikit-learn.
    verify(web, final, full, feats)

    print(
        f"\n  {CONFIG['name']}: tuned CV ROC-AUC {grid.best_score_:.4f}  "
        f"holdout {metrics['test_roc_auc']:.4f}  Brier {calib_comp[chosen['method']]['brier']:.4f}  "
        f"calibration={chosen['method']}"
    )
    print(f"  paper claimed AUC {CONFIG['paper']['auc']} via {CONFIG['paper']['method']}")


def pick_calibration(platt_cal, iso_cal, margins_te, yte):
    comp = {}
    for cal in (platt_cal, iso_cal):
        p = np.clip(calibrated_proba(cal, margins_te), 1e-7, 1 - 1e-7)
        comp[cal["method"]] = {
            "brier": float(brier_score_loss(yte, p)),
            "log_loss": float(log_loss(yte, p)),
        }
    chosen = platt_cal if comp["platt"]["brier"] <= comp["isotonic"]["brier"] else iso_cal
    return chosen, comp


def threshold_sweep(y, proba, n=99):
    out = []
    for t in np.linspace(0.01, 0.99, n):
        pred = (proba >= t).astype(int)
        p, r, f1, _ = precision_recall_fscore_support(
            y, pred, average="binary", zero_division=0
        )
        out.append({"threshold": float(t), "precision": float(p), "recall": float(r), "f1": float(f1)})
    return out


def reliability(y, proba, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    pts = []
    for i in range(bins):
        m = (proba >= edges[i]) & (proba < edges[i + 1] if i < bins - 1 else proba <= edges[i + 1])
        if m.sum() == 0:
            continue
        pts.append({"pred": float(proba[m].mean()), "obs": float(y[m].mean()), "count": int(m.sum())})
    return pts


def compute_shap(pre, gbc, calibration, full, feats):
    import shap

    Xt = pre.transform(full[feats])
    Xt = Xt.toarray() if hasattr(Xt, "toarray") else np.asarray(Xt)
    explainer = shap.TreeExplainer(gbc, feature_perturbation="tree_path_dependent")
    sv = np.asarray(explainer.shap_values(Xt))
    if sv.ndim == 3:  # some versions return (n, features, classes)
        sv = sv[:, :, -1]
    out_names = list(pre.get_feature_names_out())

    # Aggregate |shap| to raw columns for a global importance ranking.
    web_stub = {"categorical_features": CONFIG["categorical"]}
    agg = {}
    for j, name in enumerate(out_names):
        key = inference.raw_key_for(web_stub, name)
        agg[key] = agg.get(key, 0.0) + float(np.abs(sv[:, j]).mean())
    total = sum(agg.values()) or 1.0
    shap_global = sorted(
        ({"column": k, "importance": v / total} for k, v in agg.items()),
        key=lambda d: -d["importance"],
    )

    # Fixtures: a spread of rows for the TS parity test (raw row + encoded vec +
    # expected per-encoded shap + expected calibrated proba + base value).
    idx = np.linspace(0, len(full) - 1, 12).astype(int)
    base = float(explainer.expected_value if np.ndim(explainer.expected_value) == 0
                 else np.asarray(explainer.expected_value).ravel()[-1])
    fixtures = {"base_value": base, "out_feature_order": out_names, "cases": []}
    for i in idx:
        row = {f: _json_scalar(full[feats].iloc[i][f]) for f in feats}
        margin = float(gbc.decision_function(Xt[i].reshape(1, -1))[0])
        fixtures["cases"].append({
            "row": row,
            "encoded": [float(v) for v in Xt[i]],
            "margin": margin,
            "proba": float(inference.apply_calibration(calibration, margin)),
            "shap": [float(v) for v in sv[i]],
        })
    # invariant: base + sum(shap) == margin
    for c in fixtures["cases"]:
        assert abs(base + sum(c["shap"]) - c["margin"]) < 1e-6, "TreeSHAP additivity broke"
    return shap_global, fixtures


def _json_scalar(v):
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    return v


def verify(web, pipeline, full, feats):
    worst = 0.0
    for i in range(len(full)):
        row = {f: _json_scalar(full[feats].iloc[i][f]) for f in feats}
        x = inference.encode_row(web, row)
        # margin parity vs the scikit-learn pipeline's margin
        sk_margin = float(pipeline.decision_function(full[feats].iloc[[i]])[0])
        worst = max(worst, abs(inference.raw_margin(web, x) - sk_margin))
    assert worst < 1e-6, f"web model margin diverges from scikit-learn ({worst:.2e})"
    print(f"  self-check: portable model matches scikit-learn margins to {worst:.2e} (< 1e-6)")


if __name__ == "__main__":
    print("Building telecom churn model:")
    build()
    print("OK — portable model verified against scikit-learn within 1e-6")
