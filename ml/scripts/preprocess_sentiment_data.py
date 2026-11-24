from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)


def main() -> None:
    files = sorted(RAW.glob("sentiment_*.jsonl"))
    if not files:
        raise SystemExit("No sentiment files found. Run download_sentiment_data.py first.")
    for file in files:
        frame = pd.read_json(file, lines=True)
        frame.to_parquet(OUT / f"{file.stem}.parquet", index=False)
        print(file.name, len(frame), list(frame.columns))


if __name__ == "__main__":
    main()
