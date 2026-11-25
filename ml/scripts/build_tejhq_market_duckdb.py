"""Memory-bounded TejHQ NSE join, quality audit and feature build."""
from datetime import datetime, timezone
import gc
import hashlib
import json
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "tejhq"
OUT = ROOT / "data" / "processed" / "indian"
FEATURES = ["return_1d", "return_5d", "return_10d", "return_20d", "sma_50", "sma_200", "rsi_14", "macd", "macd_signal", "volatility_20", "volume_change", "volume_sma_20", "high_low_range", "distance_sma_50", "distance_sma_200"]


def sql_list(paths):
    return "[" + ",".join("'" + str(p).replace("'", "''") + "'" for p in paths) + "]"


def add_features(group: pd.DataFrame) -> pd.DataFrame:
    group = group.sort_values("date").copy()
    group["isin"] = group["isin"].astype("string")
    close = group["adjusted_close"]
    group["return_1d"] = close.pct_change(fill_method=None)
    for horizon in (5, 10, 20):
        group[f"return_{horizon}d"] = close.pct_change(horizon, fill_method=None)
    group["sma_50"] = close.rolling(50, min_periods=50).mean()
    group["sma_200"] = close.rolling(200, min_periods=200).mean()
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14, min_periods=14).mean()
    loss = -delta.clip(upper=0).rolling(14, min_periods=14).mean()
    group["rsi_14"] = 100 - 100 / (1 + gain / loss.replace(0, np.nan))
    ema12 = close.ewm(span=12, adjust=False, min_periods=12).mean()
    ema26 = close.ewm(span=26, adjust=False, min_periods=26).mean()
    group["macd"] = ema12 - ema26
    group["macd_signal"] = group["macd"].ewm(span=9, adjust=False, min_periods=9).mean()
    group["volatility_20"] = group["return_1d"].rolling(20, min_periods=20).std() * np.sqrt(252)
    group["volume_change"] = group["volume"].pct_change(fill_method=None)
    group["volume_sma_20"] = group["volume"].rolling(20, min_periods=20).mean()
    group["high_low_range"] = (group["adjusted_high"] - group["adjusted_low"]) / close
    group["distance_sma_50"] = close / group["sma_50"] - 1
    group["distance_sma_200"] = close / group["sma_200"] - 1
    for horizon in (5, 20):
        future = close.shift(-horizon) / close - 1
        group[f"future_return_{horizon}d"] = future
        group[f"target_{horizon}d"] = np.where(future.notna(), (future > 0).astype(float), np.nan)
    return group.replace([np.inf, -np.inf], np.nan)


def main():
    raw = sorted((RAW / "nse").glob("year=*/nse_*.parquet"))
    adj = sorted((RAW / "prices_adjusted").glob("nse_*.parquet"))
    if not raw or not adj:
        raise SystemExit("TejHQ NSE files missing; run download_tejhq_data.py first.")
    OUT.mkdir(parents=True, exist_ok=True)
    stage = OUT / "nse_clean_stage.parquet"
    target = OUT / "nse_eod.parquet"
    building = OUT / "nse_eod.building.parquet"
    stage.unlink(missing_ok=True)
    building.unlink(missing_ok=True)
    con = duckdb.connect()
    con.execute("SET memory_limit='2GB'")
    con.execute("SET threads=2")
    con.execute("SET temp_directory='" + str(OUT / "duckdb_tmp").replace("'", "''") + "'")
    con.execute("CREATE VIEW raw_nse AS SELECT * FROM read_parquet(" + sql_list(raw) + ")")
    con.execute("CREATE VIEW adjusted_nse AS SELECT * FROM read_parquet(" + sql_list(adj) + ")")
    duplicate_stats = con.execute("SELECT (SELECT count(*)-count(DISTINCT(date,symbol,series)) FROM raw_nse),(SELECT count(*)-count(DISTINCT(date,symbol,series)) FROM adjusted_nse)").fetchone()
    con.execute("""
      COPY (SELECT r.date,upper(trim(r.symbol)) symbol,upper(trim(r.series)) series,
        coalesce(r.isin,a.isin) isin,r.name,r.open,r.high,r.low,r.close raw_close,
        r.last,r.prev_close,r.volume,r.turnover,r.trades,a.adj_factor_cumulative,
        a.adj_close adjusted_close,r.open*a.adj_factor_cumulative adjusted_open,
        r.high*a.adj_factor_cumulative adjusted_high,r.low*a.adj_factor_cumulative adjusted_low,
        'NSE' exchange,'tejhq/indian-markets' data_source
      FROM raw_nse r LEFT JOIN adjusted_nse a
        ON r.date=a.date AND r.symbol=a.symbol AND r.series=a.series
      WHERE r.open>0 AND r.high>0 AND r.low>0 AND r.close>0
        AND r.high>=greatest(r.open,r.low,r.close) AND r.low<=least(r.open,r.high,r.close)
        AND r.volume>=0 AND a.adj_close>0
      ORDER BY symbol,series,date) TO ? (FORMAT PARQUET,COMPRESSION ZSTD)
    """, [str(stage)])
    stats = con.execute("SELECT count(*),count(DISTINCT symbol),min(date),max(date),count(*) FILTER(WHERE volume=0) FROM read_parquet(?)", [str(stage)]).fetchone()
    writer = None
    symbols = con.execute("SELECT DISTINCT symbol,series FROM read_parquet(?) ORDER BY symbol,series", [str(stage)]).fetchall()
    try:
        for index, (symbol, series) in enumerate(symbols, 1):
            group = con.execute("SELECT * FROM read_parquet(?) WHERE symbol=? AND series=? ORDER BY date", [str(stage), symbol, series]).df()
            table = pa.Table.from_pandas(add_features(group), preserve_index=False)
            if writer is None:
                writer = pq.ParquetWriter(building, table.schema, compression="zstd")
            writer.write_table(table)
            del group, table
            if index % 500 == 0:
                gc.collect()
                print(f"Featured {index}/{len(symbols)} symbol-series", flush=True)
    finally:
        if writer:
            writer.close()
    building.replace(target)
    quality = con.execute("""
      SELECT count(*),count(*) FILTER(WHERE open<=0 OR high<=0 OR low<=0 OR raw_close<=0 OR adjusted_close<=0),
      count(*) FILTER(WHERE high<greatest(open,low,raw_close) OR low>least(open,high,raw_close)),
      count(*) FILTER(WHERE volume<0),count(*) FILTER(WHERE volume=0),
      count(*)-count(DISTINCT(date,symbol,series))
      FROM read_parquet(""" + "'" + str(stage).replace("'", "''") + "')").fetchone()
    actions = len(list((RAW / "actions").glob("nse_*.parquet")))
    report = {"source":"tejhq/indian-markets","createdAt":datetime.now(timezone.utc).isoformat(),"rawFiles":len(raw),"adjustedFiles":len(adj),"rawRows":int(stats[0]),"symbols":int(stats[1]),"firstDate":str(stats[2]),"lastDate":str(stats[3]),"zeroVolumeRows":int(stats[4]),"processedRows":int(quality[0]),"invalidPriceRows":int(quality[1]),"invalidOhlcRows":int(quality[2]),"invalidVolumeRows":int(quality[3]),"duplicateRawRows":int(duplicate_stats[0]),"duplicateAdjustedRows":int(duplicate_stats[1]),"duplicateProcessedRows":int(quality[5]),"corporateActionFiles":actions,"symbolHistoryPresent":(RAW/"symbol_history/nse.parquet").exists(),"pointInTimeUniversePresent":(RAW/"universe/nse_liquid.parquet").exists(),"adjustmentMethod":"TejHQ adj_close, documented as split, bonus and dividend adjusted; raw OHLCV retained.","limitations":["Exchange series do not fully classify ETFs; no unverified asset type assigned.","No mutual-fund NAVs or index histories are mixed into this equity file.","Point-in-time liquidity universe retained separately for survivorship-aware selection."],"processedFile":str(target),"processedBytes":target.stat().st_size,"features":FEATURES}
    report["sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
    (OUT/"data_quality_report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    stage.unlink(missing_ok=True)
    con.close()
    print(json.dumps(report,indent=2))


if __name__ == "__main__":
    main()
