"""Download and inspect the Indian OHLCV dataset without assuming configs/splits."""
from pathlib import Path
import json
from datetime import datetime, timezone
import os
from itertools import islice
import pandas as pd

from datasets import get_dataset_config_names, get_dataset_split_names, load_dataset

DATASET = "vishnun0027/indian-market-historical-ohlcv"
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)
MAX_STOCK_ROWS = int(os.getenv("FINSENSE_MAX_STOCK_ROWS", "100000"))


def main() -> None:
    configs = get_dataset_config_names(DATASET)
    manifest = {"dataset": DATASET, "downloadedAt": datetime.now(timezone.utc).isoformat(), "configs": []}
    for config in configs:
        splits = get_dataset_split_names(DATASET, config_name=config)
        entry = {"config": config, "splits": splits, "selected": config in {"stocks", "etfs"}}
        # Streaming inspection records schema without downloading every configuration.
        for split in splits:
            preview = next(iter(load_dataset(DATASET, config, split=split, streaming=True)))
            entry[split] = {"columns": list(preview), "preview": {k: str(v)[:120] for k, v in preview.items()}}
        if config not in {"stocks", "etfs"}:
            manifest["configs"].append(entry)
            continue
        for split in splits:
            if config == "stocks":
                rows = list(islice(load_dataset(DATASET, config, split=split, streaming=True), MAX_STOCK_ROWS))
                frame = pd.DataFrame(rows)
                entry[split].update({"rows": len(frame), "features": "streamed bounded extract", "rowLimit": MAX_STOCK_ROWS})
                frame.to_parquet(str(RAW / f"market_{config}_{split}.parquet"), index=False)
            else:
                ds = load_dataset(DATASET, config, split=split)
                entry[split].update({"rows": len(ds), "features": str(ds.features)})
                ds.to_parquet(str(RAW / f"market_{config}_{split}.parquet"))
        manifest["configs"].append(entry)
    (RAW / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
