import { Router } from 'express'
import { ASSETS, ASSET_MAP, TYPES, TYPE_NAMES, EVENTS, eventRanges, MONTHS, TODAY, MARKET_PATH } from '../data/universe.js'
import { EDUCATION, COMPARE, GLOSSARY } from '../data/education.js'
import { publicAsset } from '../services/scoring.js'
import { allocate, timeMachine, RISK_LEVELS } from '../services/portfolio.js'
import { buildScenarios, analyze } from '../services/behaviour.js'
import { check, outcome, journalStats, PRESETS, EMOTIONS } from '../services/intervention.js'
import { getProfile, counts } from '../services/store.js'
import { newsFor } from '../services/news.js'
import { analyze as sentiment, aggregateProbabilities } from '../services/sentiment.js'
import { fetchNews, providerStatus } from '../services/realNews.js'
import { bad, num, oneOf, wrap, HttpError } from '../middleware/index.js'
import { marketDataStatus } from '../services/dataSource.js'
import { mlHealth, mlRequest, mlGet } from '../services/mlClient.js'
import { getIndianQuote } from '../services/indianMarket.js'

const r = Router()
const TYPE_ALIAS = { stocks: 'stock', stock: 'stock', mf: 'mf', mutual: 'mf', index: 'index', etf: 'etf' }

r.get('/health', async (req, res) => res.json({ status: 'ok', modules: ['Home', 'Budget', 'Behaviour', 'Pre Decision'], assets: ASSETS.length, months: MONTHS.length, dataSource: marketDataStatus(), ml: await mlHealth(), ...counts() }))

// ── Module 1: explainable investing ──
r.get('/education', (req, res) => res.json({ types: Object.values(EDUCATION), compare: COMPARE }))
r.get('/education/:type', (req, res) => { const t = EDUCATION[TYPE_ALIAS[req.params.type]]; if (!t) throw new HttpError(404, 'Unknown type'); res.json(t) })
r.get('/glossary', (req, res) => res.json(GLOSSARY))
r.get('/growth-types', (req, res) => res.json(Object.values(EDUCATION).map((e) => ({ id: e.id, title: e.title, desc: e.tagline, risk: e.risk, example: e.example.name }))))
r.get('/market', (req, res) => { const dataSource = marketDataStatus(); res.json({ labels: MONTHS, today: TODAY, events: eventRanges, benchmark: MARKET_PATH, dataSource, disclaimer: dataSource.mode === 'real' ? 'Historical prices are sourced from the prepared market dataset; they are not forecasts.' : 'All prices in this project are simulated for education.' }) })
r.get('/assets', wrap((req, res) => {
  const t = req.query.type ? TYPE_ALIAS[req.query.type] : null
  if (req.query.type && !t) throw bad('type must be stock, mf, index or etf')
  res.json(ASSETS.filter((a) => !t || a.type === t).map((a) => publicAsset(a)))
}))
r.get('/stocks/:type', (req, res) => { const t = TYPE_ALIAS[req.params.type]; res.json(ASSETS.filter((a) => a.type === t).map((a) => publicAsset(a))) })
r.get('/assets/:id', wrap((req, res) => {
  const a = ASSET_MAP[req.params.id]
  if (!a) throw new HttpError(404, 'Asset not found')
  res.json({ ...publicAsset(a, TODAY, true), labels: MONTHS, news: newsFor(a).items, newsSummary: newsFor(a).summary, events: eventRanges })
}))
r.post('/sentiment', wrap((req, res) => { if (typeof req.body.text !== 'string' || !req.body.text.trim()) throw bad('text is required'); res.json(sentiment(req.body.text.slice(0, 500))) }))
r.get('/ml/health', async (req, res) => res.json(await mlHealth()))
r.get('/market/quote', async (req, res) => res.json(await getIndianQuote(req.query.symbol, { exchange: req.query.exchange || 'NSE' })))
r.get('/ml/market/assets', async (req, res) => res.json(await mlGet('/ml/market/assets')))
r.get('/ml/market/assets/:symbol/history', async (req, res) => res.json(await mlGet(`/ml/market/assets/${encodeURIComponent(req.params.symbol)}/history`)))
r.post('/ml/predict/returns', async (req, res) => res.json(await mlRequest('/ml/predict/returns', req.body)))
r.post('/ml/sentiment/analyze', async (req, res) => res.json(await mlRequest('/ml/sentiment/analyze', req.body)))
r.post('/ml/sentiment/batch', async (req, res) => res.json(await mlRequest('/ml/sentiment/batch', req.body)))
r.get('/news/status', (req, res) => res.json(providerStatus()))
r.get('/news/latest', async (req, res) => {
  const feed = await fetchNews(req.query.symbol, req.query.limit)
  if (feed.status !== 'ok' || !feed.articles.length) return res.json(feed)
  const predictions = await mlRequest('/ml/sentiment/batch', { texts: feed.articles.map((article) => article.headline) })
  if (predictions.status !== 'ok') return res.json({ ...feed, sentimentStatus: predictions.status, message: 'News was retrieved, but FinBERT sentiment is unavailable.', articles: feed.articles.map((article) => ({ ...article, sentiment: null })) })
  const articles = feed.articles.map((article, index) => ({ ...article, sentiment: predictions.results[index] }))
  return res.json({ ...feed, articles, aggregate: aggregateProbabilities(articles) })
})
r.get('/news/:symbol', (req, res, next) => { req.url = '/news/latest?symbol=' + encodeURIComponent(req.params.symbol); return r.handle(req, res, next) })
r.post('/ml/portfolio/optimize', async (req, res) => res.json(await mlRequest('/ml/portfolio/optimize', req.body)))
r.get('/ml/portfolio/assets', async (req, res) => res.json(await mlGet('/ml/portfolio/assets')))
r.post('/ml/portfolio/backtest', async (req, res) => res.json(await mlRequest('/ml/portfolio/backtest', req.body)))
r.post('/ml/portfolio/compare', async (req, res) => res.json(await mlRequest('/ml/portfolio/compare', req.body)))
r.post('/ml/portfolio/risk-metrics', async (req, res) => res.json(await mlRequest('/ml/portfolio/risk-metrics', req.body)))
r.post('/ml/behavior/predict', async (req, res) => res.json(await mlRequest('/ml/behavior/predict', req.body)))
r.post('/ml/intervention/predict', async (req, res) => res.json(await mlRequest('/ml/intervention/predict', req.body)))

// ── Module 2: budget allocation ──
r.get('/risk-levels', (req, res) => res.json(RISK_LEVELS))
r.post('/allocate', wrap((req, res) => {
  const b = req.body || {}
  const amount = num(b.amount, 'amount', { min: 1000, max: 100_000_000, def: 50000, int: true })
  let types = b.types ?? (b.growthType ? [b.growthType] : [])
  if (!Array.isArray(types)) types = [types]
  types = [...new Set(types.map((t) => TYPE_ALIAS[t]).filter(Boolean))]
  if (types.length === 0 && (b.types?.length || b.growthType) && !(b.types || []).includes('all')) throw bad('types must contain stock, mf, index or etf')
  const risk = oneOf(b.risk, 'risk', ['low', 'medium', 'high'], 'medium')
  res.json(allocate({ amount, types, risk }))
}))
r.get('/time-machine', wrap((req, res) => {
  const q = req.query
  if (!ASSET_MAP[q.assetId]) throw bad('assetId is not valid')
  res.json(timeMachine({ assetId: q.assetId, month: num(q.month, 'month', { min: 0, max: TODAY - 1, int: true }), amount: num(q.amount, 'amount', { min: 1000, max: 100_000_000, def: 50000, int: true }) }))
}))

// ── Module 3: behavioural fingerprint ──
r.get('/behavioral/scenarios', wrap((req, res) => {
  const type = oneOf(TYPE_ALIAS[req.query.type] || req.query.type, 'type', TYPES, 'stock')
  res.json({ type, typeName: TYPE_NAMES[type], mode: req.query.mode === 'calm' ? 'calm' : 'pressure', scenarios: buildScenarios(type, req.query.mode === 'calm' ? 'calm' : 'pressure') })
}))
r.get('/behaviour/scenarios', (req, res, next) => { req.url = '/behavioral/scenarios?' + new URLSearchParams(req.query); r.handle(req, res, next) })
r.post('/behavioral/analyze', wrap((req, res) => {
  const b = req.body || {}
  const answers = Array.isArray(b.answers) ? b.answers : Array.isArray(b.decisions) ? b.decisions.map((d, i) => ({ scenarioId: i + 1, optionId: d.choice?.toLowerCase(), timeMs: d.timeMs })) : null
  if (!answers || answers.length < 3) throw bad('Send at least 3 answers: [{scenarioId, optionId, timeMs, timedOut}]')
  if (answers.length > 10) throw bad('At most 10 answers')
  const clean = answers.map((a) => ({ scenarioId: num(a.scenarioId, 'scenarioId', { min: 1, max: 10, int: true }), optionId: a.timedOut ? null : String(a.optionId || ''), timeMs: num(a.timeMs, 'timeMs', { min: 0, max: 600000, def: 0 }), timedOut: !!a.timedOut }))
  res.json(analyze({ type: oneOf(TYPE_ALIAS[b.type] || b.type, 'type', TYPES, 'stock'), mode: b.mode === 'calm' ? 'calm' : 'pressure', answers: clean }))
}))
r.get('/profile/:id', wrap((req, res) => { const p = getProfile(req.params.id); if (!p) throw new HttpError(404, 'Profile not found'); res.json(p) }))

// ── Module 4: pre-decision intervention ──
r.get('/intervention/presets', (req, res) => res.json({ presets: PRESETS, emotions: EMOTIONS, assets: ASSETS.map((a) => ({ id: a.id, name: a.name, type: a.type, price: a.prices[TODAY] })) }))
r.post('/intervention/check', wrap((req, res) => {
  const b = req.body || {}
  const asset = b.assetId || b.stock?.id
  if (!ASSET_MAP[asset]) throw bad('assetId is not valid')
  const amount = num(b.amount, 'amount', { min: 500, max: 100_000_000, def: 15000, int: true })
  res.json(check({
    assetId: asset, action: oneOf(String(b.action || 'BUY').toUpperCase(), 'action', ['BUY', 'SELL']), amount,
    portfolioValue: num(b.portfolioValue, 'portfolioValue', { min: 1000, max: 1_000_000_000, def: Math.max(100000, amount), int: true }),
    emotion: oneOf(b.emotion, 'emotion', EMOTIONS.map((e) => e.id), 'calm'), asOf: num(b.asOf, 'asOf', { min: 12, max: TODAY, def: TODAY, int: true }), profileId: typeof b.profileId === 'string' ? b.profileId : null,
  }))
}))
r.post('/intervention/outcome', wrap((req, res) => {
  const b = req.body || {}
  const o = outcome({ checkId: String(b.checkId || ''), decision: oneOf(String(b.decision || '').toLowerCase(), 'decision', ['proceed', 'modify', 'review', 'cancel']) })
  if (!o) throw new HttpError(404, 'Unknown checkId – run /intervention/check first')
  res.json(o)
}))
r.get('/intervention/journal/:profileId', (req, res) => res.json(journalStats(req.params.profileId)))

export default r
