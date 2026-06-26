"""Tiny FastAPI service: the calibrated telecom-churn model + exact per-customer
TreeSHAP, served from the scikit-learn pipeline itself (the authoritative path).

    uvicorn serve:app --reload          # from model/, with the venv active

POST /predict  {"State":"NY","International plan":"Yes", ... }
  -> calibrated churn probability, risk band, and the signed SHAP contributions
     (which features pushed this customer's risk up / down).
GET  /metrics  -> the full training report (CV mean+/-std, calibration, sweep).
GET  /health
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import inference

HERE = Path(__file__).resolve().parent
BUNDLE = joblib.load(HERE / "telecom_pipeline.joblib")
METRICS = json.loads((HERE / "telecom.metrics.json").read_text())

PRE = BUNDLE["preprocessor"]
GBC = BUNDLE["gbc"]
CAL = BUNDLE["calibration"]
FEATS = BUNDLE["feature_order"]
CATEGORICAL = BUNDLE["categorical"]
OUT_NAMES = list(PRE.get_feature_names_out())
EXPLAINER = shap.TreeExplainer(GBC, feature_perturbation="tree_path_dependent")
_KEYMAP = {"categorical_features": CATEGORICAL}

app = FastAPI(title="ChurnLens model API", version="1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


class Customer(BaseModel):
    # Accept any subset of the model's raw columns; missing ones are rejected.
    model_config = {"extra": "allow"}


def _band(p: float) -> str:
    b = BUNDLE["risk_bands"]
    if p < b["moderate"]:
        return "Lower"
    if p < b["higher"]:
        return "Moderate"
    return "Higher"


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    # Match training load(): "Yes"/"No" plans -> 1/0 the preprocessor expects.
    df = df.copy()
    for col in BUNDLE["binary"]:
        if col in df.columns:
            df[col] = df[col].map(inference._binary_value)
    return df


def _predict_frame(df: pd.DataFrame) -> list[dict[str, Any]]:
    missing = [f for f in FEATS if f not in df.columns]
    if missing:
        raise HTTPException(422, f"missing features: {missing}")
    raw = df
    df = _normalize(df)
    Xt = PRE.transform(df[FEATS])
    Xt = Xt.toarray() if hasattr(Xt, "toarray") else np.asarray(Xt)
    margins = GBC.decision_function(Xt)
    sv = np.asarray(EXPLAINER.shap_values(Xt))
    if sv.ndim == 3:
        sv = sv[:, :, -1]

    results = []
    for i in range(len(df)):
        margin = float(margins[i])
        proba = inference.apply_calibration(CAL, margin)
        agg: dict[str, float] = {}
        for j, name in enumerate(OUT_NAMES):
            key = inference.raw_key_for(_KEYMAP, name)
            agg[key] = agg.get(key, 0.0) + float(sv[i, j])
        factors = sorted(
            (
                {
                    "feature": k,
                    "value": _scalar(raw.iloc[i][k]),
                    "contribution": v,  # log-odds; >0 pushes churn up
                    "direction": "increases" if v >= 0 else "decreases",
                }
                for k, v in agg.items()
            ),
            key=lambda d: -abs(d["contribution"]),
        )
        results.append(
            {
                "probability": proba,
                "percent": round(proba * 100, 1),
                "riskBand": _band(proba),
                "baseProbability": BUNDLE["population_risk"],
                "timesAverage": proba / BUNDLE["population_risk"],
                "margin": margin,
                "factors": factors,
            }
        )
    return results


def _scalar(v: Any) -> Any:
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    return v


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": BUNDLE["name"], "features": FEATS}


@app.get("/metrics")
def metrics() -> dict[str, Any]:
    return METRICS


@app.post("/predict")
def predict(customer: Customer) -> dict[str, Any]:
    df = pd.DataFrame([customer.model_dump()])
    return _predict_frame(df)[0]


@app.post("/predict/batch")
def predict_batch(customers: list[Customer]) -> list[dict[str, Any]]:
    df = pd.DataFrame([c.model_dump() for c in customers])
    return _predict_frame(df)
