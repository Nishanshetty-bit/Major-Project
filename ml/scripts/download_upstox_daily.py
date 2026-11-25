"""Download the daily (never minute) Upstox candles and metadata for audit."""
from datetime import datetime, timezone
import json
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "upstox"
BASE = "https://huggingface.co/datasets/xxparthparekhxx/indian-stock-market-minute-data/resolve/main"
FILES = ("day/train-00000.parquet", "symbols.csv", "calendar.csv", "adjustments.csv")


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    manifest = {"dataset": "xxparthparekhxx/indian-stock-market-minute-data", "subset": "day", "downloadedAt": datetime.now(timezone.utc).isoformat(), "files": []}
    for relative in FILES:
        target = RAW / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.stat().st_size:
            manifest["files"].append({"path": relative, "bytes": target.stat().st_size, "status": "already-present"})
            continue
        temporary = target.with_suffix(target.suffix + ".download")
        with requests.get(f"{BASE}/{relative}", stream=True, timeout=(20, 180)) as response:
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
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
