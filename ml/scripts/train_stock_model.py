"""Leakage-safe training entry point; refuses to fabricate a model without processed data."""
from pathlib import Path


def main() -> None:
    data = Path(__file__).resolve().parents[1] / "data" / "processed" / "market.parquet"
    if not data.exists():
        raise SystemExit("Market data is unavailable. Prepare it before training returns models.")
    raise SystemExit("Feature engineering/training is intentionally gated until the dataset schema is validated; see reports/dataset_validation.json.")


if __name__ == "__main__":
    main()
