"""Audit available sentiment split sizes, labels, duplicates and exact text overlap."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "reports" / "sentiment_dataset_audit.json"
LABELS = {
    "financialPhraseBank": {"0": "negative", "1": "neutral", "2": "positive"},
    "fiqa": {"0": "positive", "1": "neutral", "2": "negative"},
}


def read_rows(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def summarize(rows: list[dict[str, Any]], mapping: dict[str, str]) -> dict[str, Any]:
    texts = [str(row.get("sentence", "")).strip().casefold() for row in rows]
    labels = Counter(str(row.get("label")) for row in rows)
    return {
        "rows": len(rows),
        "uniqueTexts": len(set(texts)),
        "duplicateRows": len(texts) - len(set(texts)),
        "classDistribution": {mapping.get(label, f"unknown:{label}"): count for label, count in sorted(labels.items())},
        "texts": set(texts),
    }


def main() -> None:
    phrase_path = RAW / "sentiment_financial_phrasebank_train.jsonl"
    fiqa_paths = {split: RAW / f"sentiment_pauri32_fiqa-2018_{split}.jsonl" for split in ("train", "validation", "test")}
    result: dict[str, Any] = {"createdAt": datetime.now(timezone.utc).isoformat(), "datasets": {}}

    if phrase_path.exists():
        phrase = summarize(read_rows(phrase_path), LABELS["financialPhraseBank"])
        phrase.pop("texts")
        result["datasets"]["financialPhraseBank"] = {
            "configuration": "sentences_allagree",
            "availableSplits": ["train"],
            "separateTestSplitAvailable": False,
            **phrase,
        }

    fiqa: dict[str, dict[str, Any]] = {}
    for split, path in fiqa_paths.items():
        if path.exists():
            fiqa[split] = summarize(read_rows(path), LABELS["fiqa"])
    if fiqa:
        overlaps = {}
        for first, second in (("train", "validation"), ("train", "test"), ("validation", "test")):
            if first in fiqa and second in fiqa:
                overlaps[f"{first}__{second}"] = len(fiqa[first]["texts"] & fiqa[second]["texts"])
        result["datasets"]["fiqa"] = {
            "configuration": "pauri32/fiqa-2018",
            "availableSplits": list(fiqa),
            "splits": {split: {key: value for key, value in data.items() if key != "texts"} for split, data in fiqa.items()},
            "exactTextOverlapBySplitPair": overlaps,
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
