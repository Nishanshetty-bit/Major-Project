import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed" / "indian" / "nse_eod.parquet"
REPORT = ROOT / "data" / "processed" / "indian" / "data_quality_report.json"


def test_processed_tejhq_dataset_and_audit_exist():
    assert DATA.exists()
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert report["source"] == "tejhq/indian-markets"
    assert report["rawRows"] == report["processedRows"]
    assert report["invalidPriceRows"] == 0
    assert report["invalidOhlcRows"] == 0
    assert report["invalidVolumeRows"] == 0
    assert report["duplicateRawRows"] == report["duplicateAdjustedRows"] == 0


def test_indian_nse_schema_adjustments_and_targets_are_symbol_local():
    con = duckdb.connect()
    try:
        row = con.execute("""
          SELECT count(*),count(DISTINCT symbol),
            count(*) FILTER(WHERE target_5d IS NOT NULL AND target_5d NOT IN (0,1)),
            count(*) FILTER(WHERE target_20d IS NOT NULL AND target_20d NOT IN (0,1)),
            count(*) FILTER(WHERE abs(adjusted_close-raw_close*adj_factor_cumulative)>greatest(0.02,adjusted_close*0.00001)),
            count(*) FILTER(WHERE adjusted_close<=0 OR volume<0 OR high<greatest(open,low,raw_close) OR low>least(open,high,raw_close))
          FROM read_parquet(?)
        """, [str(DATA)]).fetchone()
        assert row[0] == 7_377_964
        assert row[1] == 4_441
        assert row[2] == row[3] == row[4] == row[5] == 0
        columns = {item[0] for item in con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [str(DATA)]).fetchall()}
        assert {"date", "symbol", "series", "exchange", "raw_close", "adjusted_close", "volume", "target_5d", "target_20d"}.issubset(columns)
    finally:
        con.close()
