// Tiny lexicon-based financial sentiment analyser (explainable: returns the words that drove the score).
import { clamp, round } from '../lib/stats.js'

const LEX = {
  record: 2, surge: 2.5, surges: 2.5, soar: 2.5, soars: 2.5, rally: 2, rallies: 2, strong: 1.8, growth: 1.5, profit: 1.6, profits: 1.6,
  beat: 1.8, beats: 1.8, upgrade: 2, upgrades: 2, gain: 1.4, gains: 1.4, inflows: 1.6, wins: 1.6, win: 1.6, expands: 1.3, expansion: 1.3,
  steady: 1, stable: 1, dividend: 1, outperform: 2, outperforms: 2, boost: 1.5, boosts: 1.5, optimism: 1.5, bullish: 2, robust: 1.7, demand: 0.8,
  low: 0.3, cheap: 1, recovery: 1.5, recovers: 1.5, rebounds: 1.6, rebound: 1.6, hype: 0.5, frenzy: 0.4,
  fall: -1.8, falls: -1.8, plunge: -2.8, plunges: -2.8, crash: -3, crashes: -3, slump: -2.2, slumps: -2.2, loss: -1.8, losses: -1.8, weak: -1.8,
  downgrade: -2.2, downgrades: -2.2, probe: -2.4, fraud: -3, allegations: -2.4, alleges: -2.4, lapses: -2.2, debt: -1.2, default: -3, miss: -1.8,
  misses: -1.8, outflows: -1.6, selloff: -2.4, bearish: -2, concerns: -1.4, warning: -1.8, warns: -1.8, cuts: -1.3, cut: -1.3, delay: -1.2, delays: -1.2,
  resigns: -2.2, resignation: -2.2, volatile: -1, volatility: -1, bubble: -2.4, overvalued: -2, expensive: -1.2, pressure: -1.2, slowdown: -1.7, lawsuit: -2,
}
const NEG = new Set(['not', 'no', 'never', 'fails', 'fail', 'without', 'denies', 'denied'])
const BOOST = new Set(['sharply', 'massive', 'huge', 'heavily', 'steeply', 'major'])

export function analyze(text) {
  const words = String(text).toLowerCase().replace(/[^a-z0-9%\s-]/g, ' ').split(/\s+/).filter(Boolean)
  let sum = 0
  const drivers = []
  words.forEach((w, i) => {
    const base = LEX[w]
    if (base === undefined) return
    let v = base
    if (BOOST.has(words[i - 1])) v *= 1.5
    if (NEG.has(words[i - 1]) || NEG.has(words[i - 2])) v *= -0.8
    sum += v
    drivers.push({ word: w, weight: round(v, 1) })
  })
  const score = round(Math.tanh(sum / 3), 2) // -1 … +1
  const label = score > 0.25 ? 'Positive' : score < -0.25 ? 'Negative' : 'Neutral'
  return { score, label, drivers }
}

/** Aggregate headlines, newest first weighted more. Returns -1…1 and 0…100 version. */
export function aggregate(items) {
  if (!items.length) return { score: 0, index: 50, label: 'Neutral' }
  let w = 0, s = 0
  items.forEach((n, i) => { const wt = 1 / (1 + i * 0.35); w += wt; s += wt * n.sentiment.score })
  const score = round(s / w, 2)
  return { score, index: Math.round(clamp((score + 1) * 50, 0, 100)), label: score > 0.25 ? 'Positive' : score < -0.25 ? 'Negative' : 'Neutral' }
}

/** Aggregate real FinBERT probabilities: recency decays over 7 days and each
 * publisher contributes at most twice, preventing syndicated headlines from
 * dominating the result. This is sentiment evidence, not a return forecast. */
export function aggregateProbabilities(items, now = Date.now()) {
  if (!items.length) return { score: 0, index: 50, label: 'Neutral', supportingArticles: 0, formula: 'No articles available' }
  const publisherCounts = new Map()
  let totalWeight = 0
  const latestArticleAt = items.map((item) => item.publishedAt).filter(Boolean).map((date) => new Date(date)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => b - a)[0]
  const sum = { negative: 0, neutral: 0, positive: 0 }
  for (const item of items) {
    const publisher = item.publisher || 'unknown'
    const count = publisherCounts.get(publisher) || 0
    if (count >= 2) continue
    publisherCounts.set(publisher, count + 1)
    const ageDays = item.publishedAt ? Math.max(0, (now - new Date(item.publishedAt).getTime()) / 86400000) : 7
    const weight = Math.exp(-ageDays / 7)
    totalWeight += weight
    sum.negative += weight * (item.sentiment?.negativeProbability || 0)
    sum.neutral += weight * (item.sentiment?.neutralProbability || 0)
    sum.positive += weight * (item.sentiment?.positiveProbability || 0)
  }
  if (!totalWeight) return { score: 0, index: 50, label: 'Neutral', supportingArticles: 0, formula: 'All articles were excluded by duplicate-source limits' }
  const probabilities = Object.fromEntries(Object.entries(sum).map(([key, value]) => [`${key}Probability`, value / totalWeight]))
  const score = round(probabilities.positiveProbability - probabilities.negativeProbability, 3)
  return { ...probabilities, score, index: Math.round(clamp((score + 1) * 50, 0, 100)), label: score > 0.25 ? 'Positive' : score < -0.25 ? 'Negative' : 'Neutral', supportingArticles: Array.from(publisherCounts.values()).reduce((a, b) => a + b, 0), latestArticleAt: latestArticleAt?.toISOString() || null, formula: 'publisher-capped, 7-day exponential recency-weighted FinBERT probabilities' }
}
