from pathlib import Path
from typing import Any
import joblib
import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from .sentiment_service import predict_sentiment

ROOT = Path(__file__).resolve().parent
MARKET = ROOT / "data" / "processed" / "market.parquet"
MODELS = ROOT / "models"


def return_prediction(symbol: str) -> dict[str, Any]:
    frame = pd.read_parquet(MARKET)
    rows = frame[frame["symbol"].str.upper() == symbol.upper()].sort_values("date")
    if rows.empty:
        return {"status": "unavailable", "symbol": symbol, "message": "Symbol is not present in the prepared market extract."}
    row = rows.dropna(subset=["return_1d", "return_5d", "return_10d", "return_20d", "sma_50", "sma_200", "rsi_14", "macd", "macd_signal", "volatility_20", "volume_change", "volume_sma_20", "high_low_range", "distance_sma_50", "distance_sma_200"]).iloc[-1]
    features = ["return_1d", "return_5d", "return_10d", "return_20d", "sma_50", "sma_200", "rsi_14", "macd", "macd_signal", "volatility_20", "volume_change", "volume_sma_20", "high_low_range", "distance_sma_50", "distance_sma_200"]
    values = pd.DataFrame([row[features].to_dict()])
    out = {"status": "ok", "symbol": symbol.upper(), "asOf": row["date"].isoformat(), "price": float(row["adjusted_close"]), "modelVersion": "validated-walk-forward", "probabilities": {}, "modelMetadata": {}}
    for horizon in (5, 20):
        artifact = joblib.load(MODELS / f"returns_{horizon}d.joblib")
        out["probabilities"][f"positiveReturn{horizon}d"] = float(artifact["model"].predict_proba(values)[:, 1][0])
        out["modelMetadata"][f"{horizon}d"] = {"modelName": artifact.get("modelName"), "calibration": artifact.get("calibration", "uncalibrated"), "trainingDateRange": artifact.get("trainingDateRange"), "datasetFingerprint": artifact.get("datasetFingerprint")}
    return out


def sentiment_prediction(text: str) -> dict[str, Any]:
    if not str(text).strip():
        raise ValueError("text must not be empty")
    result = predict_sentiment([text])[0]
    return {"status": "ok", **result, "positive_probability": result["positiveProbability"], "negative_probability": result["negativeProbability"], "neutral_probability": result["neutralProbability"], "modelVersion": "ProsusAI/finbert"}
