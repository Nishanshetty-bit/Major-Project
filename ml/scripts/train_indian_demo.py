"""Train isolated small-sample NSE demo models from verified TejHQ history."""
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             f1_score, log_loss, precision_score, recall_score,
                             roc_auc_score)
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/processed/indian/nse_eod.parquet"
UNIVERSE = ROOT / "data/processed/indian/eligible_nse_equities.csv"
MASTER = ROOT / "data/raw/tejhq/nse_equity_master.csv"
OUT = ROOT / "models/indian_demo"
REPORT = ROOT / "reports/indian/demo"
FEATURES = ["return_1d","return_5d","return_10d","return_20d","sma_50","sma_200","rsi_14","macd","macd_signal","volatility_20","volume_change","volume_sma_20","high_low_range","distance_sma_50","distance_sma_200"]

def metrics(y, p):
    y = np.asarray(y, dtype=int); p = np.clip(np.asarray(p), 1e-6, 1-1e-6); pred = (p >= .5).astype(int)
    return {"rows":len(y),"positivePrevalence":float(y.mean()),"prAuc":float(average_precision_score(y,p)),"rocAuc":float(roc_auc_score(y,p)),"brierScore":float(brier_score_loss(y,p)),"logLoss":float(log_loss(y,p)),"precision":float(precision_score(y,pred,zero_division=0)),"recall":float(recall_score(y,pred,zero_division=0)),"f1":float(f1_score(y,pred,zero_division=0))}

def main():
    eligible = pd.read_csv(UNIVERSE)
    rows = pd.read_parquet(DATA, columns=["symbol","series","isin","date","adjusted_close"] + FEATURES + ["target_5d","target_20d"])
    counts = rows[rows.symbol.isin(eligible.symbol)].groupby("symbol").size().sort_values(ascending=False)
    chosen = ["RELIANCE"] + [s for s in counts.index if s != "RELIANCE"][:24]
    names = pd.read_csv(MASTER, dtype=str).set_index("SYMBOL")["NAME OF COMPANY"].to_dict()
    rows = rows[rows.symbol.isin(chosen)].copy()
    rows["date"] = pd.to_datetime(rows.date, utc=True)
    universe = [{"symbol":s,"companyName":names.get(s,s),"classification":"NSE EQ exact symbol/series/ISIN match; excluded from NSE ETF/REIT/InvIT masters","historyRows":int(counts[s])} for s in chosen]
    manifest={"source":"TejHQ NSE adjusted EOD","createdAt":datetime.now(timezone.utc).isoformat(),"symbols":universe,"features":FEATURES,"targetDefinitions":{"5d":"adjusted close after 5 symbol-local trading observations > current adjusted close","20d":"adjusted close after 20 symbol-local trading observations > current adjusted close"}}
    OUT.mkdir(parents=True,exist_ok=True);REPORT.mkdir(parents=True,exist_ok=True)
    (OUT/"sample_equity_universe.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    (REPORT/"sample_equity_universe.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    fingerprint=__import__("hashlib").sha256(rows[["symbol","date","adjusted_close"]].sort_values(["symbol","date"]).to_csv(index=False).encode()).hexdigest()
    summary={"rows":len(rows),"symbols":len(chosen),"dateRange":[str(rows.date.min()),str(rows.date.max())],"datasetFingerprint":fingerprint,"features":FEATURES,"trainingTimestamp":datetime.now(timezone.utc).isoformat(),"targetDefinition":"per-symbol adjusted close shifted by the stated number of trading observations; terminal rows without complete horizon have null labels","featuresHistoricalOnly":True,"horizons":{}}
    for h in (5,20):
        frame=rows.dropna(subset=FEATURES+[f"target_{h}d"]).sort_values(["date","symbol"])
        dates=frame.date.drop_duplicates().sort_values(); i60=int(.55*len(dates));i70=int(.70*len(dates));i80=int(.80*len(dates));i85=int(.85*len(dates))
        train=frame[frame.date<dates.iloc[i60-h]];valid=frame[(frame.date>=dates.iloc[i60])&(frame.date<dates.iloc[i70-h])];cal=frame[(frame.date>=dates.iloc[i70])&(frame.date<dates.iloc[i80-h])];test=frame[frame.date>=dates.iloc[i85]]
        y=f"target_{h}d"; results={}
        models={"logistic_regression":make_pipeline(StandardScaler(),LogisticRegression(max_iter=600,class_weight="balanced")),"random_forest":RandomForestClassifier(n_estimators=120,max_depth=10,min_samples_leaf=4,class_weight="balanced",n_jobs=2,random_state=42)}
        for name,model in models.items():
            model.fit(train[FEATURES],train[y].astype(int)); vp=model.predict_proba(valid[FEATURES])[:,1];results[name]={"validation":metrics(valid[y],vp),"model":model}
        selected=max(results,key=lambda n:results[n]["validation"]["prAuc"]); model=results[selected]["model"]
        raw_cal=model.predict_proba(cal[FEATURES])[:,1]; raw_test=model.predict_proba(test[FEATURES])[:,1]
        calibration={}
        for method in ("sigmoid","isotonic"):
            calibrator=CalibratedClassifierCV(model,method=method,cv="prefit")
            calibrator.fit(cal[FEATURES],cal[y].astype(int)); cp=calibrator.predict_proba(cal[FEATURES])[:,1];tp=calibrator.predict_proba(test[FEATURES])[:,1]
            curve_y,curve_p=calibration_curve(cal[y],cp,n_bins=10,strategy="quantile")
            counts_bins=pd.qcut(cp,10,duplicates="drop").value_counts().sort_index().tolist()
            calibration[method]={"calibrationMetrics":metrics(cal[y],cp),"testMetrics":metrics(test[y],tp),"curve":{"observed":curve_y.tolist(),"predicted":curve_p.tolist(),"binCounts":counts_bins},"ece":float(np.average(np.abs(curve_y-curve_p),weights=counts_bins))}
        raw_metrics=metrics(test[y],raw_test);basep=float(train[y].mean());baseline=metrics(test[y],np.full(len(test),basep))
        result={"selectedModel":selected,"selectionMetric":"validation PR-AUC","validation":{k:v["validation"] for k,v in results.items()},"calibrationDateRange":[str(cal.date.min()),str(cal.date.max())],"calibration":calibration,"finalTest":raw_metrics,"baseline":baseline,"testDateRange":[str(test.date.min()),str(test.date.max())],"purgeTradingDates":h}
        per={}
        for sym,g in test.assign(prob=raw_test).groupby("symbol"):
            if len(g)<30 or g[y].nunique()<2: per[sym]={"status":"unavailable","rows":len(g),"reason":"fewer than 30 observations or one class"}
            else: per[sym]={"status":"ok","positiveCount":int(g[y].sum()),**metrics(g[y],g.prob)}
        result["perStock"]=per
        joblib.dump({"model":model,"features":FEATURES,"horizon":h,"modelName":selected,"calibrationStatus":"uncalibrated","datasetFingerprint":fingerprint,"trainingDateRange":[str(train.date.min()),str(train.date.max())],"validationDateRange":[str(valid.date.min()),str(valid.date.max())],"calibrationDateRange":[str(cal.date.min()),str(cal.date.max())],"testDateRange":[str(test.date.min()),str(test.date.max())],"trainedAt":summary["trainingTimestamp"],"sampleSymbols":chosen},OUT/f"returns_{h}d.joblib")
        summary["horizons"][str(h)]=result
    (REPORT/"training_summary.json").write_text(json.dumps(summary,indent=2,default=str),encoding="utf-8")
    print(json.dumps(summary,indent=2,default=str))

if __name__=="__main__": main()
