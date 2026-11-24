"""Download sentiment datasets and preserve their native labels separately."""
from pathlib import Path
import json
from datetime import datetime, timezone
from datasets import load_dataset

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)


def main() -> None:
    manifest = {"downloadedAt": datetime.now(timezone.utc).isoformat(), "datasets": []}
    for name, config in [("financial_phrasebank", "sentences_allagree"), ("pauri32/fiqa-2018", None)]:
        kwargs = {"trust_remote_code": True} if config is None else {"name": config, "trust_remote_code": True}
        ds = load_dataset(name, **kwargs)
        entry = {"dataset": name, "config": config, "splits": {split: {"rows": len(value), "columns": value.column_names} for split, value in ds.items()}}
        for split, value in ds.items(): value.to_json(str(RAW / f"sentiment_{name.replace('/', '_')}_{split}.jsonl"))
        manifest["datasets"].append(entry)
    (RAW / "sentiment_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
