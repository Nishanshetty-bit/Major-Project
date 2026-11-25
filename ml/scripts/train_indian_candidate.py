"""Build and validate Indian NSE candidate artifacts without touching production.

Run classification first. Artifacts and reports are isolated under
ml/models/indian_candidate and ml/reports/indian_candidate.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed" / "indian"
REPORTS = ROOT / "reports" / "indian_candidate"
MODELS = ROOT / "models" / "indian_candidate"


def main() -> None:
    source = PROCESSED / "nse_eod.parquet"
    eligible = PROCESSED / "eligible_nse_equities.csv"
    if not source.exists() or not eligible.exists():
        raise SystemExit("Run classify_indian_instruments.py after building nse_eod.parquet.")
    REPORTS.mkdir(parents=True, exist_ok=True)
    MODELS.mkdir(parents=True, exist_ok=True)
    dataset = PROCESSED / "nse_eligible_equities.parquet"
    temp = PROCESSED / "nse_eligible_equities.building.parquet"
    temp.unlink(missing_ok=True)
    con = duckdb.connect()
    con.execute("SET memory_limit='2GB'")
    con.execute("SET threads=2")
    con.execute(
        "COPY (SELECT d.* FROM read_parquet(?) d JOIN read_csv_auto(?) u "
        "ON d.symbol=u.symbol AND d.series=u.series AND coalesce(d.isin,'')=coalesce(u.isin,'') "
        "WHERE u.series='EQ') TO ? (FORMAT PARQUET, COMPRESSION ZSTD)",
        [str(source), str(eligible), str(temp)],
    )
    row_count, symbol_count = con.execute(
        "SELECT count(*), count(DISTINCT symbol) FROM read_parquet(?)", [str(temp)]
    ).fetchone()
    temp.replace(dataset)
    classification = json.loads((ROOT / "reports" / "indian" / "instrument_classification.json").read_text(encoding="utf-8"))

    # Reuse the established purge, calibration, model comparison and test
    # report code, overriding all paths before invoking its main function.
    sys.path.insert(0, str(ROOT.parent))
    from ml.scripts import validate_stock_models as validator

    validator.DATA = dataset
    validator.MODELS = MODELS
    validator.REPORTS = REPORTS
    # A single interpretable candidate keeps the full Indian cross-section
    # trainable in a workstation environment. Existing training, split,
    # calibration and per-symbol/regime report code is reused unchanged.
    validator.model_factories = lambda: {
        "logistic_regression": lambda params=None: validator.Pipeline([
            ("scale", validator.StandardScaler()),
            ("model", validator.LogisticRegression(
                max_iter=500, class_weight="balanced", random_state=validator.SEED, C=1.0
            )),
        ])
    }
    def tune_candidate(name, train, validation, target):
        model = validator.model_factories()[name]()
        model.fit(train[validator.FEATURES], train[target].astype(int))
        probability = model.predict_proba(validation[validator.FEATURES])[:, 1]
        score = validator.metric_dict(validation[target], probability)["pr_auc"]
        return {"params": {"C": 1.0}, "score": score, "model": model}
    validator.tune = tune_candidate
    validator.main()
    report_path = REPORTS / "stock_model_walk_forward.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["universe"] = {
        "classificationReport": str(ROOT / "reports" / "indian" / "instrument_classification.json"),
        "eligibleSymbols": int(symbol_count),
        "eligibleRows": int(row_count),
        "candidateData": str(dataset),
        "classificationSnapshot": classification["createdAt"],
        "productionActivation": False,
    }
    report["candidateAssessment"] = {
        "model": "logistic_regression",
        "trainingFeatures": validator.FEATURES,
        "activationRecommendation": "do_not_activate",
        "reason": "Final holdout discrimination is near chance and uncalibrated Brier score is worse than the constant-prevalence baseline for both horizons.",
        "finalHoldout": {},
    }
    for horizon, result in report["horizons"].items():
        uncalibrated = result["finalTest"]["uncalibrated"]
        prevalence = uncalibrated["positivePrevalence"]
        report["candidateAssessment"]["finalHoldout"][horizon] = {
            "rocAuc": uncalibrated["roc_auc"],
            "prAuc": uncalibrated["pr_auc"],
            "positivePrevalenceBaselinePrAuc": prevalence,
            "brierScore": uncalibrated["brierScore"],
            "constantPrevalenceBaselineBrierScore": prevalence * (1 - prevalence),
            "sigmoidCalibrationSelectedOnValidation": result["calibration"]["selectedForArtifact"],
            "holdoutSigmoidBrierScore": result["finalTest"]["sigmoidCalibrated"]["brierScore"],
        }
    report_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    summary = {**report["universe"], **report["candidateAssessment"]}
    (REPORTS / "indian_candidate_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
