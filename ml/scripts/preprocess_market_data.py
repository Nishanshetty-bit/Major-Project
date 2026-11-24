from pathlib import Path
import json
import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
PROCESSED.mkdir(parents=True, exist_ok=True)


def find_column(columns, names):
    lowered = {str(c).lower(): c for c in columns}
    return next((lowered[n] for n in names if n in lowered), None)


def main() -> None:
    files = sorted(RAW.glob("market_stocks_*.parquet")) + sorted(RAW.glob("market_etfs_*.parquet"))
    if not files:
        raise SystemExit("No raw market parquet files found. Run download_market_data.py first.")
    frames = []
    for file in files:
        frame = pd.read_parquet(file)
        symbol = find_column(frame.columns, ["symbol", "ticker", "stock", "code"])
        date = find_column(frame.columns, ["date", "datetime", "timestamp"])
        close = find_column(frame.columns, ["adjusted_close", "adj_close", "close"])
        if not all((symbol, date, close)):
            continue
        selected = frame.rename(columns={symbol: "symbol", date: "date", close: "adjusted_close"}).copy()
        if "adj_close" in frame.columns:
            selected["adjusted_close"] = frame["adj_close"]
        selected["date"] = pd.to_datetime(selected["date"], errors="coerce", utc=True)
        selected["adjusted_close"] = pd.to_numeric(selected["adjusted_close"], errors="coerce")
        selected = selected.dropna(subset=["symbol", "date", "adjusted_close"])
        selected = selected[selected["adjusted_close"] > 0]
        selected["source_file"] = file.name
        frames.append(selected)
    if not frames:
        raise SystemExit("No compatible OHLCV schema found; inspect raw manifests before choosing a mapping.")
    out = pd.concat(frames, ignore_index=True).drop_duplicates(["symbol", "date"]).sort_values(["symbol", "date"])
    groups = []
    for symbol, group in out.groupby("symbol", sort=False):
        group = group.sort_values("date").copy()
        close = group["adjusted_close"]
        group["return_1d"] = close.pct_change()
        group["return_5d"] = close.pct_change(5)
        group["return_10d"] = close.pct_change(10)
        group["return_20d"] = close.pct_change(20)
        group["sma_50"] = close.rolling(50, min_periods=50).mean()
        group["sma_200"] = close.rolling(200, min_periods=200).mean()
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(14, min_periods=14).mean()
        loss = (-delta.clip(upper=0)).rolling(14, min_periods=14).mean()
        group["rsi_14"] = 100 - (100 / (1 + gain / loss.replace(0, np.nan)))
        ema12 = close.ewm(span=12, adjust=False, min_periods=12).mean()
        ema26 = close.ewm(span=26, adjust=False, min_periods=26).mean()
        group["macd"] = ema12 - ema26
        group["macd_signal"] = group["macd"].ewm(span=9, adjust=False, min_periods=9).mean()
        group["volatility_20"] = group["return_1d"].rolling(20, min_periods=20).std() * np.sqrt(252)
        group["volume_change"] = pd.to_numeric(group.get("volume", np.nan), errors="coerce").pct_change()
        group["volume_sma_20"] = pd.to_numeric(group.get("volume", np.nan), errors="coerce").rolling(20, min_periods=20).mean()
        group["high_low_range"] = (pd.to_numeric(group.get("high", close), errors="coerce") - pd.to_numeric(group.get("low", close), errors="coerce")) / close
        group["distance_sma_50"] = close / group["sma_50"] - 1
        group["distance_sma_200"] = close / group["sma_200"] - 1
        group["future_return_5d"] = close.shift(-5) / close - 1
        group["future_return_20d"] = close.shift(-20) / close - 1
        group["target_5d"] = np.where(group["future_return_5d"].notna(), (group["future_return_5d"] > 0).astype("float"), np.nan)
        group["target_20d"] = np.where(group["future_return_20d"].notna(), (group["future_return_20d"] > 0).astype("float"), np.nan)
        groups.append(group)
    out = pd.concat(groups, ignore_index=True)
    out = out.replace([np.inf, -np.inf], np.nan)
    out.to_parquet(PROCESSED / "market.parquet", index=False)
    meta = {"source": "vishnun0027/indian-market-historical-ohlcv", "configurations": ["stocks", "etfs"], "rows": len(out), "symbols": int(out["symbol"].nunique()), "asOf": out["date"].max().isoformat(), "columns": list(out.columns), "leakageControl": "rolling features use current/past rows; future labels are shifted backward and excluded from feature columns"}
    (PROCESSED / "market_metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
