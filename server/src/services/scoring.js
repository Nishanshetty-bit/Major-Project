// Hybrid, explainable scoring:  Confidence = 70% performance model + 30% news-sentiment model.
// Every factor reports points, max and a plain-English note, so the UI can show *why*.
import { ASSET_MAP, ASSETS, TODAY } from '../data/universe.js'
import { retOver, cagrAvail, annVol, maxDrawdown, rsi, rolling, sharpe, scale, clamp, round, pctNum } from '../lib/stats.js'
import { newsFor } from './news.js'
import { marketDataStatus } from './dataSource.js'

const cache = new Map()
const tone = (pts, max) => (pts >= 0.65 * max ? 'good' : pts <= 0.35 * max ? 'bad' : 'ok')

export function metricsOf(asset, end = TODAY) {
  const p = asset.prices
  const c3 = cagrAvail(p, 3, end), c5 = cagrAvail(p, 5, end)
  const vol = annVol(p, end)
  const roll = rolling(p.slice(0, end + 1), 12)
  return {
    price: p[end], change1M: pctNum(retOver(p, 1, end) ?? 0), change3M: pctNum(retOver(p, 3, end) ?? 0), return1Y: pctNum(retOver(p, 12, end) ?? 0),
    cagr3Y: pctNum(c3), cagr5Y: pctNum(c5), volatility: pctNum(vol), maxDrawdown: pctNum(maxDrawdown(p, end)),
    sharpe: round(sharpe(c3, vol), 2), rsi: Math.round(rsi(p, end)), consistency: roll.length ? Math.round((100 * roll.filter((x) => x > 1).length) / roll.length) : 50,
  }
}

export function scoreAsset(idOrAsset, end = TODAY) {
  const asset = typeof idOrAsset === 'string' ? ASSET_MAP[idOrAsset] : idOrAsset
  const key = asset.id + ':' + end
  if (cache.has(key)) return cache.get(key)
  const m = metricsOf(asset, end)
  const F = []
  const add = (name, pts, max, note) => F.push({ name, points: round(pts, 1), max, tone: tone(pts, max), note })

  add('Long-term growth', scale(m.cagr3Y, 0, 20, 20), 20, `Grew ${m.cagr3Y}% a year over the last ${end >= 36 ? 3 : 'few'} years`)
  add('Recent return', scale(m.return1Y, -10, 30, 10), 10, `${m.return1Y >= 0 ? '+' : ''}${m.return1Y}% in the last 12 months`)
  add('Reward for risk', scale(m.sharpe, -0.2, 1.2, 15), 15, `Risk-adjusted score ${m.sharpe} (higher = more reward per unit of risk)`)
  add('Crash resilience', scale(m.maxDrawdown, -50, -5, 15) , 15, `Worst fall from a peak was ${m.maxDrawdown}%`)
  add('Consistency', scale(m.consistency, 40, 100, 10), 10, `${m.consistency}% of past 12-month periods ended in profit`)

  if (asset.type === 'stock') {
    const rel = asset.pe / asset.sectorPe
    add('Fair price (P/E)', scale(1.6 - rel, 0, 0.8, 12), 12, `P/E ${asset.pe} vs sector ${asset.sectorPe} – ${rel > 1.5 ? 'very expensive' : rel > 1.15 ? 'a bit expensive' : rel < 0.9 ? 'cheaper than peers' : 'fairly priced'}`)
    add('Business quality', scale(asset.roe, 5, 25, 10), 10, `Return on equity ${asset.roe}% – how well it turns money into profit`)
    add('Growth & safety', scale(asset.revGrowth, 5, 20, 5) + scale(1.5 - asset.de, 0, 1.2, 3), 8, `Revenue +${asset.revGrowth}%, debt-to-equity ${asset.de}`)
  } else {
    add('Low cost', scale(1.0 - asset.expense, 0, 0.8, 20), 20, `Costs ${asset.expense}% a year – ${asset.expense <= 0.25 ? 'very cheap' : asset.expense <= 0.65 ? 'moderate' : 'on the pricey side'}`)
    add('Diversification', scale(Math.log10(asset.holdings + 1), 0, 1.7, 10), 10, `Holds about ${asset.holdings} ${asset.holdings > 1 ? 'investments' : 'asset'}`)
  }
  const maxSum = F.reduce((a, f) => a + f.max, 0)
  const perf = (F.reduce((a, f) => a + f.points, 0) / maxSum) * 100

  const news = newsFor(asset, end)
  const sent = news.summary.index
  const gap = Math.abs(perf - sent)
  const mixed = gap > 35
  let conf = 0.7 * perf + 0.3 * sent
  if (mixed) conf *= 0.95
  if (asset.speculative) conf -= 6

  const flags = []
  if (asset.speculative) flags.push('Speculative: very high P/E and heavy debt')
  if (asset.type === 'stock' && asset.pe / asset.sectorPe > 1.5) flags.push('Priced far above its sector')
  if (m.rsi >= 80 && asset.beta > 0.3) flags.push('Overheated: price rose very fast lately')
  if (m.rsi <= 20 && asset.beta > 0.3) flags.push('Oversold: price has been falling steadily')
  if (m.maxDrawdown <= -45) flags.push(`Fell ${Math.abs(m.maxDrawdown)}% at its worst`)
  if (mixed) flags.push('Mixed signals: numbers and news disagree')

  const confidence = Math.round(clamp(conf, 5, 98))
  const verdict = confidence >= 70 ? 'Strong' : confidence >= 58 ? 'Good' : confidence >= 45 ? 'Fair' : 'Weak'
  const reasons = [...F].filter((f) => f.max > 0).sort((a, b) => b.points / b.max - a.points / a.max).map((f) => f.note)
  const out = {
    confidence, verdict, performance: Math.round(perf), sentiment: sent, sentimentLabel: news.summary.label, mixedSignals: mixed,
    factors: F.filter((f) => f.max > 0), flags, metrics: m,
    reasons: [reasons[0], reasons[1], flags[0] ? `⚠ ${flags[0]}` : reasons[reasons.length - 1]].filter(Boolean),
    formula: 'Confidence = 70% × performance model + 30% × news sentiment' + (mixed ? ' (−5% for mixed signals)' : ''),
  }
  cache.set(key, out)
  return out
}

export const publicAsset = (a, end = TODAY, withHistory = false) => {
  const s = scoreAsset(a, end)
  return {
    id: a.id, name: a.name, symbol: a.symbol, type: a.type, sector: a.sector, blurb: a.blurb, speculative: !!a.speculative,
    unit: a.type === 'mf' || a.type === 'index' ? 'NAV' : 'Price', price: a.prices[end], expense: a.expense ?? null,
    pe: a.pe ?? null, sectorPe: a.sectorPe ?? null, roe: a.roe ?? null, revGrowth: a.revGrowth ?? null, de: a.de ?? null, div: a.div ?? null,
    holdings: a.holdings ?? null, aum: a.aum ?? null, manager: a.manager ?? null,
    ...s, dataSource: marketDataStatus(), ...(withHistory ? { history: a.prices.slice(0, end + 1) } : { spark: a.prices.slice(Math.max(0, end - 24), end + 1) }),
  }
}
export const allScored = () => ASSETS.map((a) => publicAsset(a))
