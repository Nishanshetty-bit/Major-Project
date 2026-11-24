from pathlib import Path

import pandas as pd

from ml.inference import return_prediction
from ml.main import SymbolRequest, TextRequest, assets, model_status, returns, sentiment
from ml.sentiment_service import predict_sentiment

ROOT = Path(__file__).resolve().parents[1]


def test_processed_market_has_leakage_safe_targets():
    frame = pd.read_parquet(ROOT / "data" / "processed" / "market.parquet")
    assert {"target_5d", "target_20d", "rsi_14", "macd"}.issubset(frame.columns)
    assert not frame["return_1d"].isin([float("inf"), float("-inf")]).any()
    assert frame["target_5d"].notna().any()


def test_return_inference_has_real_probabilities():
    frame = pd.read_parquet(ROOT / "data" / "processed" / "market.parquet")
    result = return_prediction(str(frame.iloc[0]["symbol"]))
    assert result["status"] == "ok"
    assert 0 <= result["probabilities"]["positiveReturn5d"] <= 1
    assert 0 <= result["probabilities"]["positiveReturn20d"] <= 1


def test_fastapi_prediction_and_sentiment_contracts():
    symbol = str(pd.read_parquet(ROOT / "data" / "processed" / "market.parquet").iloc[0]["symbol"])
    prediction = returns(SymbolRequest(symbol=symbol))
    result = sentiment(TextRequest(text="The company reported strong profit growth"))
    assert prediction["status"] == "ok"
    assert result["status"] == "ok"
    assert result["sentiment"] in {"positive", "negative", "neutral"}


def test_unknown_symbol_is_explicitly_unavailable():
    result = return_prediction("NOT_A_REAL_SYMBOL")
    assert result["status"] == "unavailable"


def test_health_model_status_points_at_real_artifacts():
    assert model_status("returns")["available"] is True
    assert model_status("sentiment")["available"] is True
    assert model_status("sentiment")["path"].endswith("models\\finbert") or model_status("sentiment")["path"].endswith("models/finbert")


def test_finbert_batch_probabilities_and_long_text():
    outputs = predict_sentiment(["Revenue growth exceeded expectations.", "The company reported a steep loss."])
    assert len(outputs) == 2
    for output in outputs:
        total = output["negativeProbability"] + output["neutralProbability"] + output["positiveProbability"]
        assert abs(total - 1) < 1e-6
        assert output["sentiment"] in {"negative", "neutral", "positive"}
    long_output = predict_sentiment(["Quarterly revenue and operating margin improved. " * 90])[0]
    assert 0 <= long_output["positiveProbability"] <= 1
