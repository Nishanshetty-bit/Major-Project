# FinSense â€“ Behavioral Finance Simulator (Full-Stack)

Explainable stock ranking Â· budget-aware portfolio allocation Â· behavioural fingerprinting Â· pre-decision regret intervention.
The legacy educational universe is simulated; the Budget page also exposes a separately labelled real-data optimizer when the prepared parquet is available. Not financial advice.

## Run it (2 minutes)
```bash
npm run install:all     # installs root, server and client
npm run dev             # API on :5000 + website on :5173  â†’ open http://localhost:5173
```
Or in two terminals: `cd server && npm install && npm start`  and  `cd client && npm install && npm run dev`.
If API port 5000 is already in use in PowerShell, run `$env:PORT='5001'; npm run dev`; the website proxy follows the API port and Vite will choose the next available web port.

The AI assistant uses Gemini through the server. Copy `.env.example` settings into `server/.env` and set `GEMINI_API_KEY`; the key is never sent to the browser. The AI chat offers project page shortcuts, beginner-friendly explanations, and quote-context explanations for selected stocks. AI output is educational, not financial advice.

Tests: `npm test` (7 API tests) Â· with the server running: `cd client && npm test` (UI smoke test of all 4 pages).

## How the 4 objectives map to the app
| Objective | Page | Backend |
|---|---|---|
| 1. Explainable ranking (performance + news sentiment â†’ one confidence score with reasons) | **Learn** (4 types) + asset drawer in **Budget** | `services/scoring.js`, `sentiment.js`, `news.js` |
| 2. Budget-aware allocation, 1/2/3-year history, wrong-choice simulations | **Budget** | `services/portfolio.js` |
| 3. Behavioural fingerprint through simulated pressure scenarios | **Behaviour** | `data/scenarios.js`, `services/behaviour.js` |
| 4. Pre-decision intervention (regret probability + nudge) | **Pre-Decision** | `services/intervention.js` |

## The fake market (server/src/data/universe.js)
61 monthly points (Oct 2021 â†’ Oct 2026) for 19 assets (8 stocks, 4 mutual funds, 3 index funds, 4 ETFs).
`return = alpha + betaÂ·market + sector effect + noise`, plus designed events: **crash** (Dec 22â€“Feb 23), **recovery**,
**HypeGreen mania + bubble burst** (Junâ€“Sep 24) and a **mini-dip**. Replace `universe.js` with a real CSV/DB loader later â€“ the rest of the code only reads `asset.prices`.

## How the maths works (good for viva)
* **Confidence = 70 % performance model + 30 % news sentiment.** Performance (100 pts): 3-yr growth 20, 1-yr return 10, reward-for-risk 15, crash resilience 15, consistency 10, then stocks: P/E vs sector 12 + ROE 10 + growth/debt 8; funds: low cost 20 + diversification 10. Mixed signals (|perf âˆ’ sentiment| > 35) lose 5 %.
* **Sentiment**: small financial lexicon with negation & intensifier handling, recency-weighted over 4 headlines.
* **Allocation**: filter by risk style â†’ rank by confidence Ã— type bias Ã— volatility penalty â†’ water-filling weight caps (30/35/40 %) â†’ min 5 % â†’ whole-share rounding & affordability check â†’ largest-remainder rounding to 100 %.
* **Projections**: the legacy page preserves simulated rolling windows; the real-data panel uses point-in-time monthly rebalancing on adjusted closes and reports CAGR, volatility, Sharpe, drawdown and an equity curve.
* **Mistakes**: all-in on the hyped stock at its peak, chasing last year's winner (back-tested every month), single volatile asset, panic-selling at the crash trough + a Time Machine for any asset/month.
* **Behaviour**: 10 scenarios Ã— 3 options, each option adds weighted points to 8 biases (normalised 0â€“100), plus speed penalty for rushed wrong answers; freezes (timeouts) tracked. Outputs archetype, readiness, coaching, suggested risk & mix.
* **Regret probability** = 35 % behaviour (your relevant biases + emotion) + 30 % historical pattern (what happened 3 months after similar moves) + 20 % valuation/technicals + 15 % context (trade size, sentiment conflict, speculation). Nudge â†’ Review / Modify (smaller size) / Proceed after cooling-off. Outcomes are real replays for past dates, simulated from analogs for "today". Everything is logged to a journal.

## Real data and ML service

The `ml/` directory contains reproducible dataset scripts, validation reports, a FastAPI service, and explicit model availability checks. Raw and processed data are gitignored. The downloader inspects Hugging Face configurations and splits instead of assuming a schema; preprocessing refuses incompatible schemas rather than fabricating data.

### Indian market source audit (new, not yet the serving dataset)

The TejHQ NSE daily tree and its separate `prices_adjusted`, `actions`, `symbol_history` and point-in-time `universe` trees are downloaded under `ml/data/raw/tejhq/`. The processed candidate is `ml/data/processed/indian/nse_eod.parquet`; its raw OHLCV and TejHQ split/bonus/dividend-adjusted close remain separate. It contains 7,377,964 rows across 4,441 symbols from 2010-01-04 through 2026-11-23. The quality report is `ml/data/processed/indian/data_quality_report.json`.

Upstox daily data plus `symbols.csv`, `calendar.csv` and `adjustments.csv` are preserved under `ml/data/raw/upstox/` for validation. Its `type` field is an NSE series (`EQ`/`BE`/`BZ`/`INDEX`), not an asset-class label. The TejHQ NSE candidate is therefore kept separate from the existing serving parquet until asset classification, the multi-source comparison, model retraining and application integration are complete. No Kaggle mutual-fund or supplementary EOD files were downloaded because Kaggle credentials are not configured in this environment.

Reproduce the downloaded data and candidate build with:

```bash
python ml/scripts/download_tejhq_data.py
python ml/scripts/download_upstox_daily.py
python ml/scripts/build_tejhq_market_duckdb.py
```

```bash
cd ml
pip install -r requirements.txt
python scripts/download_market_data.py
python scripts/validate_datasets.py
python scripts/preprocess_market_data.py
python scripts/download_sentiment_data.py
python scripts/preprocess_sentiment_data.py
uvicorn main:app --reload --port 8000
```

For a bounded reproducible equity download, set `FINSENSE_MAX_STOCK_ROWS=100000`; ETFs are downloaded in full. Then train and evaluate:

```bash
python scripts/train_stock_models.py
python scripts/train_sentiment_model.py
uvicorn ml.main:app --reload --port 8000
```

For the leakage-audited stock-model workflow, run `python scripts/validate_stock_models.py`. It verifies the per-symbol trading-day labels, fingerprints the dataset, purges split boundaries by the prediction horizon, evaluates two expanding walk-forward validation folds, compares baselines and tuned models, evaluates sigmoid calibration, produces per-symbol and volatility-regime results, and writes `ml/reports/stock_model_walk_forward.json` plus the compatibility report `ml/reports/stock_model_comparison.json`. The final test block is not used for tuning or model selection.

The market run records all five configurations (`indices`, `etfs`, `commodities`, `forex`, `stocks`) and downloads `stocks` plus `etfs`. The current verified run contains 100,000 streamed stock rows and 52,675 ETF rows, yielding 151,595 processed rows across 55 symbols. The return models use 15 historical-only features, per-symbol trading-row targets, purged expanding walk-forward validation, a final untouched test block, controlled hyperparameter search, and validation-only probability calibration. Artifacts are written to `ml/models/returns_5d.joblib`, `ml/models/returns_20d.joblib`, and `ml/models/finbert/`; reports are in `ml/reports/`.

## Financial news and FinBERT

Real news uses the public GDELT DOC 2.0 API through `server/src/services/realNews.js`; it requires no API key. The service applies a timeout, validates JSON responses and HTTP 429 rate limits, caches feeds for 60 seconds, deduplicates normalized URLs and syndicated matching headlines, and paces provider requests at a minimum five-second interval. It associates only known real-company names or unambiguous tickers in the named stock universe; synthetic demo assets are excluded. It returns `unavailable` separately from an empty feed. No credentials are required for GDELT. Provider rate limits are not published as a fixed quota; the client paces requests and reports provider throttling. Publisher links and article content remain subject to the original publisher terms.

News sentiment is scored by the preserved `ProsusAI/finbert` artifact. `/ml/sentiment/analyze` remains backward compatible, while `/ml/sentiment/batch` supports up to 100 non-empty headlines. Probabilities are returned in negative/neutral/positive order and normalized to sum to 1. Asset aggregation uses exponential seven-day recency weighting and caps each publisher at two contributing articles. The resulting score is sentiment evidence only, not a stock-return forecast.

The evaluation report is `ml/reports/finbert_evaluation.json`: 2,259 deduplicated Financial PhraseBank sentences and all 150 FIQA test rows. PhraseBank is an available `sentences_allagree` training extract rather than a separately published test split, so its score must not be described as general-news accuracy. FIQA uses the held-out test split and native 50/50/50 class prevalence. `ml/reports/sentiment_dataset_audit.json` records split sizes, duplicate counts and overlap checks. It finds 87 exact sentence overlaps between FIQA train and validation, but none involving its test split. Fine-tuning was not forced: available labelled data are small, the FIQA validation split is contaminated by overlap and cross-dataset results show materially weaker FIQA generalization; the pretrained model remains the production candidate.

News endpoints under `/api` are `GET /news/status`, `GET /news/latest?symbol=INFY&limit=6`, and `GET /news/:symbol`; batch sentiment is `POST /ml/sentiment/batch`. A live GDELT smoke request returned an explicit timeout/unavailable response in the current environment, so no fabricated or simulated real-news articles are shown.

Financial PhraseBank and FIQA are evaluated separately. Their mappings are PhraseBank `0=negative, 1=neutral, 2=positive` and FIQA `0=positive, 1=neutral, 2=negative`. The report evaluates the full deduplicated available PhraseBank `sentences_allagree` extract (2,259 of 2,264 rows; this configuration has no separate test split) and all 150 FIQA held-out test rows.

The API exposes `dataSource.mode` as `simulated` for the legacy Node universe. Real portfolio endpoints read `ml/data/processed/market.parquet` directly through FastAPI and return `dataMode: real`, source, price field and latest observation date. The two modes are never silently mixed. Behavioural and subjective-regret models remain experimental until defensible labelled data exists; the existing rule-based experience is the operational baseline.

The additive ML endpoints are `GET /api/ml/health`, `GET /api/ml/market/assets`, `GET /api/ml/market/assets/:symbol/history`, `POST /api/ml/predict/returns`, `POST /api/ml/sentiment/analyze`, `GET /api/ml/portfolio/assets`, `POST /api/ml/portfolio/optimize`, `POST /api/ml/portfolio/backtest`, `POST /api/ml/portfolio/compare`, `POST /api/ml/portfolio/risk-metrics`, `POST /api/ml/behavior/predict`, and `POST /api/ml/intervention/predict`. The Node service applies timeouts and returns explicit unavailable responses when FastAPI is down.

## Indian NSE data candidate and external quotes

The Indian source audit uses TejHQ NSE EOD files with raw OHLCV and documented adjusted close. Download/build via `python ml/scripts/download_tejhq_data.py` and `python ml/scripts/build_tejhq_market_duckdb.py`. NSE's current equity, ETF, REIT and InvIT masters are downloaded by `python ml/scripts/classify_indian_instruments.py`; exact symbol, series and ISIN matching is required, and unknown/delisted history remains excluded. The generated universe is `ml/data/processed/indian/eligible_nse_equities.csv`; counts and policy are in `ml/reports/indian/instrument_classification.json`.

Run `python ml/scripts/train_indian_candidate.py` to filter the classified rows and reuse the purged walk-forward validation, final holdout, calibration, per-symbol metrics and volatility-regime report. The current full candidate has 4,182,723 rows from 2,417 symbols (2010-01-04 to 2026-11-23). It uses the existing 15 features and logistic regression to keep the full cross-section trainable on a workstation. Its untouched holdout ROC AUC is 0.511 for 5-day and 0.489 for 20-day returns; uncalibrated Brier scores are worse than constant-prevalence baselines, so the summary recommends against activation. Candidate artifacts go only to `ml/models/indian_candidate/` and `ml/reports/indian_candidate/`. This does not change production model paths or serving behavior.

Use the navbar's stock-search button to browse popular NSE symbols, search by company or symbol, and open a quote without leaving the current page. Express proxies these requests through `GET /api/market/stocks`, `GET /api/market/search?q=infosys` and `GET /api/market/quote?symbol=RELIANCE`. Run the supplied [0xramm/Indian-Stock-Market-API](https://github.com/0xramm/Indian-Stock-Market-API) archive with `npm install` and `npm run dev` (its local Wrangler URL defaults to `http://127.0.0.1:8787`), or set `INDIAN_STOCK_API_BASE_URL` to another accessible deployment. That API fetches Yahoo Finance data; quotes may be delayed or cached and are not independently verified as exchange real-time. If the provider is unavailable, the website reports that rather than showing simulated values. Quotes are display-only and never enter historical ML.

## Real portfolio methodology

`ml/portfolio_service.py` validates the parquet schema, uses only positive `adjusted_close` values, removes duplicate symbol/date rows, aligns instruments on common trading dates and records ineligible assets. The verified extract contains 38 stocks and 17 ETFs; no mutual-fund NAVs or indices are invented. The default request selects the 12 symbols with the strongest coverage to avoid forward-filling across incompatible listing histories.

The real strategies are equal weight, long-only minimum variance, historical risk-adjusted utility, and a historical rule benchmark. Weights sum to 100% and respect profile caps of 30%, 35% and 40% for low, medium and high risk (with the smallest feasible cap when fewer assets are requested). Risk-adjusted allocation maximizes `wÂ·Î¼ âˆ’ Î» wáµ€Î£w`, where `Î¼` and `Î£` are annualized trailing historical return and covariance estimates; the risk-free assumption is 6%. Budget allocation uses whole units for the available stock/ETF categories and reports unallocated INR rather than fabricating fractional purchases.

Backtests use the latest available 1-, 2- or 3-year window, require a 252-trading-day warm-up, rebalance monthly, and construct weights only from the preceding 252 observations. They return initial/final value, total return, CAGR, annualized volatility, Sharpe, maximum drawdown and the equity curve. Insufficient common history returns `status: unavailable`. ML positive-return probabilities remain supplementary and are not treated as expected returns.

## Implementation status

| Module | Previous implementation | New implementation | Status |
|---|---|---|---|
| Explainable Analysis | Seeded prices + lexicon | Preserved demo path, source indicator, ML sentiment boundary | Partially implemented; FinBERT unavailable until trained/configured |
| Budget Allocation | Rule-based allocation + simulated backtests | Preserved legacy contract plus real adjusted-close optimization/backtesting panel | Real strategies available when parquet exists; legacy demo remains labelled |
| Behavioural Fingerprinting | 10 manually authored scenarios | Preserved rule baseline, explicit experimental ML endpoint | Experimental ML; rule baseline operational |
| Pre-Decision Intervention | Weighted simulated analogues | Preserved UX, objective-outcome ML boundary | Experimental ML; subjective regret unavailable |

## API (all under /api)
`GET health Â· education[/:type] Â· glossary Â· market Â· assets[?type] Â· assets/:id Â· risk-levels`
`POST allocate {amount, types[], risk}` Â· `GET time-machine?assetId&month&amount`
`GET behavioral/scenarios?type&mode` Â· `POST behavioral/analyze {type, mode, answers[]}` Â· `GET profile/:id`
`GET intervention/presets` Â· `POST intervention/check` Â· `POST intervention/outcome` Â· `GET intervention/journal/:profileId`
Validation errors â†’ 400, unknown routes â†’ 404, rate-limited, JSON persisted to `server/.data/store.json`.

## Suggested 5-minute demo
1. **Learn** â†’ open *Index Funds* â†’ play the animation â†’ *Try it* â†’ crash a company in *Stocks* vs *Index*.
2. **Budget** â†’ â‚¹50,000, all types, Balanced â†’ open a holding (score breakdown + news) â†’ 1Y/2Y/3Y tabs â†’ *Mistakes* â†’ Time Machine: HypeGreen at Jun 24.
3. **Behaviour** â†’ Pressure mode, stock â†’ fingerprint.
4. **Pre-Decision** â†’ preset *FOMO at the peak* â†’ nudge â†’ *Proceed anyway* â†’ see the real âˆ’64 % replay â†’ journal.

Keyboard: A/B/C answer scenarios Â· Esc closes drawers. Respects `prefers-reduced-motion`.
