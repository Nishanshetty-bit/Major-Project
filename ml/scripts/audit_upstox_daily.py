"""Audit Upstox daily candles without silently cleaning or merging them."""
from datetime import datetime, timezone
import json
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "upstox"
OUT = ROOT / "reports" / "upstox_daily_quality.json"


def main():
    candle = RAW / "day/train-00000.parquet"
    symbols = pd.read_csv(RAW / "symbols.csv")
    con = duckdb.connect()
    stats = con.execute("""
      SELECT count(*) rows,count(DISTINCT symbol) symbols,
       min(CAST(timestamp + INTERVAL '5 hours 30 minutes' AS DATE)) first_ist_date,
       max(CAST(timestamp + INTERVAL '5 hours 30 minutes' AS DATE)) last_ist_date,
       count(*) FILTER(WHERE volume<0) negative_volume_rows,
       count(*) FILTER(WHERE volume=0) zero_volume_rows,
       count(*) FILTER(WHERE open<=0 OR high<=0 OR low<=0 OR close<=0) invalid_price_rows,
       count(*) FILTER(WHERE high<greatest(open,low,close) OR low>least(open,high,close)) invalid_ohlc_rows,
       count(*)-count(DISTINCT(symbol,timestamp)) duplicate_symbol_timestamp_rows
      FROM read_parquet(?)
    """, [str(candle)]).fetchone()
    report = {"source":"xxparthparekhxx/indian-stock-market-minute-data","subset":"day","createdAt":datetime.now(timezone.utc).isoformat(),"rows":int(stats[0]),"symbols":int(stats[1]),"firstISTDate":str(stats[2]),"lastISTDate":str(stats[3]),"negativeVolumeRows":int(stats[4]),"zeroVolumeRows":int(stats[5]),"invalidPriceRows":int(stats[6]),"invalidOhlcRows":int(stats[7]),"duplicateSymbolTimestampRows":int(stats[8]),"symbolMetadataRows":len(symbols),"exchangeSeriesDistribution":{str(k):int(v) for k,v in symbols["type"].value_counts(dropna=False).items()},"listedStatusDistribution":{str(k):int(v) for k,v in symbols["listed"].value_counts(dropna=False).items()},"adjustmentsCsvRows":len(pd.read_csv(RAW/"adjustments.csv")),"calendarSessions":len(pd.read_csv(RAW/"calendar.csv")),"interpretation":"The source is split/bonus adjusted but not dividend adjusted; zero volume is retained; invalid rows are flagged and this dataset is not merged into the TejHQ processed data."}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(report,indent=2),encoding="utf-8")
    con.close()
    print(json.dumps(report,indent=2))


if __name__ == "__main__":
    main()
