"""Download TejHQ NSE history and its separate audit/corporate-action trees.

Raw NSE, adjusted NSE, actions and symbol history remain in separate folders.
The script never overwrites the existing processed market/model artifacts.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "tejhq"
BASE = "https://huggingface.co/datasets/tejhq/indian-markets/resolve/main"
YEARS = range(2010, datetime.now(timezone.utc).year + 1)
FILES = [f"nse/year={year}/nse_{year}.parquet" for year in YEARS]
FILES += [f"prices_adjusted/nse_{year}.parquet" for year in YEARS]
FILES += [f"actions/nse_{year}.parquet" for year in YEARS]
FILES += ["symbol_history/nse.parquet", "universe/nse_liquid.parquet"]


def main() -> None:
    manifest = {"dataset": "tejhq/indian-markets", "downloadedAt": datetime.now(timezone.utc).isoformat(), "files": []}
    session = requests.Session()
    for relative in FILES:
        target = RAW / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.stat().st_size:
            manifest["files"].append({"path": relative, "bytes": target.stat().st_size, "status": "already-present"})
            continue
        url = f"{BASE}/{relative.replace('=', '%3D')}"
        temporary = target.with_suffix(target.suffix + ".download")
        response = session.get(url, stream=True, timeout=(20, 180))
        if response.status_code == 404 and "year=2026" in relative:
            manifest["files"].append({"path": relative, "status": "not-yet-published"})
            continue
        response.raise_for_status()
        with temporary.open("wb") as handle:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    handle.write(chunk)
        temporary.replace(target)
        manifest["files"].append({"path": relative, "bytes": target.stat().st_size, "status": "downloaded"})
        print(f"{relative}: {target.stat().st_size:,} bytes", flush=True)
    manifest["completedAt"] = datetime.now(timezone.utc).isoformat()
    (RAW / "download_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"files": len(manifest["files"]), "manifest": str(RAW / 'download_manifest.json')}, indent=2))


if __name__ == "__main__":
    main()
