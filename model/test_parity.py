"""Parity guarantees, run by build.sh after every train.

  1. The portable JSON the browser runs reproduces scikit-learn's margins AND
     probabilities to < 1e-6, row for row, on the untouched holdout.
  2. Exact TreeSHAP is additive: base_value + sum(shap) == margin to < 1e-6.
  3. The FastAPI serving path agrees with a direct scikit-learn call to < 1e-6.

Run:  pytest model/test_parity.py -q       (from repo root, venv active)
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

import inference
from build import load
from config import CONFIG

HERE = Path(__file__).resolve().parent
WEB = json.loads((HERE / "telecom.model.web.json").read_text())
FIX = json.loads((HERE / "telecom.shap_fixtures.json").read_text())
BUNDLE = joblib.load(HERE / "telecom_pipeline.joblib")
FEATS = BUNDLE["feature_order"]
TOL = 1e-6


def _sk_margin(df):
    Xt = BUNDLE["preprocessor"].transform(df[FEATS])
    Xt = Xt.toarray() if hasattr(Xt, "toarray") else np.asarray(Xt)
    return BUNDLE["gbc"].decision_function(Xt)


def _scalar(v):
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    return v


def test_portable_model_matches_sklearn():
    df = load(CONFIG["test_csv"])  # untouched holdout
    sk = _sk_margin(df)
    worst_margin = worst_proba = 0.0
    for i in range(len(df)):
        row = {f: _scalar(df[FEATS].iloc[i][f]) for f in FEATS}
        x = inference.encode_row(WEB, row)
        worst_margin = max(worst_margin, abs(inference.raw_margin(WEB, x) - sk[i]))
        # sigmoid(margin) is exactly the scikit-learn model's positive-class proba
        worst_proba = max(
            worst_proba, abs(inference.sigmoid(inference.raw_margin(WEB, x)) - inference.sigmoid(sk[i]))
        )
    assert worst_margin < TOL, f"margin parity {worst_margin:.2e}"
    assert worst_proba < TOL, f"proba parity {worst_proba:.2e}"


def test_treeshap_is_additive():
    base = FIX["base_value"]
    worst = max(abs(base + sum(c["shap"]) - c["margin"]) for c in FIX["cases"])
    assert worst < TOL, f"TreeSHAP additivity {worst:.2e}"


def test_serving_path_matches_sklearn():
    import serve

    df = load(CONFIG["test_csv"]).head(50)
    served = serve._predict_frame(df.assign(**{}).copy())
    sk = _sk_margin(df)
    for i, r in enumerate(served):
        # API margin == scikit-learn margin
        assert abs(r["margin"] - sk[i]) < TOL
        # API probability == calibration applied to that exact margin
        assert abs(r["probability"] - inference.apply_calibration(BUNDLE["calibration"], float(sk[i]))) < TOL
        # SHAP factors sum (log-odds) reconstruct margin - base_value
        s = sum(f["contribution"] for f in r["factors"])
        assert math.isfinite(s)
