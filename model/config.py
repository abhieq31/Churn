"""Dataset config for the telecom-churn factory (Python side).

The canonical BigML/Orange telecom set — the same data behind the 2023 IEEE
paper. We keep only inputs that earn their place:

  - The three `... charge` columns are perfectly collinear with their
    `... minutes` counterparts (charge = minutes x a fixed per-minute rate), so
    they carry zero extra signal. We drop them — the same feature-audit ethos as
    StrokeGuard ("delete inputs that don't earn their place").

Adding/altering features is a config change here; build.py never changes.
"""

CONFIG = {
    "name": "Telecom customer churn",
    "train_csv": "churn-bigml-80.csv",
    "test_csv": "churn-bigml-20.csv",
    "target": "Churn",  # bool True/False -> 1/0
    # "Yes"/"No" -> 1/0
    "binary": ["International plan", "Voice mail plan"],
    "categorical": ["State", "Area code"],
    "numeric": [
        "Account length",
        "Number vmail messages",
        "Total day minutes",
        "Total day calls",
        "Total eve minutes",
        "Total eve calls",
        "Total night minutes",
        "Total night calls",
        "Total intl minutes",
        "Total intl calls",
        "Customer service calls",
    ],
    "drop_cols": [
        "Total day charge",
        "Total eve charge",
        "Total night charge",
        "Total intl charge",
    ],
    # Cutoffs on the calibrated-probability scale (true prevalence ~14.6%).
    "risk_bands": {"moderate": 0.20, "higher": 0.45},
    # The paper's headline numbers, for the honest side-by-side.
    "paper": {"accuracy": 0.94, "auc": 0.91, "method": "global SMOTE + XGBoost"},
}
