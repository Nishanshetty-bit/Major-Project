"""Classify TejHQ NSE rows against NSE's published security and ETF lists.

The current exchange files are a point-in-time classification snapshot. Rows
not present there are retained as unknown; symbol text is never used to infer
the instrument category.
"""
from __future__ import annotations

import json
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "tejhq"
PROCESSED = ROOT / "data" / "processed" / "indian"
REPORTS = ROOT / "reports" / "indian"
MASTER_URLS = {
    "equity": "https://archives.nseindia.com/content/equities/EQUITY_L.csv",
    "etf": "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv",
    "reit": "https://nsearchives.nseindia.com/content/equities/REITS_L.csv",
    "invit": "https://nsearchives.nseindia.com/content/equities/INVITS_L.csv",
}


def download_masters() -> dict[str, pd.DataFrame]:
    RAW.mkdir(parents=True, exist_ok=True)
    result = {}
    for kind, url in MASTER_URLS.items():
        path = RAW / f"nse_{kind}_master.csv"
        if not path.exists():
            request = Request(url, headers={"User-Agent": "FinSense NSE universe audit"})
            with urlopen(request, timeout=25) as response:
                content = response.read()
            pd.read_csv(BytesIO(content)).to_csv(path, index=False)
        result[kind] = pd.read_csv(path, dtype=str).fillna("")
    return result


def _col(frame: pd.DataFrame, *candidates: str) -> str:
    normalized = {str(c).strip().lower().replace(" ", "").replace("_", ""): c for c in frame.columns}
    for candidate in candidates:
        key = candidate.lower().replace(" ", "").replace("_", "")
        if key in normalized:
            return normalized[key]
    raise ValueError(f"Expected one of {candidates} in {list(frame.columns)}")


def classify(master: dict[str, pd.DataFrame], history: pd.DataFrame) -> pd.DataFrame:
    equity = master["equity"]
    sym_col, series_col, isin_col = _col(equity, "SYMBOL"), _col(equity, "SERIES"), _col(equity, "ISIN NUMBER")
    current = equity[[sym_col, series_col, isin_col]].copy()
    current.columns = ["symbol", "series", "master_isin"]
    current["symbol"] = current.symbol.str.upper().str.strip()
    current["series"] = current.series.str.upper().str.strip()
    current["master_isin"] = current.master_isin.str.upper().str.strip()

    exclusions = {}
    for kind in ("etf", "reit", "invit"):
        frame = master[kind]
        col = _col(frame, "Symbol", "SYMBOL")
        exclusions[kind] = set(frame[col].str.upper().str.strip())

    keys = history[["symbol", "series", "isin"]].drop_duplicates().copy()
    keys["symbol"] = keys.symbol.astype(str).str.upper().str.strip()
    keys["series"] = keys.series.astype(str).str.upper().str.strip()
    keys["isin"] = keys["isin"].astype("string").fillna("").str.upper().str.strip()
    keys = keys.merge(current, on=["symbol", "series"], how="left", indicator=True)
    categories, confidence, reasons = [], [], []
    for row in keys.to_dict("records"):
        if row["symbol"] in exclusions["etf"]:
            categories.append("etf"); confidence.append("high"); reasons.append("NSE published ETF list")
        elif row["symbol"] in exclusions["reit"]:
            categories.append("reit"); confidence.append("high"); reasons.append("NSE published REIT list")
        elif row["symbol"] in exclusions["invit"]:
            categories.append("invit"); confidence.append("high"); reasons.append("NSE published InvIT list")
        elif row["_merge"] == "both" and row["series"] == "EQ" and row["master_isin"] and row["isin"] == row["master_isin"] and row["isin"].startswith("INE"):
            categories.append("listed_equity_candidate"); confidence.append("high"); reasons.append("NSE current EQ security master + matching ISIN; absent from ETF/REIT/InvIT masters")
        elif row["_merge"] == "both":
            categories.append("other_or_restricted"); confidence.append("medium"); reasons.append("Present in NSE equity security master but not eligible EQ ordinary-share screen")
        else:
            categories.append("unknown_historical_or_unmatched"); confidence.append("low"); reasons.append("No exact symbol-series match in current NSE masters")
    keys["instrument_class"] = categories
    keys["classification_confidence"] = confidence
    keys["classification_method"] = reasons
    return keys


def main() -> None:
    source = PROCESSED / "nse_eod.parquet"
    if not source.exists():
        raise SystemExit(f"Missing {source}; run build_tejhq_market_duckdb.py first")
    masters = download_masters()
    frame = pd.read_parquet(source, columns=["symbol", "series", "isin"])
    mapping = classify(masters, frame)
    eligible = mapping.loc[mapping.instrument_class == "listed_equity_candidate", ["symbol", "series", "isin"]].drop_duplicates()
    eligible_path = PROCESSED / "eligible_nse_equities.csv"
    eligible.to_csv(eligible_path, index=False)
    counts = mapping.groupby(["instrument_class", "classification_confidence"]).size().to_dict()
    counts = {f"{a}/{b}": int(v) for (a, b), v in counts.items()}
    REPORTS.mkdir(parents=True, exist_ok=True)
    report = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "source": "NSE published Equity, ETF, REIT and InvIT CSV masters",
        "masterUrls": MASTER_URLS,
        "historicalRows": int(len(frame)),
        "distinctSymbolSeriesIsin": int(len(mapping)),
        "classificationCounts": counts,
        "eligibleOrdinaryEquityCandidateCount": int(len(eligible)),
        "eligibleUniverse": str(eligible_path),
        "classificationPolicy": "Require an exact current NSE symbol+series match, EQ series, matching ISIN beginning INE, and absence from NSE ETF/REIT/InvIT lists. Do not infer from names. Non-matches remain unknown.",
        "limitations": ["Current security masters do not reconstruct delisted security status through all historical dates.", "EQ series and matching ISIN plus exclusion lists are a conservative candidate screen, not a legal instrument opinion; ambiguous securities remain outside the eligible universe."],
    }
    (REPORTS / "instrument_classification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    mapping.to_csv(REPORTS / "instrument_classification_detail.csv", index=False)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
