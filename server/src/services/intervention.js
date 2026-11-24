// Pre-decision intervention engine: correlates the user's behaviour fingerprint with historical market patterns
// to estimate "regret probability" BEFORE a trade, then delivers an explainable nudge.
import { ASSETS, ASSET_MAP, TODAY, monthLong } from '../data/universe.js'
import { scoreAsset } from './scoring.js'
import { retOver, rsi, std, monthlyReturns, percentile, clamp, round, mean } from '../lib/stats.js'
import { mulberry32, hashStr } from '../lib/rng.js'
import { newId, getProfile, saveCheck, getCheck, addJournal, getJournal } from './store.js'

const monthlyVol = Object.fromEntries(ASSETS.map((a) => [a.id, std(monthlyReturns(a.prices)) || 0.01]))
const ENTRIES = []
for (const a of ASSETS) for (let t = 6; t + 3 <= TODAY; t++) {
  const r3 = a.prices[t] / a.prices[t - 3] - 1
  ENTRIES.push({ id: a.id, t, z: r3 / (monthlyVol[a.id] * Math.sqrt(3)), f3: a.prices[t + 3] / a.prices[t] - 1, staged: (a.prices[t + 3] / a.prices[t] + a.prices[t + 3] / a.prices[t + 1] + a.prices[t + 3] / a.prices[t + 2]) / 3 - 1, wait1: a.prices[t + 3] / a.prices[t + 1] - 1 })
}
const EMOTION = { calm: { v: -10, label: 'Calm & planned' }, excited: { v: 12, label: 'Excited' }, fearful: { v: 12, label: 'Scared' }, tip: { v: 15, label: 'Saw a hot tip' }, angry: { v: 18, label: 'Angry / want revenge' }, bored: { v: 6, label: 'Bored' } }
export const EMOTIONS = Object.entries(EMOTION).map(([id, e]) => ({ id, label: e.label }))
const DEFAULT_SCORES = { lossAversion: 50, herd: 50, overconfidence: 50, greed: 50, anchoring: 50, recency: 50, impulsivity: 50, disposition: 50 }

// Pattern library: every (asset, month) in the simulated history, described by how extreme its last-3-month move was.
// For educational replays we use the whole library (so the lesson of a crash can be learned from other crashes).
function analogs(z0, speculative = false) {
  if (speculative) {
    const spec = ENTRIES.filter((e) => ASSET_MAP[e.id].speculative && (Math.abs(z0) >= 1.5 ? (z0 > 0 ? e.z >= 1.5 : e.z <= -1.5) : Math.abs(e.z - z0) <= 1))
    if (spec.length >= 3) return spec
  }
  const pool = ENTRIES
  if (Math.abs(z0) >= 1.5) {
    const ext = pool.filter((e) => (z0 > 0 ? e.z >= 1.5 : e.z <= -1.5))
    if (ext.length >= 15) return ext
  }
  let band = 0.6, sel = []
  while (band <= 2.4) { sel = pool.filter((e) => Math.abs(e.z - z0) <= band); if (sel.length >= 25) break; band += 0.4 }
  return sel.length < 10 ? pool : sel
}
const stat = (arr) => ({ median: round(percentile(arr, 0.5) * 100, 1), p10: round(percentile(arr, 0.1) * 100, 1), p90: round(percentile(arr, 0.9) * 100, 1) })

export function computeRegret({ assetId, action, amount, portfolioValue, emotion, profile, asOf = TODAY }) {
  const a = ASSET_MAP[assetId]
  const p = a.prices
  const r3 = retOver(p, 3, asOf) ?? 0
  const r1 = retOver(p, 1, asOf) ?? 0
  const z0 = r3 / (monthlyVol[a.id] * Math.sqrt(3))
  const sc = scoreAsset(a, asOf)
  const rs = rsi(p, asOf)
  const sel = analogs(z0, !!a.speculative)
  const f3 = sel.map((e) => e.f3)
  const pNeg = f3.filter((x) => x < 0).length / f3.length
  const pPos = 1 - pNeg
  const S = { ...DEFAULT_SCORES, ...(profile?.scores || {}) }
  const hot = z0 > 0.8, falling = z0 < -0.8
  const buy = action === 'BUY'

  // 1) behaviour
  let relevant
  if (buy) relevant = hot ? ['herd', 'greed', 'impulsivity', 'overconfidence'] : ['anchoring', 'recency', 'overconfidence']
  else relevant = falling ? ['lossAversion', 'impulsivity', 'recency'] : ['disposition', 'impulsivity']
  const behaviourBase = mean(relevant.map((k) => S[k]))
  const emo = EMOTION[emotion] || EMOTION.calm
  const behaviour = clamp(behaviourBase + emo.v, 0, 100)

  // 2) historical pattern
  const history = buy ? clamp(0.6 * pNeg * 100 + 0.4 * clamp(-percentile(f3, 0.1) * 100 * 2.2, 0, 100), 0, 100) : clamp(0.6 * pPos * 100 + 0.4 * clamp(percentile(f3, 0.5) * 100 * 3, 0, 100), 0, 100)

  // 3) valuation & technicals
  let valuation
  if (buy) {
    valuation = (100 - sc.confidence) * 0.6 + (rs > 70 ? (rs - 70) * 2 : 0)
    if (a.type === 'stock' && a.pe / a.sectorPe > 1.3) valuation += Math.min(30, (a.pe / a.sectorPe - 1.3) * 30)
  } else valuation = sc.confidence * 0.6 + (rs < 35 ? (35 - rs) * 1.5 : 0)
  valuation = clamp(valuation, 0, 100)

  // 4) context: position size, sentiment conflict, speculation
  const share = amount / Math.max(portfolioValue, amount)
  let context = clamp(share * 100 * 1.6, 0, 100) * 0.6
  if (buy && sc.sentiment < 40) context += 25
  if (!buy && sc.sentiment > 65) context += 20
  if (a.speculative && buy) context += 25
  context = clamp(context, 0, 100)

  const comps = { behaviour: round(behaviour, 0), history: round(history, 0), valuation: round(valuation, 0), context: round(context, 0) }
  const weights = { behaviour: 0.35, history: 0.3, valuation: 0.2, context: 0.15 }
  const total = Object.keys(weights).reduce((s, k) => s + comps[k] * weights[k], 0)
  const regret = Math.round(clamp(total, 3, 97))
  return { regret, level: regret >= 55 ? 'High' : regret >= 35 ? 'Medium' : 'Low', comps, weights, sel, f3, pNeg, pPos, z0, r3, r1, rs, sc, S, relevant, hot, falling, share, asset: a, asOf, profileUsed: !!profile }
}

export function check(input) {
  const profile = input.profileId ? getProfile(input.profileId) : null
  const asOf = input.asOf ?? TODAY
  const R = computeRegret({ ...input, profile, asOf })
  const { asset: a, sel, f3, sc } = R
  const buy = input.action === 'BUY'
  const amount = input.amount
  const v = (x) => Math.round(amount * x)

  // Ghost comparison: three ways to act, valued 3 months later across all analog situations
  const dist = (fn) => { const arr = sel.map(fn); return { median: v(percentile(arr, 0.5)), p10: v(percentile(arr, 0.1)), p90: v(percentile(arr, 0.9)) } }
  const ghost = buy
    ? [{ id: 'now', label: 'Buy it all now', you: true, ...dist((e) => 1 + e.f3) }, { id: 'staged', label: 'Buy in 3 monthly slices', plan: true, ...dist((e) => 1 + e.staged) }, { id: 'wait', label: 'Wait 1 month, then buy', ...dist((e) => 1 + e.wait1) }]
    : [{ id: 'sell', label: 'Sell all now', you: true, median: amount, p10: amount, p90: amount }, { id: 'half', label: 'Sell half, review in 1 month', plan: true, ...dist((e) => 0.5 + 0.5 * (1 + e.f3)) }, { id: 'hold', label: 'Hold', ...dist((e) => 1 + e.f3) }]

  const hotTxt = R.hot ? `it already jumped ${Math.round(R.r3 * 100)}% in 3 months` : R.falling ? `it already fell ${Math.abs(Math.round(R.r3 * 100))}% in 3 months` : `its 3-month move is ${Math.round(R.r3 * 100)}%`
  const stats = stat(f3)
  const risks = []
  if (buy) {
    risks.push(`${Math.round(R.pNeg * 100)}% of ${sel.length} similar past situations were lower 3 months later (typical ${stats.median}%, bad case ${stats.p10}%).`)
    if (R.rs > 70) risks.push(`RSI ${Math.round(R.rs)}: the price has risen fast – "overheated" territory.`)
    if (a.type === 'stock' && a.pe / a.sectorPe > 1.3) risks.push(`P/E ${a.pe} vs sector ${a.sectorPe}: you would pay a premium.`)
    if (sc.sentiment < 40) risks.push(`News tone is negative (${sc.sentiment}/100).`)
    if (a.speculative) risks.push('This is a speculative stock with heavy debt – the same type that crashed in the simulated bubble.')
  } else {
    risks.push(`${Math.round(R.pPos * 100)}% of ${sel.length} similar past situations were HIGHER 3 months later (typical ${stats.median}%).`)
    if (R.rs < 35) risks.push(`RSI ${Math.round(R.rs)}: already heavily sold – rebounds are common here.`)
    if (sc.confidence >= 60) risks.push(`Confidence score is still ${sc.confidence}/100 (${sc.verdict.toLowerCase()}), so fundamentals do not justify panic.`)
  }
  if (R.share > 0.3) risks.push(`This trade is ${Math.round(R.share * 100)}% of your portfolio – a large single bet.`)
  const topBias = R.relevant.map((k) => ({ k, v: R.S[k] })).sort((x, y) => y.v - x.v)[0]
  const biasName = { lossAversion: 'loss aversion', herd: 'herd behaviour', overconfidence: 'overconfidence', greed: 'greed', anchoring: 'anchoring', recency: 'recency bias', impulsivity: 'impulsivity', disposition: 'disposition effect' }[topBias.k]
  const personal = R.profileUsed
    ? `Your fingerprint shows ${biasName} at ${topBias.v}%, which is exactly the bias this situation triggers.`
    : 'You have not taken the behaviour test yet, so we assumed average bias levels. Take the test for a personalised warning.'

  const suggestedAmount = R.level === 'High' ? Math.max(500, Math.round((amount * 0.3) / 500) * 500) : R.level === 'Medium' ? Math.max(500, Math.round((amount * 0.6) / 500) * 500) : amount
  const modified = suggestedAmount === amount ? null : computeRegret({ ...input, amount: suggestedAmount, profile, asOf })
  const cooling = R.level === 'High' ? 12 : R.level === 'Medium' ? 6 : 0

  const result = {
    id: newId('chk'), input: { ...input, asOf }, asOfLabel: monthLong(asOf), regret: R.regret, level: R.level, breakdown: Object.keys(R.comps).map((k) => ({ key: k, label: { behaviour: 'Your behaviour', history: 'Historical pattern', valuation: 'Price & valuation', context: 'Trade size & context' }[k], score: R.comps[k], weight: Math.round(R.weights[k] * 100), contribution: round(R.comps[k] * R.weights[k], 1) })),
    asset: { id: a.id, name: a.name, type: a.type, price: a.prices[asOf], confidence: sc.confidence, verdict: sc.verdict, rsi: Math.round(R.rs), change3M: round(R.r3 * 100, 1), change1M: round(R.r1 * 100, 1), pe: a.pe ?? null, sectorPe: a.sectorPe ?? null, sentiment: sc.sentiment },
    analog: { n: sel.length, pNegative: Math.round(R.pNeg * 100), ...stats, histogram: histogram(f3) },
    nudge: {
      title: R.level === 'Low' ? 'Looks reasonable – one last check' : `Heads up: ${R.level} regret probability (${R.regret}%)`,
      summary: `You want to ${buy ? 'buy' : 'sell'} ₹${amount.toLocaleString('en-IN')} of ${a.name} and ${hotTxt}. ${personal}`,
      emotion: EMOTION[input.emotion]?.label || 'Calm & planned', risks, ghost, cooling,
      options: [{ id: 'review', label: 'Review again', hint: 'Pause and look at the evidence' }, ...(modified ? [{ id: 'modify', label: `Modify to ₹${suggestedAmount.toLocaleString('en-IN')}`, hint: `Regret drops to ~${modified.regret}%` }] : []), { id: 'proceed', label: 'Proceed anyway', hint: 'I understand the risk' }],
      suggestedAmount, modifiedRegret: modified ? modified.regret : null,
    },
    profileUsed: R.profileUsed,
  }
  saveCheck(result)
  return result
}

function histogram(arr) {
  const edges = [-1, -0.3, -0.15, -0.05, 0.05, 0.15, 0.3, 10]
  const labels = ['< −30%', '−30 to −15', '−15 to −5', '−5 to +5', '+5 to +15', '+15 to +30', '> +30%']
  return labels.map((label, i) => ({ label, pct: Math.round((100 * arr.filter((x) => x >= edges[i] && x < edges[i + 1]).length) / arr.length), negative: i < 3 }))
}

export function outcome({ checkId, decision, amount }) {
  const c = getCheck(checkId)
  if (!c) return null
  const { assetId, action, asOf } = c.input
  const a = ASSET_MAP[assetId]
  const buy = action === 'BUY'
  const real = asOf + 3 <= TODAY
  let f
  if (real) f = a.prices[asOf + 3] / a.prices[asOf] - 1
  else {
    const R = computeRegret({ ...c.input, profile: c.input.profileId ? getProfile(c.input.profileId) : null })
    f = percentile(R.f3, mulberry32(hashStr(checkId))())
  }
  const amt = decision === 'modify' ? c.nudge.suggestedAmount : c.input.amount
  const pct = round(f * 100, 1)
  let pnl = 0, headline, detail, warningRight
  if (buy) {
    if (decision === 'proceed' || decision === 'modify') { pnl = Math.round(amt * f); headline = pnl < 0 ? `Result: −₹${Math.abs(pnl).toLocaleString('en-IN')} (${pct}%)` : `Result: +₹${pnl.toLocaleString('en-IN')} (+${pct}%)`; detail = decision === 'modify' ? `By buying a smaller amount you exposed only ₹${amt.toLocaleString('en-IN')}.` : 'You went ahead with the full amount.' }
    else { pnl = 0; const miss = Math.round(c.input.amount * f); headline = f < 0 ? `You avoided a loss of ₹${Math.abs(miss).toLocaleString('en-IN')}` : `You missed a gain of ₹${miss.toLocaleString('en-IN')}`; detail = f < 0 ? 'Pausing protected your money.' : 'This time the market rose. A nudge is a probability, not a prophecy – the point is making decisions with open eyes.' }
    warningRight = f < 0
  } else {
    const hold = Math.round(c.input.amount * f)
    if (decision === 'proceed') { pnl = -hold; headline = f > 0 ? `Selling cost you ₹${hold.toLocaleString('en-IN')} of rebound` : `Selling saved you ₹${Math.abs(hold).toLocaleString('en-IN')}`; detail = f > 0 ? 'Prices recovered after you sold.' : 'The price kept falling, so selling was the right call this time.' }
    else if (decision === 'modify') { pnl = -Math.round(hold * (amt / c.input.amount)); headline = f > 0 ? `Selling less kept ₹${Math.round(hold * (1 - amt / c.input.amount)).toLocaleString('en-IN')} of the rebound` : 'You sold part – a balanced choice'; detail = 'A partial sale limits regret in both directions.' }
    else { pnl = 0; headline = f > 0 ? `Holding earned ₹${hold.toLocaleString('en-IN')} as prices recovered` : `Holding lost ₹${Math.abs(hold).toLocaleString('en-IN')}`; detail = f > 0 ? 'Patience paid off.' : 'This time selling would have helped; that is the risk of any decision.' }
    warningRight = f > 0
  }
  const out = { checkId, decision, real, windowLabel: real ? `${monthLong(asOf)} → ${monthLong(asOf + 3)} (what actually happened)` : 'Next 3 months (simulated from similar past cases)', forwardPct: pct, pnl, headline, detail, warningWasRight: warningRight, path: real ? [0, 1, 2, 3].map((k) => round((a.prices[asOf + k] / a.prices[asOf] - 1) * 100, 1)) : [0, round(pct / 3, 1), round((pct * 2) / 3, 1), pct] }
  if (c.input.profileId) addJournal(c.input.profileId, { id: newId('j'), at: new Date().toISOString(), asset: a.name, action, amount: c.input.amount, regret: c.regret, level: c.level, decision, pnl, forwardPct: pct, warningWasRight: warningRight, saved: (decision !== 'proceed') && warningRight ? Math.abs(Math.round(c.input.amount * f)) : 0, missed: (decision !== 'proceed') && !warningRight ? Math.abs(Math.round(c.input.amount * f)) : 0 })
  return out
}

export function journalStats(profileId) {
  const j = getJournal(profileId)
  const heeded = j.filter((e) => e.decision !== 'proceed' && e.level !== 'Low')
  const shown = j.filter((e) => e.level !== 'Low')
  const right = shown.filter((e) => e.warningWasRight)
  return { entries: j, nudges: shown.length, heededPct: shown.length ? Math.round((100 * heeded.length) / shown.length) : 0, saved: j.reduce((s, e) => s + e.saved, 0), missed: j.reduce((s, e) => s + e.missed, 0), accuracyPct: shown.length ? Math.round((100 * right.length) / shown.length) : null }
}

export const PRESETS = [
  { id: 'fomo', emoji: '🚀', title: 'FOMO at the peak', text: 'HypeGreen has rocketed 80%+. Everyone is buying.', assetId: 'hypegreen', action: 'BUY', asOf: 32, amount: 25000, emotion: 'tip', portfolioValue: 60000 },
  { id: 'panic', emoji: '😱', title: 'Panic in the crash', text: 'The market is down 25%. You want out of your small-cap fund.', assetId: 'quantsmall', action: 'SELL', asOf: 16, amount: 30000, emotion: 'fearful', portfolioValue: 60000 },
  { id: 'sip', emoji: '📈', title: 'Calm monthly buy', text: 'A planned purchase of the Nifty 50 index fund.', assetId: 'nifty50idx', action: 'BUY', asOf: 48, amount: 5000, emotion: 'calm', portfolioValue: 100000 },
  { id: 'today', emoji: '🗓️', title: 'A decision today', text: 'Try any asset with today\'s simulated prices.', assetId: 'tcs', action: 'BUY', asOf: 60, amount: 20000, emotion: 'excited', portfolioValue: 80000 },
].map((p) => ({ ...p, asOfLabel: monthLong(p.asOf) }))
