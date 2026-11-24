"""Cached, batch-capable FinBERT inference and transparent news aggregation."""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Iterable

import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

try:
    from . import calibration  # noqa: F401 - makes serialized calibration classes importable
except ImportError:
    import calibration  # type: ignore # pragma: no cover

ROOT = __import__("pathlib").Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models" / "finbert"
MODEL_NAME = "ProsusAI/finbert"
CANONICAL = ("negative", "neutral", "positive")


@lru_cache(maxsize=1)
def _load_model():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    model.eval()
    return tokenizer, model


def _native_mapping(model) -> dict[str, int]:
    labels = {int(key): str(value).lower() for key, value in model.config.id2label.items()}
    return {label: index for index, label in labels.items()}


def predict_sentiment(texts: Iterable[str]) -> list[dict[str, Any]]:
    cleaned = [str(text).strip() for text in texts]
    if not cleaned or any(not text for text in cleaned):
        raise ValueError("Each headline must contain non-empty text")
    if any(len(text) > 5000 for text in cleaned):
        raise ValueError("Headline text must be at most 5,000 characters")
    tokenizer, model = _load_model()
    native = _native_mapping(model)
    batches = []
    with torch.no_grad():
        for start in range(0, len(cleaned), 32):
            batch = tokenizer(cleaned[start:start + 32], padding=True, truncation=True, max_length=128, return_tensors="pt")
            probabilities = torch.softmax(model(**batch).logits, dim=-1).cpu().numpy()
            for row in probabilities:
                canonical = np.array([row[native[label]] for label in CANONICAL], dtype=float)
                canonical = canonical / canonical.sum()
                index = int(np.argmax(canonical))
                batches.append({"sentiment": CANONICAL[index], "negativeProbability": float(canonical[0]), "neutralProbability": float(canonical[1]), "positiveProbability": float(canonical[2]), "confidence": float(canonical[index]), "model": MODEL_NAME, "processedAt": datetime.now(timezone.utc).isoformat()})
    return batches
