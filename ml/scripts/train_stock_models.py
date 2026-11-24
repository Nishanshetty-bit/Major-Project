"""Train leakage-safe chronological return classifiers and write real metrics/artifacts."""
from datetime import datetime, timezone
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss,
                             confusion_matrix, f1_score, log_loss, precision_score,
                             recall_score, roc_auc_score)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed" / "market.parquet"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"
MODELS.mkdir(parents=True, exist_ok=True)
REPORTS.mkdir(parents=True, exist_ok=True)

FEATURES = ["return_1d", "return_5d", "return_10d", "return_20d", "sma_50", "sma_200", "rsi_14", "macd", "macd_signal", "volatility_20", "volume_change", "volume_sma_20", "high_low_range", "distance_sma_50", "distance_sma_200"]


def metrics(y, p, threshold=0.5):
    pred = (p >= threshold).astype(int)
    return {"accuracy": accuracy_score(y, pred), "precision": precision_score(y, pred, zero_division=0), "recall": recall_score(y, pred, zero_division=0), "f1": f1_score(y, pred, zero_division=0), "roc_auc": roc_auc_score(y, p) if len(np.unique(y)) == 2 else None, "pr_auc": average_precision_score(y, p) if len(np.unique(y)) == 2 else None, "brier_score": brier_score_loss(y, p), "log_loss": log_loss(y, np.column_stack([1 - p, p]), labels=[0, 1]), "confusion_matrix": confusion_matrix(y, pred).tolist(), "positive_rate": float(np.mean(y))}


def make_models(scale=False):
    lr = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)
    rf = RandomForestClassifier(n_estimators=250, min_samples_leaf=3, class_weight="balanced", n_jobs=-1, random_state=42)
    xgb = XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.05, subsample=0.85, colsample_bytree=0.85, eval_metric="logloss", random_state=42, n_jobs=2)
    return {"logistic_regression": Pipeline([("scale", StandardScaler()), ("model", lr)]) if scale else lr, "random_forest": rf, "xgboost": xgb}


def main():
    if not DATA.exists():
        raise SystemExit("Processed market data not found. Run preprocess_market_data.py first.")
    frame = pd.read_parquet(DATA).sort_values("date")
    report = {"dataset": str(DATA), "createdAt": datetime.now(timezone.utc).isoformat(), "features": FEATURES, "horizons": {}}
    dates = frame["date"].drop_duplicates().sort_values().tolist()
    train_cut, valid_cut = dates[int(len(dates) * 0.70)], dates[int(len(dates) * 0.85)]
    for horizon in (5, 20):
        target = f"target_{horizon}d"
        usable = frame.dropna(subset=FEATURES + [target]).copy()
        train = usable[usable.date < train_cut]
        valid = usable[(usable.date >= train_cut) & (usable.date < valid_cut)]
        test = usable[usable.date >= valid_cut]
        if min(len(train), len(valid), len(test)) < 20:
            raise SystemExit(f"Insufficient chronological data for {horizon}d: {len(train)}, {len(valid)}, {len(test)}")
        X_train, y_train = train[FEATURES], train[target].astype(int)
        X_valid, y_valid = valid[FEATURES], valid[target].astype(int)
        X_test, y_test = test[FEATURES], test[target].astype(int)
        models = make_models(scale=True)
        results = {}
        best_name, best_score = None, -1
        for name, model in models.items():
            model.fit(X_train, y_train)
            valid_p = model.predict_proba(X_valid)[:, 1]
            test_p = model.predict_proba(X_test)[:, 1]
            valid_metrics = metrics(y_valid, valid_p)
            test_metrics = metrics(y_test, test_p)
            results[name] = {"validation": valid_metrics, "test": test_metrics}
            score = valid_metrics["pr_auc"] or -1
            if score > best_score: best_name, best_score = name, score
        selected = models[best_name]
        selected.fit(pd.concat([X_train, X_valid]), pd.concat([y_train, y_valid]))
        artifact = MODELS / f"returns_{horizon}d.joblib"
        joblib.dump({"model": selected, "features": FEATURES, "horizon": horizon, "modelName": best_name}, artifact)
        report["horizons"][str(horizon)] = {"rows": {"train": len(train), "validation": len(valid), "test": len(test)}, "dateSplits": {"trainEndExclusive": str(train_cut), "validationEndExclusive": str(valid_cut), "testStart": str(valid_cut)}, "models": results, "selectedModel": best_name, "artifact": str(artifact)}
    (REPORTS / "stock_model_comparison.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
