from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field
import pandas as pd

try:
    from .inference import return_prediction, sentiment_prediction
    from .sentiment_service import predict_sentiment
    from .portfolio_service import PortfolioDataError, backtest_portfolio, compare_strategies, eligible_assets, optimize_portfolio
except ImportError:
    from inference import return_prediction, sentiment_prediction
    from sentiment_service import predict_sentiment
    from portfolio_service import PortfolioDataError, backtest_portfolio, compare_strategies, eligible_assets, optimize_portfolio

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="FinSense ML Service", version="0.1.0")


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class BatchTextRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=100)


class SymbolRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)


class PortfolioRequest(BaseModel):
    budget: float = Field(ge=1000, le=100_000_000)
    risk: str = Field(default="medium", pattern="^(low|medium|high)$")
    strategy: str = Field(default="minimum_variance", pattern="^(equal_weight|minimum_variance|risk_adjusted|historical_rule_based)$")
    symbols: list[str] | None = None
    lookback: int = Field(default=252, ge=60, le=756)


class BacktestRequest(PortfolioRequest):
    horizonYears: int = Field(default=1, alias="horizonYears", ge=1, le=3)


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def model_status(name: str) -> dict[str, Any]:
    model_paths = {
        "returns": [ROOT / "models" / "returns_5d.joblib", ROOT / "models" / "returns_20d.joblib"],
        "sentiment": [ROOT / "models" / "finbert" / "config.json", ROOT / "models" / "finbert" / "model.safetensors"],
        "behavior": [ROOT / "models" / "behavior"],
        "intervention": [ROOT / "models" / "intervention"],
    }.get(name, [ROOT / "models" / name])
    return {"name": name, "available": all(path.exists() for path in model_paths), "path": str(model_paths[0].parent if len(model_paths) > 1 else model_paths[0]), "artifacts": [str(path) for path in model_paths]}


@app.get("/ml/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "fastapi-ml", "version": app.version, "models": [model_status(x) for x in ("returns", "sentiment", "behavior", "intervention")], "timestamp": timestamp()}


@app.get("/ml/market/assets")
def assets() -> dict[str, Any]:
    market = ROOT / "data" / "processed" / "market.parquet"
    if not market.exists():
        return {"status": "unavailable", "dataSource": "real historical data", "assets": [], "message": "Prepare ml/data/processed/market.parquet before serving real market assets."}
    frame = pd.read_parquet(market)
    latest = frame.sort_values("date").groupby("symbol", as_index=False).tail(1)
    return {"status": "ok", "dataSource": "real historical data", "asOf": frame["date"].max().isoformat(), "assets": [{"symbol": row.symbol, "price": float(row.adjusted_close), "asOf": row.date.isoformat()} for row in latest.itertuples()]}


@app.get("/ml/market/assets/{symbol}/history")
def history(symbol: str) -> dict[str, Any]:
    market = ROOT / "data" / "processed" / "market.parquet"
    if not market.exists(): return {"status": "unavailable", "symbol": symbol, "history": [], "message": "Processed market data is unavailable."}
    frame = pd.read_parquet(market)
    rows = frame[frame["symbol"].str.upper() == symbol.upper()].sort_values("date")
    if rows.empty: return {"status": "unavailable", "symbol": symbol, "history": [], "message": "Symbol is not present in the prepared market extract."}
    return {"status": "ok", "symbol": symbol.upper(), "dataSource": "real historical data", "history": [{"date": row.date.isoformat(), "adjustedClose": float(row.adjusted_close)} for row in rows.itertuples()]}


@app.post("/ml/predict/returns")
def returns(request: SymbolRequest) -> dict[str, Any]:
    try: return {**return_prediction(request.symbol), "predictionTimestamp": timestamp()}
    except Exception as error: return {"status": "unavailable", "modelAvailable": False, "symbol": request.symbol, "message": str(error), "predictionTimestamp": timestamp()}


@app.post("/ml/sentiment/analyze")
def sentiment(request: TextRequest) -> dict[str, Any]:
    try: return {**sentiment_prediction(request.text), "text": request.text, "predictionTimestamp": timestamp()}
    except Exception as error: return {"status": "unavailable", "modelAvailable": False, "sentiment": None, "text": request.text, "message": str(error), "predictionTimestamp": timestamp()}


@app.post("/ml/sentiment/batch")
def sentiment_batch(request: BatchTextRequest) -> dict[str, Any]:
    try:
        return {"status": "ok", "model": "ProsusAI/finbert", "results": predict_sentiment(request.texts), "predictionTimestamp": timestamp()}
    except Exception as error:
        return {"status": "unavailable", "modelAvailable": False, "results": [], "message": str(error), "predictionTimestamp": timestamp()}


@app.get("/ml/portfolio/assets")
def portfolio_assets() -> dict[str, Any]:
    try:
        return {"status": "ok", "assets": eligible_assets(), "timestamp": timestamp()}
    except PortfolioDataError as error:
        return {"status": "unavailable", "assets": [], "message": str(error), "timestamp": timestamp()}


@app.post("/ml/portfolio/optimize")
def portfolio(request: PortfolioRequest) -> dict[str, Any]:
    try:
        return {**optimize_portfolio(request.budget, request.risk, request.strategy, request.symbols, request.lookback), "timestamp": timestamp()}
    except PortfolioDataError as error:
        return {"status": "unavailable", "dataMode": "real", "message": str(error), "timestamp": timestamp()}


@app.post("/ml/portfolio/backtest")
def portfolio_backtest(request: BacktestRequest) -> dict[str, Any]:
    try:
        return {**backtest_portfolio(request.budget, request.risk, request.strategy, request.horizonYears, request.symbols), "timestamp": timestamp()}
    except PortfolioDataError as error:
        return {"status": "unavailable", "dataMode": "real", "message": str(error), "timestamp": timestamp()}


@app.post("/ml/portfolio/compare")
def portfolio_compare(request: BacktestRequest) -> dict[str, Any]:
    try:
        return {**compare_strategies(request.budget, request.risk, request.horizonYears, request.symbols), "timestamp": timestamp()}
    except PortfolioDataError as error:
        return {"status": "unavailable", "dataMode": "real", "message": str(error), "timestamp": timestamp()}


@app.post("/ml/portfolio/risk-metrics")
def portfolio_risk_metrics(request: BacktestRequest) -> dict[str, Any]:
    try:
        result = backtest_portfolio(request.budget, request.risk, request.strategy, request.horizonYears, request.symbols)
        return {"status": result["status"], "dataMode": "real", "strategy": request.strategy, "riskProfile": request.risk, "horizonYears": request.horizonYears, "metrics": result.get("metrics"), "warnings": result.get("warnings", []), "timestamp": timestamp()}
    except PortfolioDataError as error:
        return {"status": "unavailable", "dataMode": "real", "message": str(error), "timestamp": timestamp()}


@app.post("/ml/behavior/predict")
def behavior(_: dict[str, Any]) -> dict[str, Any]:
    return {"status": "experimental", "modelAvailable": model_status("behavior")["available"], "message": "The operational behavioral fingerprint remains rule-based until defensible labelled responses are collected.", "predictionTimestamp": timestamp()}


@app.post("/ml/intervention/predict")
def intervention(_: dict[str, Any]) -> dict[str, Any]:
    return {"status": "experimental", "modelAvailable": model_status("intervention")["available"], "message": "Subjective regret labels are unavailable; objective negative-outcome modelling is experimental.", "predictionTimestamp": timestamp()}
