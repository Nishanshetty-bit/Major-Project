"""Real-data portfolio construction and point-in-time backtesting.

This module deliberately keeps the return-classification models separate from
portfolio expected returns. Portfolio weights are based only on historical
adjusted-close observations available at the construction/rebalance date.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parent
MARKET_FILE = ROOT / "data" / "processed" / "market.parquet"
TRADING_DAYS = 252
RISK_FREE_RATE = 0.06
PROFILE_CAP = {"low": 0.30, "medium": 0.35, "high": 0.40}


class PortfolioDataError(ValueError):
    pass


def _date(value) -> str:
    return pd.Timestamp(value).isoformat()


def _safe(value):
    return None if value is None or not np.isfinite(float(value)) else float(value)


@dataclass
class PortfolioData:
    prices: pd.DataFrame
    metadata: dict


def load_portfolio_data() -> PortfolioData:
    if not MARKET_FILE.exists():
        raise PortfolioDataError("Real market data is unavailable: ml/data/processed/market.parquet does not exist.")
    frame = pd.read_parquet(MARKET_FILE)
    required = {"date", "symbol", "adjusted_close"}
    missing = required.difference(frame.columns)
    if missing:
        raise PortfolioDataError(f"Processed market data is missing required fields: {sorted(missing)}")
    frame = frame[["date", "symbol", "adjusted_close", "source_file"]].copy()
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce", utc=True)
    frame["symbol"] = frame["symbol"].astype(str).str.upper().str.strip()
    frame["adjusted_close"] = pd.to_numeric(frame["adjusted_close"], errors="coerce")
    invalid = frame["date"].isna() | frame["symbol"].eq("") | ~np.isfinite(frame["adjusted_close"]) | (frame["adjusted_close"] <= 0)
    invalid_count = int(invalid.sum())
    frame = frame.loc[~invalid].copy()
    duplicates = int(frame.duplicated(["symbol", "date"]).sum())
    frame = frame.drop_duplicates(["symbol", "date"], keep="last").sort_values(["date", "symbol"])
    if frame.empty:
        raise PortfolioDataError("Real market data contains no valid positive adjusted prices.")
    prices = frame.pivot(index="date", columns="symbol", values="adjusted_close").sort_index()
    source = frame.groupby("symbol")["source_file"].last().to_dict()
    category = {symbol: ("stock" if "stocks" in str(file) else "etf" if "etfs" in str(file) else "unsupported") for symbol, file in source.items()}
    metadata = {
        "dataSource": "vishnun0027/indian-market-historical-ohlcv",
        "dataMode": "real",
        "priceField": "adjusted_close",
        "latestObservationDate": _date(frame["date"].max()),
        "earliestObservationDate": _date(frame["date"].min()),
        "invalidRowsRemoved": invalid_count,
        "duplicateRowsRemoved": duplicates,
        "sourceFiles": sorted(frame["source_file"].dropna().unique().tolist()),
        "categories": {"stock": sum(v == "stock" for v in category.values()), "etf": sum(v == "etf" for v in category.values())},
    }
    prices.attrs["category"] = category
    prices.attrs["metadata"] = metadata
    return PortfolioData(prices=prices, metadata=metadata)


def eligible_assets(data: PortfolioData | None = None, minimum_observations: int = 60) -> list[dict]:
    data = data or load_portfolio_data()
    category = data.prices.attrs["category"]
    result = []
    for symbol in data.prices.columns:
        series = data.prices[symbol].dropna()
        count = int(series.size)
        result.append({
            "symbol": symbol, "category": category.get(symbol, "unsupported"), "eligible": category.get(symbol) in {"stock", "etf"} and count >= minimum_observations,
            "observations": count, "firstDate": _date(series.index.min()) if count else None, "lastDate": _date(series.index.max()) if count else None,
            "latestPrice": _safe(series.iloc[-1]) if count else None,
            "reason": None if category.get(symbol) in {"stock", "etf"} and count >= minimum_observations else "Unsupported category or insufficient adjusted-price observations",
        })
    return sorted(result, key=lambda item: item["symbol"])


def _select(data: PortfolioData, symbols: Iterable[str] | None, as_of=None, lookback: int = 252) -> tuple[pd.DataFrame, pd.DataFrame]:
    requested = [str(s).upper() for s in symbols] if symbols else list(data.prices.columns)
    allowed = [s for s in requested if s in data.prices.columns and data.prices.attrs["category"].get(s) in {"stock", "etf"}]
    if not allowed:
        raise PortfolioDataError("No requested stock or ETF symbols have usable real historical data.")
    prices = data.prices[allowed].loc[:pd.Timestamp(as_of, tz="UTC") if as_of else data.prices.index.max()].copy()
    if symbols is None:
        # The extract contains instruments with different listing dates. Use a
        # reproducible diversified subset with the strongest coverage rather
        # than silently forward-filling missing prices across all 55 symbols.
        coverage = prices.notna().sum().sort_values(ascending=False)
        allowed = coverage.head(12).index.tolist()
        prices = prices[allowed]
    prices = prices.dropna(axis=1, thresh=lookback + 1).iloc[-(lookback + 1):]
    while prices.shape[1] > 2 and prices.dropna(axis=0, how="any").shape[0] < max(60, lookback // 2):
        weakest = prices.isna().sum().sort_values(ascending=False).index[0]
        prices = prices.drop(columns=[weakest])
    prices = prices.dropna(axis=0, how="any")
    if prices.shape[1] < 2 or len(prices) < max(60, lookback // 2):
        raise PortfolioDataError(f"Insufficient aligned historical coverage: need {lookback + 1} observations for at least two assets.")
    return prices, prices.pct_change(fill_method=None).dropna()


def _cap_weights(n: int, profile: str) -> float:
    return max(PROFILE_CAP[profile], 1.0 / n)


def _bounded_equal(n: int, cap: float) -> np.ndarray:
    weights = np.zeros(n)
    remaining = 1.0
    for index in range(n):
        value = min(cap, remaining / (n - index))
        weights[index] = value
        remaining -= value
    return weights / weights.sum()


def _solve(objective, n: int, cap: float) -> np.ndarray:
    x0 = _bounded_equal(n, cap)
    result = minimize(objective, x0, method="SLSQP", bounds=[(0, cap)] * n, constraints={"type": "eq", "fun": lambda w: np.sum(w) - 1}, options={"maxiter": 500, "ftol": 1e-12})
    if not result.success:
        return x0
    weights = np.clip(result.x, 0, cap)
    return weights / weights.sum()


def strategy_weights(returns: pd.DataFrame, strategy: str, risk: str) -> np.ndarray:
    if risk not in PROFILE_CAP:
        raise PortfolioDataError("risk must be low, medium or high")
    if strategy not in {"equal_weight", "minimum_variance", "risk_adjusted", "historical_rule_based"}:
        raise PortfolioDataError("strategy must be equal_weight, minimum_variance, risk_adjusted or historical_rule_based")
    n = returns.shape[1]
    cap = _cap_weights(n, risk)
    covariance = returns.cov().fillna(0).to_numpy() * TRADING_DAYS
    covariance += np.eye(n) * 1e-8
    annual_mean = returns.mean().fillna(0).to_numpy() * TRADING_DAYS
    volatility = np.sqrt(np.maximum(np.diag(covariance), 1e-12))
    if strategy == "equal_weight":
        return _bounded_equal(n, cap)
    if strategy == "minimum_variance":
        return _solve(lambda w: float(w @ covariance @ w), n, cap)
    if strategy == "historical_rule_based":
        score = np.maximum((annual_mean - RISK_FREE_RATE) / volatility, 0)
        if not np.any(score):
            return _bounded_equal(n, cap)
        return _solve(lambda w: float(-w @ score), n, cap)
    penalty = {"low": 3.0, "medium": 1.5, "high": 0.75}[risk]
    return _solve(lambda w: float(-(w @ annual_mean - penalty * (w @ covariance @ w))), n, cap)


def _allocations(prices: pd.Series, weights: np.ndarray, budget: float, symbols: list[str]) -> tuple[list[dict], float, float]:
    rows, invested = [], 0.0
    for symbol, weight in zip(symbols, weights):
        target = float(budget * weight)
        price = float(prices[symbol])
        units = int(target // price)
        actual = units * price
        invested += actual
        rows.append({"symbol": symbol, "weight": float(weight), "targetInr": target, "price": price, "units": units, "allocationInr": actual, "fractionalUnits": False})
    return rows, invested, float(budget - invested)


def optimize_portfolio(budget: float, risk: str = "medium", strategy: str = "minimum_variance", symbols: Iterable[str] | None = None, lookback: int = 252) -> dict:
    if budget < 1000 or not np.isfinite(budget):
        raise PortfolioDataError("budget must be at least INR 1,000")
    data = load_portfolio_data()
    prices, returns = _select(data, symbols, lookback=lookback)
    weights = strategy_weights(returns, strategy, risk)
    rows, invested, cash = _allocations(prices.iloc[-1], weights, budget, list(prices.columns))
    portfolio_returns = returns.to_numpy() @ weights
    vol = float(np.std(portfolio_returns, ddof=1) * np.sqrt(TRADING_DAYS))
    annual_return = float(np.mean(portfolio_returns) * TRADING_DAYS)
    return {"status": "ok", **data.metadata, "strategy": strategy, "riskProfile": risk, "budgetInr": float(budget), "lookbackObservations": len(returns), "assets": rows, "investedInr": invested, "unallocatedInr": cash, "historicalMetrics": {"annualizedReturn": annual_return, "annualizedVolatility": vol, "sharpe": (annual_return - RISK_FREE_RATE) / vol if vol else None}, "warnings": ["Historical returns do not guarantee future returns.", "ML return probabilities are supplementary and were not converted into expected returns."]}


def _metrics(values: pd.Series, initial: float, risk_free_rate: float = RISK_FREE_RATE) -> dict:
    daily = values.pct_change().dropna()
    final = float(values.iloc[-1])
    years = max((values.index[-1] - values.index[0]).days / 365.25, 1 / TRADING_DAYS)
    total = final / initial - 1
    cagr = (final / initial) ** (1 / years) - 1
    volatility = float(daily.std(ddof=1) * np.sqrt(TRADING_DAYS)) if len(daily) > 1 else 0.0
    annual_return = float(daily.mean() * TRADING_DAYS) if len(daily) else 0.0
    drawdown = values / values.cummax() - 1
    return {"initialInvestment": initial, "finalPortfolioValue": final, "totalReturn": float(total), "cagr": float(cagr), "annualizedVolatility": volatility, "sharpe": (annual_return - risk_free_rate) / volatility if volatility else None, "maximumDrawdown": float(drawdown.min()), "riskFreeRate": risk_free_rate, "observations": int(len(values))}


def backtest_portfolio(budget: float, risk: str, strategy: str, horizon_years: int, symbols: Iterable[str] | None = None, rebalance_months: int = 1) -> dict:
    if horizon_years not in {1, 2, 3}:
        raise PortfolioDataError("horizonYears must be 1, 2 or 3")
    data = load_portfolio_data()
    requested = [str(s).upper() for s in symbols] if symbols else list(data.prices.columns)
    allowed = [s for s in requested if s in data.prices.columns and data.prices.attrs["category"].get(s) in {"stock", "etf"}]
    required = TRADING_DAYS * (horizon_years + 1)
    prices = data.prices[allowed]
    if symbols is None:
        allowed = prices.notna().sum().sort_values(ascending=False).head(12).index.tolist()
        prices = prices[allowed]
    prices = prices.dropna(axis=1, thresh=TRADING_DAYS * (horizon_years + 1))
    while prices.shape[1] > 2 and len(prices.dropna(axis=0, how="any")) < required:
        prices = prices.drop(columns=[prices.isna().sum().sort_values(ascending=False).index[0]])
    common = prices.dropna(axis=0, how="any")
    if len(common) < required or common.shape[1] < 2:
        return {"status": "unavailable", **data.metadata, "strategy": strategy, "horizonYears": horizon_years, "message": f"Insufficient common history for a {horizon_years}-year backtest; at least {required} observations and two assets are required.", "warnings": []}
    test = common.iloc[-TRADING_DAYS * horizon_years:]
    warmup = common.loc[:test.index[0]].iloc[:-1]
    equity = pd.Series(index=test.index, dtype=float)
    value = float(budget)
    dates = list(test.index)
    rebalance_positions = list(range(0, len(dates), max(1, rebalance_months * 21)))
    for position, start in enumerate(rebalance_positions):
        end = rebalance_positions[position + 1] if position + 1 < len(rebalance_positions) else len(dates)
        as_of = dates[start]
        window = pd.concat([warmup, test.iloc[:start]]).tail(TRADING_DAYS + 1)
        rets = window.pct_change(fill_method=None).dropna()
        weights = strategy_weights(rets, strategy, risk)
        segment = test.iloc[start:end].pct_change(fill_method=None).fillna(0).to_numpy()
        segment_values = value * np.cumprod(1 + segment @ weights)
        equity.iloc[start:end] = segment_values
        value = float(segment_values[-1])
    equity = equity.ffill()
    return {"status": "ok", **data.metadata, "strategy": strategy, "riskProfile": risk, "horizonYears": horizon_years, "rebalance": f"{rebalance_months} month(s)", "metrics": _metrics(equity, budget), "equityCurve": [{"date": _date(index), "value": float(value)} for index, value in equity.items()], "warnings": ["Weights at each monthly rebalance use only the preceding 252 trading observations.", "Historical returns do not guarantee future returns."]}


def compare_strategies(budget: float, risk: str, horizon_years: int, symbols: Iterable[str] | None = None) -> dict:
    strategies = ["equal_weight", "minimum_variance", "risk_adjusted", "historical_rule_based"]
    results = [backtest_portfolio(budget, risk, strategy, horizon_years, symbols) for strategy in strategies]
    return {"status": "ok", "dataMode": "real", "dataSource": "vishnun0027/indian-market-historical-ohlcv", "horizonYears": horizon_years, "strategies": results, "warnings": ["The existing Express /allocate route remains the legacy simulated rule-based demo benchmark."]}
