"""Evaluate and save pretrained ProsusAI/finbert without mixing incompatible labels."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, classification_report, confusion_matrix
from transformers import AutoModelForSequenceClassification, AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "processed"
MODEL_DIR = ROOT / "models" / "finbert"
REPORTS = ROOT / "reports"
MODEL_NAME = "ProsusAI/finbert"


def evaluate(frame, mapping, tokenizer, model):
    texts = frame["sentence"].astype(str).tolist()
    y = frame["label"].map(mapping).to_numpy()
    predictions = []
    probabilities = []
    device = next(model.parameters()).device
    for start in range(0, len(texts), 64):
        batch = tokenizer(texts[start:start + 64], padding=True, truncation=True, max_length=128, return_tensors="pt").to(device)
        with torch.no_grad():
            logits = model(**batch).logits
            probs = torch.softmax(logits, dim=-1).cpu().numpy()
        predictions.extend(probs.argmax(axis=1))
        probabilities.extend(probs)
    id_to_label = {i: label.lower() for i, label in enumerate(model.config.id2label.values())}
    # FinBERT's native order is positive/negative/neutral; normalize to common class names.
    native = [id_to_label[int(x)] for x in predictions]
    pred = np.array([{"positive": 2, "neutral": 1, "negative": 0}[x] for x in native])
    return {"rows": len(frame), "classDistribution": {str(key): int(value) for key, value in pd.Series(y).value_counts().sort_index().items()}, "accuracy": accuracy_score(y, pred), "macro_f1": f1_score(y, pred, average="macro"), "weighted_f1": f1_score(y, pred, average="weighted"), "precisionMacro": precision_score(y, pred, average="macro", zero_division=0), "recallMacro": recall_score(y, pred, average="macro", zero_division=0), "classification_report": classification_report(y, pred, output_dict=True, zero_division=0), "confusion_matrix": confusion_matrix(y, pred).tolist(), "nativeLabels": id_to_label}


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
    device = torch.device("cuda" if os.getenv("FINSENSE_USE_CUDA") == "1" and torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    tokenizer.save_pretrained(MODEL_DIR)
    model.save_pretrained(MODEL_DIR)
    phrase = pd.read_parquet(next(RAW.glob("sentiment_financial_phrasebank_*.parquet"))).drop_duplicates("sentence")
    fiqa = pd.read_parquet(RAW / "sentiment_pauri32_fiqa-2018_test.parquet").drop_duplicates("sentence")
    report = {"model": MODEL_NAME, "createdAt": datetime.now(timezone.utc).isoformat(), "artifact": str(MODEL_DIR), "device": str(device), "evaluationScope": "Full available Financial PhraseBank sentences_allagree extract and the held-out FIQA test split; no artificial balancing or test-time training.", "labelMappings": {"financialPhraseBank": {"0": "negative", "1": "neutral", "2": "positive"}, "fiqa": {"0": "positive", "1": "neutral", "2": "negative"}}, "evaluations": {"financialPhraseBank": evaluate(phrase, {0: 0, 1: 1, 2: 2}, tokenizer, model), "fiqa": evaluate(fiqa, {0: 2, 1: 1, 2: 0}, tokenizer, model)}}
    (REPORTS / "finbert_evaluation.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
