"""Leakage-aware validation, tuning, calibration and artifact creation.

The final test block is never used for model or calibration selection. All
features are precomputed by the existing historical-only preprocessing step;
this script verifies that contract and purges split boundaries by the number
of trading observations in each target horizon.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             confusion_matrix, f1_score, log_loss,
                             precision_score, recall_score, roc_auc_score)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from ml.calibration import SigmoidCalibratedClassifier
DATA = ROOT / "data" / "processed" / "market.parquet"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"
FEATURES = ["return_1d", "return_5d", "return_10d", "return_20d", "sma_50", "sma_200", "rsi_14", "macd", "macd_signal", "volatility_20", "volume_change", "volume_sma_20", "high_low_range", "distance_sma_50", "distance_sma_200"]
SEED = 42


def metric_dict(y, probability, threshold=0.5):
    y = np.asarray(y).astype(int)
    probability = np.clip(np.asarray(probability, dtype=float), 1e-6, 1 - 1e-6)
    prediction = (probability >= threshold).astype(int)
    return {"roc_auc": float(roc_auc_score(y, probability)) if len(np.unique(y)) == 2 else None,
            "pr_auc": float(average_precision_score(y, probability)) if len(np.unique(y)) == 2 else None,
            "positivePrevalence": float(y.mean()), "f1": float(f1_score(y, prediction, zero_division=0)),
            "precision": float(precision_score(y, prediction, zero_division=0)), "recall": float(recall_score(y, prediction, zero_division=0)),
            "brierScore": float(brier_score_loss(y, probability)), "logLoss": float(log_loss(y, np.column_stack([1 - probability, probability]), labels=[0, 1])),
            "confusionMatrix": confusion_matrix(y, prediction).tolist(), "rows": int(len(y))}


def model_factories():
    return {
        "logistic_regression": lambda params=None: Pipeline([("scale", StandardScaler()), ("model", LogisticRegression(max_iter=1000, class_weight="balanced", random_state=SEED, C=(params or {}).get("C", 1.0)))]),
        "random_forest": lambda params=None: RandomForestClassifier(n_estimators=(params or {}).get("n_estimators", 150), max_depth=(params or {}).get("max_depth"), min_samples_leaf=3, class_weight="balanced", n_jobs=-1, random_state=SEED),
        "xgboost": lambda params=None: XGBClassifier(n_estimators=(params or {}).get("n_estimators", 150), max_depth=(params or {}).get("max_depth", 4), learning_rate=(params or {}).get("learning_rate", 0.05), subsample=0.85, colsample_bytree=0.85, eval_metric="logloss", random_state=SEED, n_jobs=2),
    }


def audit(frame: pd.DataFrame) -> dict:
    ordered = frame.sort_values(["symbol", "date"])
    checks = {"rows": int(len(frame)), "symbols": int(frame.symbol.nunique()), "duplicateSymbolDate": int(frame.duplicated(["symbol", "date"]).sum()), "dateMin": str(frame.date.min()), "dateMax": str(frame.date.max()), "adjustedCloseNulls": int(frame.adjusted_close.isna().sum()), "nonPositiveAdjustedClose": int((frame.adjusted_close <= 0).sum()), "featureNulls": {feature: int(frame[feature].isna().sum()) for feature in FEATURES}}
    target_checks = {}
    for horizon in (5, 20):
        future = ordered.groupby("symbol")["adjusted_close"].shift(-horizon)
        expected = (future > ordered.adjusted_close).astype("float")
        actual = ordered[f"target_{horizon}d"]
        comparable = actual.notna() & expected.notna()
        target_checks[str(horizon)] = {"terminalRowsWithoutFutureObservation": int((~comparable).sum()), "mismatchedLabels": int((actual[comparable].astype(int) != expected[comparable].astype(int)).sum()), "positivePrevalence": float(actual.mean())}
    checks["targetAudit"] = target_checks
    checks["symbolCoverage"] = ordered.groupby("symbol").size().describe().to_dict()
    return checks


def dataset_fingerprint(frame: pd.DataFrame) -> str:
    values = frame[["date", "symbol", "adjusted_close"]].sort_values(["symbol", "date"]).to_csv(index=False).encode()
    return hashlib.sha256(values).hexdigest()


def split_blocks(frame: pd.DataFrame, horizon: int):
    dates = pd.Series(frame.date.drop_duplicates().sort_values().tolist())
    train_end = int(len(dates) * 0.60)
    valid_end = int(len(dates) * 0.75)
    test_start = int(len(dates) * 0.85)
    folds = []
    for train_end_idx, valid_start_idx, valid_end_idx in ((train_end, train_end, valid_end), (valid_end, valid_end, test_start)):
        train_stop = max(0, train_end_idx - horizon)
        valid_start = valid_start_idx
        valid_end = valid_end_idx
        folds.append({"trainEndExclusive": str(dates.iloc[train_stop]), "validationStart": str(dates.iloc[valid_start]), "validationEndExclusive": str(dates.iloc[valid_end - 1]), "train": frame.date < dates.iloc[train_stop], "validation": (frame.date >= dates.iloc[valid_start]) & (frame.date < dates.iloc[valid_end])})
    final_test_start = dates.iloc[test_start]
    return folds, frame.date >= final_test_start


def baselines(train, validation):
    prevalence = float(train.target.mean())
    constant = np.full(len(validation), prevalence)
    momentum = np.where(validation.return_20d.fillna(0).to_numpy() > 0, 0.75, 0.25)
    return {"majority_class": metric_dict(validation.target, np.full(len(validation), 1.0 if prevalence >= 0.5 else 0.0)), "historical_positive_frequency": metric_dict(validation.target, constant), "simple_momentum": metric_dict(validation.target, momentum)}


def tune(name, train, validation, target):
    grids = {"logistic_regression": [{"C": 0.1}, {"C": 1.0}, {"C": 10.0}], "random_forest": [{"n_estimators": 150, "max_depth": 8}, {"n_estimators": 150, "max_depth": None}], "xgboost": [{"n_estimators": 150, "max_depth": 3, "learning_rate": 0.05}, {"n_estimators": 150, "max_depth": 5, "learning_rate": 0.03}]}
    best = None
    for params in grids[name]:
        model = model_factories()[name](params)
        model.fit(train[FEATURES], train[target].astype(int))
        probability = model.predict_proba(validation[FEATURES])[:, 1]
        score = metric_dict(validation[target], probability)["pr_auc"]
        if best is None or score > best["score"]:
            best = {"params": params, "score": score, "model": model}
    return best


def calibrate(model, train, validation, target):
    # The base model is fit only on the historical training block. The
    # validation block is used exclusively to fit the probability calibrator.
    return SigmoidCalibratedClassifier(model).fit_calibrator(validation[FEATURES], validation[target].astype(int))


def importance(model):
    estimator = model
    if hasattr(model, "named_steps"):
        estimator = model.named_steps["model"]
    if hasattr(estimator, "coef_"):
        return {feature: float(abs(value)) for feature, value in zip(FEATURES, estimator.coef_[0])}
    if hasattr(estimator, "feature_importances_"):
        return {feature: float(value) for feature, value in zip(FEATURES, estimator.feature_importances_)}
    return {}


def main():
    if not DATA.exists():
        raise SystemExit("Processed market data not found")
    frame = pd.read_parquet(DATA)
    frame["date"] = pd.to_datetime(frame["date"], utc=True)
    audit_result = audit(frame)
    for horizon in (5, 20):
        if audit_result["targetAudit"][str(horizon)]["mismatchedLabels"]:
            raise SystemExit(f"Target audit failed for {horizon}d")
    report = {"dataset": str(DATA), "datasetFingerprint": dataset_fingerprint(frame), "createdAt": datetime.now(timezone.utc).isoformat(), "features": FEATURES, "audit": audit_result, "horizons": {}}
    for horizon in (5, 20):
        target = f"target_{horizon}d"
        usable = frame.dropna(subset=FEATURES + [target]).sort_values(["date", "symbol"]).copy()
        folds, final_test_mask = split_blocks(usable, horizon)
        pretest = usable[usable.date < usable.loc[final_test_mask, "date"].min()]
        fold_report = []
        tuned_params = {}
        for fold in folds:
            train = usable[fold["train"]]
            validation = usable[fold["validation"]]
            entry = {"dates": {key: fold[key] for key in ("trainEndExclusive", "validationStart", "validationEndExclusive")}, "rows": {"train": len(train), "validation": len(validation)}, "baselines": baselines(train.rename(columns={target: "target"}), validation.rename(columns={target: "target"}))}
            for name in model_factories():
                best = tune(name, train, validation, target)
                probability = best["model"].predict_proba(validation[FEATURES])[:, 1]
                entry.setdefault("models", {})[name] = {"params": best["params"], "metrics": metric_dict(validation[target], probability), "importance": importance(best["model"])}
                tuned_params[name] = best["params"]
            fold_report.append(entry)
        # Model selection uses only walk-forward validation PR-AUC.
        aggregate = {}
        for name in model_factories():
            values = [fold["models"][name]["metrics"]["pr_auc"] for fold in fold_report]
            aggregate[name] = {"meanPrAuc": float(np.mean(values)), "foldPrAuc": values}
        selected_name = max(aggregate, key=lambda name: aggregate[name]["meanPrAuc"])
        selected_params = tuned_params[selected_name]
        final_test_start = usable.loc[final_test_mask, "date"].min()
        final_train_cutoff = final_test_start - pd.Timedelta(days=horizon * 2)
        train_final = usable[usable.date < final_train_cutoff]
        test = usable[final_test_mask]
        base = model_factories()[selected_name](selected_params)
        base.fit(train_final[FEATURES], train_final[target].astype(int))
        # Calibrator fit uses the last 15% of the pre-test block, not final test.
        calibration_start = train_final.date.sort_values().drop_duplicates().iloc[int(train_final.date.nunique() * 0.85)]
        calibration = train_final[train_final.date >= calibration_start]
        base_train = train_final[train_final.date < calibration_start]
        calibrated_base = model_factories()[selected_name](selected_params)
        calibrated_base.fit(base_train[FEATURES], base_train[target].astype(int))
        calibrated = calibrate(calibrated_base, base_train, calibration, target)
        calibration_uncalibrated = metric_dict(calibration[target], calibrated_base.predict_proba(calibration[FEATURES])[:, 1])
        calibration_calibrated = metric_dict(calibration[target], calibrated.predict_proba(calibration[FEATURES])[:, 1])
        use_calibrated = calibration_calibrated["brierScore"] <= calibration_uncalibrated["brierScore"] and calibration_calibrated["logLoss"] <= calibration_uncalibrated["logLoss"]
        uncalibrated_p = base.predict_proba(test[FEATURES])[:, 1]
        calibrated_p = calibrated.predict_proba(test[FEATURES])[:, 1]
        test_result = {"uncalibrated": metric_dict(test[target], uncalibrated_p), "sigmoidCalibrated": metric_dict(test[target], calibrated_p)}
        scored = test[["symbol", "date", "volatility_20", target]].copy()
        scored["probability"] = calibrated_p
        per_symbol = {}
        for symbol, group in scored.groupby("symbol"):
            if len(group) >= 30:
                per_symbol[symbol] = metric_dict(group[target], group["probability"])
        volatility_cut = scored["volatility_20"].median()
        regime = {"lowVolatility": metric_dict(scored.loc[scored.volatility_20 <= volatility_cut, target], scored.loc[scored.volatility_20 <= volatility_cut, "probability"]), "highVolatility": metric_dict(scored.loc[scored.volatility_20 > volatility_cut, target], scored.loc[scored.volatility_20 > volatility_cut, "probability"])}
        artifact = MODELS / f"returns_{horizon}d.joblib"
        final_model = calibrated if use_calibrated else base
        joblib.dump({"model": final_model, "features": FEATURES, "horizon": horizon, "modelName": selected_name, "calibration": "sigmoid" if use_calibrated else "uncalibrated", "trainingDateRange": [str(base_train.date.min()), str(base_train.date.max())], "datasetFingerprint": report["datasetFingerprint"]}, artifact)
        report["horizons"][str(horizon)] = {"walkForwardFolds": fold_report, "modelAggregate": aggregate, "selectedModel": selected_name, "selectedParameters": selected_params, "finalTestDateRange": [str(test.date.min()), str(test.date.max())], "finalTest": test_result, "perSymbolMinimumRows": 30, "perSymbol": per_symbol, "volatilityRegime": {"definition": "median historical volatility_20 on the final test block", "results": regime}, "calibration": {"method": "sigmoid", "selectedForArtifact": bool(use_calibrated), "selectionRule": "choose calibration only when validation Brier score and log loss both improve", "validationUncalibrated": calibration_uncalibrated, "validationSigmoid": calibration_calibrated, "calibrationDateRange": [str(calibration.date.min()), str(calibration.date.max())]}, "artifact": str(artifact)}
    (REPORTS / "stock_model_walk_forward.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    (REPORTS / "stock_model_comparison.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
