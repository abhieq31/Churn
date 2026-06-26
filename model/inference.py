"""Pure-Python reference for the exported web model.

This mirrors, line for line in spirit, what `lib/ml/canonical.ts` does in the
browser: encode a raw row exactly as scikit-learn's ColumnTransformer would,
run the gradient-boosted trees to a raw margin, then map the margin to a
calibrated probability. test_parity.py uses it to prove the portable JSON
reproduces the scikit-learn pipeline to < 1e-6 — the same guarantee the TS port
is then held to.
"""
from __future__ import annotations

import math
from typing import Any


def sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    e = math.exp(z)
    return e / (1.0 + e)


def encode_row(model: dict[str, Any], row: dict[str, Any]) -> list[float]:
    """Raw CSV row -> the numeric vector the trees index into, in
    ColumnTransformer output order (numeric, then binary, then one-hot)."""
    vec: list[float] = []
    for name in model["out_feature_order"]:
        kind, rest = name.split("__", 1)
        if kind == "numeric":
            sc = model["scaler"][rest]
            vec.append((float(row[rest]) - sc["mean"]) / sc["scale"])
        elif kind == "binary":
            vec.append(_binary_value(row[rest]))
        else:  # categorical one-hot: rest == "<col>_<category>"
            col = _category_column(model["categorical_features"], rest)
            cat = rest[len(col) + 1:]
            vec.append(1.0 if str(row[col]) == cat else 0.0)
    return vec


def _binary_value(v: Any) -> float:
    s = str(v).strip().lower()
    if s in ("yes", "true", "1"):
        return 1.0
    if s in ("no", "false", "0"):
        return 0.0
    return float(v)


def _category_column(categorical: list[str], rest: str) -> str:
    for col in categorical:
        if rest == col or rest.startswith(col + "_"):
            return col
    return rest


def raw_key_for(model: dict[str, Any], out_name: str) -> str:
    """Map an encoded feature name back to its raw CSV column."""
    kind, rest = out_name.split("__", 1)
    if kind in ("numeric", "binary"):
        return rest
    return _category_column(model["categorical_features"], rest)


def _eval_tree(tree: dict[str, Any], x: list[float]) -> float:
    node = 0
    left, right = tree["children_left"], tree["children_right"]
    while left[node] != -1:
        f = tree["feature"][node]
        node = left[node] if x[f] <= tree["threshold"][node] else right[node]
    return tree["value"][node]


def raw_margin(model: dict[str, Any], x: list[float]) -> float:
    m = model["base_margin"]
    lr = model["learning_rate"]
    for tree in model["trees"]:
        m += lr * _eval_tree(tree, x)
    return m


def apply_calibration(calib: dict[str, Any], margin: float) -> float:
    """Map a raw log-odds margin to a calibrated probability."""
    if calib["method"] == "platt":
        return sigmoid(calib["A"] * margin + calib["B"])
    # isotonic: piecewise-linear over the UNCALIBRATED probability (sigmoid of margin)
    p = sigmoid(margin)
    xs, ys = calib["x"], calib["y"]
    if p <= xs[0]:
        return ys[0]
    if p >= xs[-1]:
        return ys[-1]
    lo, hi = 0, len(xs) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if xs[mid] <= p:
            lo = mid
        else:
            hi = mid
    span = xs[hi] - xs[lo]
    if span == 0:
        return ys[lo]
    t = (p - xs[lo]) / span
    return ys[lo] + t * (ys[hi] - ys[lo])


def predict_web(model: dict[str, Any], row: dict[str, Any]) -> float:
    """Full portable-model probability for one raw row."""
    return apply_calibration(model["calibration"], raw_margin(model, encode_row(model, row)))
