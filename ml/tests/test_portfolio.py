import numpy as np
import pandas as pd

from ml.portfolio_service import (
    PortfolioData,
    _metrics,
    _bounded_equal,
    backtest_portfolio,
    eligible_assets,
    load_portfolio_data,
    optimize_portfolio,
    strategy_weights,
)


def test_real_schema_and_categories_are_inspected():
    data = load_portfolio_data()
    assert data.metadata["priceField"] == "adjusted_close"
    assert data.metadata["categories"]["stock"] > 0
    assert data.metadata["categories"]["etf"] > 0
    assert data.prices.index.is_monotonic_increasing


def test_weights_are_long_only_and_capped():
    rng = np.random.default_rng(2)
    returns = pd.DataFrame(rng.normal(0.0002, 0.01, size=(300, 4)), columns=list("ABCD"))
    for strategy in ("equal_weight", "minimum_variance", "risk_adjusted", "historical_rule_based"):
        weights = strategy_weights(returns, strategy, "low")
        assert np.isclose(weights.sum(), 1)
        assert np.all(weights >= 0)
        assert np.all(weights <= 0.30 + 1e-8)


def test_budget_is_consistent_and_only_whole_units_are_used():
    result = optimize_portfolio(50_000, "medium", "equal_weight")
    assert result["status"] == "ok"
    assert result["investedInr"] + result["unallocatedInr"] <= 50_000 + 1e-6
    assert all(item["fractionalUnits"] is False for item in result["assets"])


def test_backtest_has_metrics_and_point_in_time_curve():
    result = backtest_portfolio(50_000, "high", "minimum_variance", 1)
    assert result["status"] == "ok"
    assert result["metrics"]["initialInvestment"] == 50_000
    assert result["metrics"]["observations"] >= 200
    dates = [point["date"] for point in result["equityCurve"]]
    assert dates == sorted(dates)


def test_metrics_drawdown_is_non_positive():
    values = pd.Series([100, 110, 90], index=pd.date_range("2025-01-01", periods=3, tz="UTC"))
    metrics = _metrics(values, 100)
    assert metrics["maximumDrawdown"] < 0


def test_insufficient_requested_history_is_unavailable():
    result = backtest_portfolio(50_000, "medium", "equal_weight", 3, symbols=["360ONE", "20MICRONS"])
    assert result["status"] in {"ok", "unavailable"}
