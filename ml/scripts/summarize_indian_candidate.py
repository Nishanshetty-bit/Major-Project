"""Add a concise, baseline-aware activation assessment to the candidate report."""
import json
from pathlib import Path


def summarize(report_path: Path) -> dict:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["candidateAssessment"] = {
        "model": "logistic_regression",
        "trainingFeatures": report["features"],
        "activationRecommendation": "do_not_activate",
        "reason": "Final holdout discrimination is near chance and uncalibrated Brier score is worse than the constant-prevalence baseline for both horizons.",
        "finalHoldout": {},
    }
    for horizon, result in report["horizons"].items():
        metrics = result["finalTest"]["uncalibrated"]
        prevalence = metrics["positivePrevalence"]
        report["candidateAssessment"]["finalHoldout"][horizon] = {
            "rocAuc": metrics["roc_auc"],
            "prAuc": metrics["pr_auc"],
            "positivePrevalenceBaselinePrAuc": prevalence,
            "brierScore": metrics["brierScore"],
            "constantPrevalenceBaselineBrierScore": prevalence * (1 - prevalence),
            "sigmoidCalibrationSelectedOnValidation": result["calibration"]["selectedForArtifact"],
            "holdoutSigmoidBrierScore": result["finalTest"]["sigmoidCalibrated"]["brierScore"],
        }
    report_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    summary = {**report["universe"], **report["candidateAssessment"]}
    summary_path = report_path.parent / "indian_candidate_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


if __name__ == "__main__":
    summarize(Path(__file__).resolve().parents[1] / "reports" / "indian_candidate" / "stock_model_walk_forward.json")
