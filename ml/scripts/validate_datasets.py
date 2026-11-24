from pathlib import Path
import json
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
REPORTS = ROOT / "reports"
REPORTS.mkdir(parents=True, exist_ok=True)


def main() -> None:
    report = {"files": []}
    for file in sorted(RAW.glob("*.parquet")):
        frame = pd.read_parquet(file)
        numeric = frame.select_dtypes(include="number")
        report["files"].append({"file": file.name, "rows": len(frame), "columns": list(frame.columns), "nulls": frame.isna().sum().to_dict(), "duplicates": int(frame.duplicated().sum()), "negativeNumericValues": int((numeric < 0).sum().sum())})
    (REPORTS / "dataset_validation.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
