#!/usr/bin/env bash
# One command: train -> calibrate -> explain (SHAP) -> export -> self-check
# parity (Python AND the TypeScript port) -> sync into the web app.
#
#   ./build.sh
#
# No manual copying, no drift between the research model and what ships.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/model/.venv"
PY="$VENV/bin/python"
WEB="$HERE/lib/ml/models"

echo "▸ Ensuring Python environment…"
if [ ! -x "$PY" ]; then
  python3 -m venv "$VENV"
fi
"$PY" -m pip install -q --upgrade pip
"$PY" -m pip install -q -r "$HERE/model/requirements.txt"

echo "▸ Training, calibrating, exporting (SMOTE in-fold; self-checks vs scikit-learn)…"
( cd "$HERE/model" && "$PY" build.py )

echo "▸ Verifying serving + portable model parity (Python, < 1e-6)…"
( cd "$HERE/model" && "$PY" -m pytest test_parity.py -q )

echo "▸ Verifying the TypeScript port matches scikit-learn + shap (< 1e-6)…"
( cd "$HERE" && npx tsx scripts/parity.test.ts )

echo "▸ Syncing portable model + metrics into the web app…"
mkdir -p "$WEB"
cp "$HERE/model/telecom.model.web.json" "$WEB/telecom.model.json"
cp "$HERE/model/telecom.metrics.json" "$WEB/telecom.metrics.json"

echo "✓ Done. Honest CV ROC-AUC + calibrated model live in lib/ml/models/."
echo "  Serve the API with:  ( cd model && .venv/bin/uvicorn serve:app --reload )"
