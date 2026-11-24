// Budget-aware allocation + historical (back-tested) projections + "what if you chose wrong" simulations.
import { ASSETS, ASSET_MAP, TODAY, TYPES, TYPE_NAMES, MONTHS, monthLong, MARKET_PATH } from '../data/universe.js'
import { scoreAsset } from './scoring.js'
import { clamp, round, annVol, maxDrawdown, monthlyReturns, percentile, mean, cagrAvail, sharpe } from '../lib/stats.js'

const RISK = {
  low: { label: 'Cautious', cap: 0.3, volPenalty: 1.1, minConf: 55, spec: 0, bias: { index: 1.3, etf: 1.25, mf: 1.0, stock: 0.6 } },
  medium: { label: 'Balanced', cap: 0.35, volPenalty: 0.55, minConf: 48, spec: 0, bias: { index: 1.1, etf: 1.05, mf: 1.1, stock: 1.0 } },
  high: { label: 'Adventurous', cap: 0.4, volPenalty: 0.2, minConf: 40, spec: 0.08, bias: { index: 0.95, etf: 0.9, mf: 1.1, stock: 1.2 } },
}
export const RISK_LEVELS = Object.entries(RISK).map(([id, r]) => ({ id, label: r.label, cap: r.cap }))

export function portfolioSeries(items, from = 0, to = TODAY) {
  // monthly-rebalanced constant-weight index, starts at 1
  const out = [1]
  for (let t = from + 1; t <= to; t++) {
    let r = 0
    for (const { id, weight } of items) { const p = ASSET_MAP[id].prices; r += weight * (p[t] / p[t - 1] - 1) }
    out.push(out[out.length - 1] * (1 + r))
  }
  return out
}

function distribute(utils, cap) {
  // water-filling: cap each weight, push surplus to the others proportionally
  const ids = Object.keys(utils)
  const effCap = Math.max(cap, 1 / ids.length + 0.05)
  let w = {}
  const tot = ids.reduce((a, k) => a + utils[k], 0)
  ids.forEach((k) => (w[k] = utils[k] / tot))
  for (let iter = 0; iter < 10; iter++) {
    const over = ids.filter((k) => w[k] > effCap + 1e-9)
    if (!over.length) break
    let surplus = 0
    over.forEach((k) => { surplus += w[k] - effCap; w[k] = effCap })
    const free = ids.filter((k) => w[k] < effCap - 1e-9)
    const ft = free.reduce((a, k) => a + w[k], 0) || 1
    free.forEach((k) => (w[k] += (surplus * w[k]) / ft))
  }
  return w
}
function toPercents(w) {
  const ids = Object.keys(w)
  const raw = ids.map((k) => ({ k, v: w[k] * 100 }))
  const base = raw.map((x) => ({ ...x, f: Math.floor(x.v), r: x.v - Math.floor(x.v) }))
  let left = 100 - base.reduce((a, x) => a + x.f, 0)
  base.sort((a, b) => b.r - a.r).forEach((x) => { if (left > 0) { x.f++; left-- } })
  return Object.fromEntries(base.map((x) => [x.k, x.f]))
}

export function allocate({ amount, types = [], risk = 'medium' }) {
  const R = RISK[risk]
  const use = types.length ? types : TYPES
  const excluded = []
  let pool = ASSETS.filter((a) => use.includes(a.type)).map((a) => ({ a, s: scoreAsset(a) }))

  // 1) quality filter
  pool = pool.filter(({ a, s }) => {
    if (a.speculative && R.spec === 0) { excluded.push({ id: a.id, name: a.name, reason: `Speculative – P/E ${a.pe} vs sector ${a.sectorPe}, heavy debt. Not suitable for a ${R.label.toLowerCase()} plan.` }); return false }
    if (s.confidence < R.minConf) { excluded.push({ id: a.id, name: a.name, reason: `Confidence only ${s.confidence}/100 – below the ${R.minConf} needed for a ${R.label.toLowerCase()} plan.` }); return false }
    return true
  })
  // 2) rank by risk-adjusted utility
  const util = ({ a, s }) => {
    const volNorm = clamp(s.metrics.volatility / 35, 0, 1.2)
    return Math.max(1, s.confidence - 35) * R.bias[a.type] * Math.max(0.15, 1 - R.volPenalty * volNorm * 0.6)
  }
  pool.forEach((x) => (x.u = util(x)))
  pool.sort((x, y) => y.u - x.u)
  const nTarget = clamp(Math.floor(amount / 12000) + 2, 2, 7)
  // 3) affordability loop (a share must be buyable)
  let pick = pool.slice(0, nTarget + 1)
  let weights, percents
  for (let guard = 0; guard < 8; guard++) {
    pick = pick.slice(0, Math.max(1, Math.min(nTarget, pick.length)))
    if (!pick.length) break
    const cap = R.cap
    weights = distribute(Object.fromEntries(pick.map((x) => [x.a.id, x.u])), cap)
    // speculative cap
    pick.forEach((x) => { if (x.a.speculative && weights[x.a.id] > R.spec) weights[x.a.id] = R.spec })
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    Object.keys(weights).forEach((k) => (weights[k] /= sum))
    const drop = pick.find((x) => (x.a.type === 'stock' || x.a.type === 'etf') && amount * weights[x.a.id] < x.a.prices[TODAY])
    const small = pick.find((x) => weights[x.a.id] < 0.05)
    const bad = drop || small
    if (!bad) break
    excluded.push({ id: bad.a.id, name: bad.a.name, reason: drop ? `One ${bad.a.type === 'etf' ? 'unit' : 'share'} costs ₹${bad.a.prices[TODAY]} – more than its slice of your budget.` : 'Slice would be under 5% – too small to matter.' })
    const rest = pool.filter((x) => !pick.includes(x) && !excluded.find((e) => e.id === x.a.id))
    pick = pick.filter((x) => x !== bad)
    if (rest.length && pick.length < nTarget) pick.push(rest[0])
  }
  percents = toPercents(weights)

  // 4) build holdings
  let invested = 0
  const holdings = pick.map(({ a, s }) => {
    const pct = percents[a.id]
    const alloc = Math.floor((amount * pct) / 100)
    const price = a.prices[TODAY]
    const whole = a.type === 'stock' || a.type === 'etf'
    const units = whole ? Math.floor(alloc / price) : round(alloc / price, 3)
    const cost = whole ? round(units * price, 0) : alloc
    invested += cost
    const exp = s.metrics.cagr3Y
    return {
      id: a.id, name: a.name, symbol: a.symbol, type: a.type, sector: a.sector, pct, amount: cost, targetAmount: alloc, units, price,
      unit: whole ? (a.type === 'etf' ? 'units' : 'shares') : 'units', confidence: s.confidence, verdict: s.verdict, sentiment: s.sentimentLabel,
      risk: s.metrics.volatility > 26 ? 'High' : s.metrics.volatility > 15 ? 'Medium' : 'Low', volatility: s.metrics.volatility, historicalCagr: exp,
      reasons: s.reasons, flags: s.flags, factors: s.factors,
      why: `${a.name} earns ${pct}% because its confidence score is ${s.confidence}/100 (${s.verdict.toLowerCase()}) and it ${a.type === 'stock' ? 'adds growth' : a.type === 'etf' || a.type === 'index' ? 'is a low-cost core holding' : 'is professionally diversified'} for a ${R.label.toLowerCase()} plan.`,
    }
  }).sort((x, y) => y.pct - x.pct)

  const items = holdings.map((h) => ({ id: h.id, weight: h.pct / 100 }))
  const series = portfolioSeries(items)
  const proj = projections(series, amount)
  const vol = annVol(series), c3 = cagrAvail(series, 3)
  const typeMix = Object.fromEntries(TYPES.map((t) => [t, holdings.filter((h) => h.type === t).reduce((a, h) => a + h.pct, 0)]))
  const sectorMix = {}
  holdings.forEach((h) => (sectorMix[h.sector] = (sectorMix[h.sector] || 0) + h.pct))
  const divScore = Math.round(clamp((1 - Math.max(...holdings.map((h) => h.pct)) / 100) * 100 * 1.15 + Math.min(holdings.length, 6) * 3, 0, 100))

  return {
    input: { amount, types: use, risk, riskLabel: R.label }, holdings, invested: round(invested, 0), cashLeft: round(amount - invested, 0),
    excluded, typeMix, sectorMix, diversificationScore: divScore,
    stats: { volatility: round(vol * 100, 1), maxDrawdown: round(maxDrawdown(series) * 100, 1), sharpe: round(sharpe(c3, vol), 2), historicalCagr: round(c3 * 100, 1) },
    projections: proj,
    history: { labels: MONTHS, portfolio: series.map((v) => round(v * amount, 0)), benchmark: MARKET_PATH.map((v) => round((v / 100) * amount, 0)) },
    mistakes: mistakes(amount, series, holdings),
    method: [
      'Score every asset: 70% performance model + 30% news sentiment.',
      `Remove assets that fail your ${R.label.toLowerCase()} filter or that you can't afford.`,
      'Rank by confidence adjusted for volatility; bigger weight to higher, steadier scores.',
      `Cap any single holding at ${Math.round(Math.max(R.cap, 1 / holdings.length + 0.05) * 100)}% and round to whole shares.`,
      'Back-test the final mix on every historical window of 1, 2 and 3 years.',
    ],
  }
}

function pathFrom(series, s, h) { return series.slice(s, s + h + 1).map((v) => v / series[s]) }

export function projections(series, amount) {
  const out = {}
  for (const years of [1, 2, 3]) {
    const h = years * 12
    const wins = []
    for (let s = 0; s + h <= series.length - 1; s++) wins.push({ s, m: series[s + h] / series[s] })
    const sorted = [...wins].sort((a, b) => a.m - b.m)
    const med = percentile(wins.map((w) => w.m), 0.5)
    const medW = wins.reduce((best, w) => (Math.abs(w.m - med) < Math.abs(best.m - med) ? w : best), wins[0])
    const worst = sorted[0], best = sorted[sorted.length - 1]
    const val = (m) => Math.round(amount * m)
    out[years] = {
      years, months: h, windows: wins.length, positivePct: Math.round((100 * wins.filter((w) => w.m > 1).length) / wins.length),
      worst: { multiple: round(worst.m, 3), value: val(worst.m), gain: val(worst.m) - amount, start: monthLong(worst.s), end: monthLong(worst.s + h) },
      p10: { value: val(percentile(wins.map((w) => w.m), 0.1)) },
      median: { multiple: round(med, 3), value: val(med), gain: val(med) - amount, start: monthLong(medW.s), end: monthLong(medW.s + h) },
      p90: { value: val(percentile(wins.map((w) => w.m), 0.9)) },
      best: { multiple: round(best.m, 3), value: val(best.m), gain: val(best.m) - amount, start: monthLong(best.s), end: monthLong(best.s + h) },
      annualisedMedian: round((med ** (1 / years) - 1) * 100, 1),
      paths: {
        labels: Array.from({ length: h + 1 }, (_, i) => (i === 0 ? 'Start' : `M${i}`)),
        worst: pathFrom(series, worst.s, h).map((v) => val(v)), median: pathFrom(series, medW.s, h).map((v) => val(v)), best: pathFrom(series, best.s, h).map((v) => val(v)),
      },
    }
  }
  return out
}

/** The four classic mistakes, each back-tested on the same fake history with the user's amount. */
function mistakes(amount, series, holdings) {
  const V = (x) => Math.round(amount * x)
  const hype = ASSET_MAP.hypegreen
  const list = []

  // 1. All-in on the hyped stock at the peak
  {
    const t0 = 32
    const cp = [3, 12, 24].map((k) => ({ label: `After ${k < 12 ? k + ' months' : k / 12 + (k === 12 ? ' year' : ' years')}`, k, wrong: V(hype.prices[t0 + k] / hype.prices[t0]), right: V(series[t0 + k] / series[t0]) }))
    list.push({
      id: 'hype', emoji: '🚀', title: 'All-in on the hot stock', tag: 'FOMO',
      story: [`${monthLong(t0)}: HypeGreen is up ${Math.round((hype.prices[t0] / hype.prices[t0 - 3] - 1) * 100)}% in 3 months. Everyone is talking about it.`, 'You put your whole budget in at the top.', `Three months later it is ${Math.round((hype.prices[t0 + 3] / hype.prices[t0] - 1) * 100)}%.`],
      wrongLabel: '100% HypeGreen', rightLabel: 'Your diversified plan', checkpoints: cp, startLabel: monthLong(t0),
      wrongPath: hype.prices.slice(t0, t0 + 25).map((v) => V(v / hype.prices[t0])), rightPath: series.slice(t0, t0 + 25).map((v) => V(v / series[t0])),
      lesson: 'A rising price is not a reason to buy. By the time everyone talks about a stock, the easy money is usually gone.', loss: V(hype.prices[t0 + 3] / hype.prices[t0]) - amount,
    })
  }
  // 2. Chasing last year's winner (back-test every month)
  {
    const res = []
    for (let t = 12; t + 12 <= TODAY; t++) {
      const cands = ASSETS.map((a) => ({ a, r: a.prices[t] / a.prices[t - 12] })).sort((x, y) => y.r - x.r)[0]
      res.push({ t, name: cands.a.name, prevRet: cands.r - 1, m: cands.a.prices[t + 12] / cands.a.prices[t], plan: series[t + 12] / series[t] })
    }
    const worst = res.reduce((b, x) => (x.m < b.m ? x : b), res[0])
    const losing = res.filter((x) => x.m < 1).length
    list.push({
      id: 'chase', emoji: '🏃', title: "Chasing last year's winner", tag: 'Recency bias',
      story: [`We tested buying the single best performer of the last 12 months, every month from ${monthLong(12)}.`, `It lost money in ${Math.round((100 * losing) / res.length)}% of cases over the next year.`, `Worst case: bought ${worst.name} in ${monthLong(worst.t)} after +${Math.round(worst.prevRet * 100)}%, then ${Math.round((worst.m - 1) * 100)}%.`],
      wrongLabel: 'Buy the 1-year winner', rightLabel: 'Your diversified plan',
      checkpoints: [{ label: 'Average next year', wrong: V(mean(res.map((x) => x.m))), right: V(mean(res.map((x) => x.plan))) }, { label: 'Worst next year', wrong: V(worst.m), right: V(worst.plan) }, { label: 'Best next year', wrong: V(Math.max(...res.map((x) => x.m))), right: V(Math.max(...res.map((x) => x.plan))) }],
      startLabel: monthLong(worst.t), wrongPath: ASSET_MAP[ASSETS.find((a) => a.name === worst.name).id].prices.slice(worst.t, worst.t + 13).map((v, _, arr) => V(v / arr[0])), rightPath: pathFrom(series, worst.t, 12).map(V),
      lesson: 'Past winners are not promised winners. Spreading across several assets protects you when the leader stumbles.', loss: V(worst.m) - amount,
    })
  }
  // 3. No diversification: the single most volatile non-speculative fund/stock
  {
    const risky = ASSETS.filter((a) => !a.speculative).sort((a, b) => annVol(b.prices) - annVol(a.prices))[0]
    const t0 = 13
    const cp = [3, 12, 36].map((k) => ({ label: `After ${k < 12 ? k + ' months' : k / 12 + (k === 12 ? ' year' : ' years')}`, k, wrong: V(risky.prices[t0 + k] / risky.prices[t0]), right: V(series[t0 + k] / series[t0]) }))
    const dd = maxDrawdown(risky.prices, TODAY)
    list.push({
      id: 'concentrated', emoji: '🥚', title: 'All eggs in one basket', tag: 'Overconfidence',
      story: [`You pick one bold asset – ${risky.name} – with ${Math.round(annVol(risky.prices) * 100)}% yearly swings.`, `Crash hits in ${monthLong(14)}. It fell as much as ${Math.round(Math.abs(dd) * 100)}% from its peak.`, `A diversified plan fell ${Math.abs(Math.round(maxDrawdown(series) * 100))}% at worst. Same market, different pain.`],
      wrongLabel: `100% ${risky.name}`, rightLabel: 'Your diversified plan', checkpoints: cp, startLabel: monthLong(t0),
      wrongPath: risky.prices.slice(t0, t0 + 25).map((v) => V(v / risky.prices[t0])), rightPath: series.slice(t0, t0 + 25).map((v) => V(v / series[t0])),
      lesson: 'Even good assets have terrible months. Diversification does not stop falls, it makes them survivable.', loss: Math.min(...risky.prices.slice(t0, t0 + 6).map((v) => V(v / risky.prices[t0]))) - amount,
    })
  }
  // 4. Panic exit at the bottom
  {
    const t0 = 13
    let trough = t0
    for (let t = t0; t <= 22; t++) if (series[t] < series[trough]) trough = t
    const hold = TODAY
    list.push({
      id: 'panic', emoji: '😱', title: 'Panic-selling the crash', tag: 'Loss aversion',
      story: [`You follow your plan from ${monthLong(t0)}. The crash arrives.`, `At the bottom (${monthLong(trough)}) your ₹${amount.toLocaleString('en-IN')} shows ₹${V(series[trough] / series[t0]).toLocaleString('en-IN')}. You panic and sell.`, `Six months later the market has recovered – without you.`],
      wrongLabel: `Sold in ${monthLong(trough)}`, rightLabel: 'Held the plan',
      checkpoints: [{ label: `At the bottom (${monthLabelShort(trough)})`, wrong: V(series[trough] / series[t0]), right: V(series[trough] / series[t0]) }, { label: `6 months later`, wrong: V(series[trough] / series[t0]), right: V(series[Math.min(trough + 6, hold)] / series[t0]) }, { label: 'Today', wrong: V(series[trough] / series[t0]), right: V(series[hold] / series[t0]) }],
      startLabel: monthLong(t0), wrongPath: series.slice(t0, hold + 1).map((v, i) => V(t0 + i <= trough ? v / series[t0] : series[trough] / series[t0])), rightPath: series.slice(t0, hold + 1).map((v) => V(v / series[t0])),
      lesson: 'Selling in a crash turns a temporary dip into a permanent loss. Time in the market beats timing the market.', loss: V(series[trough] / series[t0]) - amount,
    })
  }
  return list
}
const monthLabelShort = (t) => MONTHS[t]

/** Time machine: invest `amount` in an asset (or your plan) at any historical month. */
export function timeMachine({ assetId, month, amount }) {
  const a = ASSET_MAP[assetId]
  const t0 = clamp(Math.round(month), 0, TODAY - 1)
  const p = a.prices
  const path = p.slice(t0).map((v) => Math.round((amount * v) / p[t0]))
  const cps = [3, 12, 24, 36].filter((k) => t0 + k <= TODAY).map((k) => ({ months: k, value: Math.round((amount * p[t0 + k]) / p[t0]) }))
  const lowIdx = path.indexOf(Math.min(...path))
  const worstFall = Math.min(...path) - amount
  const final = path[path.length - 1]
  const nearPeak = p[t0] >= Math.max(...p.slice(0, t0 + 1)) * 0.97 && t0 > 6
  return {
    asset: { id: a.id, name: a.name }, month: t0, monthLabel: monthLong(t0), amount, labels: MONTHS.slice(t0), path, checkpoints: cps,
    final, gain: final - amount, lowestValue: Math.min(...path), lowestMonth: monthLong(t0 + lowIdx), worstFall,
    verdict: final >= amount * 1.1 ? 'Good outcome' : final >= amount * 0.95 ? 'Roughly flat' : 'Painful outcome',
    note: nearPeak ? 'You bought near the all-time high – a classic way to start with a loss.' : worstFall < -amount * 0.2 ? `You would have seen a ${Math.round((-worstFall / amount) * 100)}% fall along the way. Could you sit through that?` : 'A calm entry point.',
  }
}
export { TYPE_NAMES }
