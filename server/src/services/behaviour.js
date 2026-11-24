import { SCENARIOS, TYPE_ASSET, BIASES } from '../data/scenarios.js'
import { clamp, round, mean } from '../lib/stats.js'
import { newId, saveProfile } from './store.js'

const NO_SCALE = new Set([4, 6])
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN')
const STAKE = 50000

export function buildScenarios(type = 'stock', mode = 'pressure') {
  const T = TYPE_ASSET[type] || TYPE_ASSET.stock
  return SCENARIOS.map((s) => {
    const m = NO_SCALE.has(s.id) ? 1 : T.mag
    const sc = (v) => round(100 + (v - 100) * m, 1)
    const up = Math.max(s.up ? 2 : 0, Math.round((s.up || 0) * m))
    const dn = s.dn ? Math.max(3, Math.round(s.dn * m)) : 0
    const disc = Math.max(8, Math.round(23 * m))
    const p0 = type === 'index' || type === 'mf' ? T.price : Math.round(T.price)
    const vars = {
      a: T.name, alt: T.alt, p0, up, dn, disc, old: Math.round(p0 / (1 - disc / 100)), crowd: T.crowd, crowdPct: s.crowdPct || 0, one: Math.max(2, Math.round((s.one || 0) * 1)),
    }
    const f = (str) => str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`))
    const best = s.options.reduce((b, o) => (o.q > b.q ? o : b), s.options[0])
    return {
      id: s.id, title: s.title, bias: s.bias, biasLabel: BIASES[s.bias], emoji: s.emoji, assetName: T.name,
      seconds: mode === 'calm' ? 0 : s.seconds, story: f(s.story), question: s.question, crowdPct: s.crowdPct || null,
      alerts: s.alerts.map((a) => ({ ...a, title: f(a.title), body: f(a.body) })), chat: s.chat.map((c) => ({ ...c, text: f(c.text) })),
      chart: { from: sc(s.from), to: sc(s.to), after: s.after.map(sc), startPrice: p0 },
      options: s.options.map((o) => ({ id: o.id, label: f(o.label), sub: f(o.sub), outcome: f(o.text), pnl: Math.round(STAKE * o.pnl * (NO_SCALE.has(s.id) ? 1 : m) / 50) * 50, best: o.id === best.id })),
      bestId: best.id, lesson: s.lesson,
    }
  })
}

const LIB = {
  lossAversion: { name: 'The Nervous Protector', emoji: '🛡️', text: 'You hate seeing red. You tend to sell in a crash or refuse to accept a small loss.', tips: ['Write a "crash plan" now: "If the market falls 20%, I will do nothing for 30 days."', 'Check your portfolio less often – once a week is plenty.', 'Prefer index funds and gold ETFs; they fall less and recover predictably.'], mix: { index: 40, etf: 30, mf: 20, stock: 10 }, risk: 'low' },
  herd: { name: 'The Crowd Follower', emoji: '🐑', text: 'When everyone is excited, so are you. Hot tips and trending stocks pull you in.', tips: ['Use a 48-hour rule: wait two days before buying anything you saw on social media.', 'Ask "who profits if I buy this?" before acting on any tip.', 'Automate monthly SIPs so your investing does not depend on today\'s buzz.'], mix: { index: 45, etf: 25, mf: 25, stock: 5 }, risk: 'low' },
  overconfidence: { name: 'The Bold Gambler', emoji: '🎲', text: 'You back your own judgement strongly – sometimes more than the evidence supports.', tips: ['Cap any single stock at 10% of your portfolio.', 'Keep a decision journal: write why you bought and check it after 3 months.', 'Run your idea through the confidence score before buying.'], mix: { index: 40, etf: 20, mf: 25, stock: 15 }, risk: 'medium' },
  greed: { name: 'The Quick-Profit Hunter', emoji: '🏹', text: 'You want more, faster. You hold winners too long or chase big payoffs.', tips: ['Set a profit target and a partial-exit plan BEFORE buying.', 'Sell in slices – half at your target, the rest with a trailing stop.', 'Remember: nobody ever went broke taking a planned profit.'], mix: { index: 40, etf: 25, mf: 25, stock: 10 }, risk: 'medium' },
  anchoring: { name: 'The Price Anchor', emoji: '⚓', text: 'Old prices stick in your mind and make today\'s price look cheap or expensive.', tips: ['Ignore "52-week high" when judging value; look at earnings and P/E.', 'Compare against the sector average, not against yesterday.', 'Choose index funds – there is no single price to anchor on.'], mix: { index: 40, etf: 30, mf: 20, stock: 10 }, risk: 'medium' },
  recency: { name: 'The Trend Chaser', emoji: '📈', text: 'Recent events weigh too heavily. After a good month you feel invincible, after a bad one, doomed.', tips: ['Look at 5-year charts before deciding anything.', 'Keep investing on a fixed monthly date, regardless of the news.', 'Never stop an SIP because of a few bad months.'], mix: { index: 40, etf: 20, mf: 30, stock: 10 }, risk: 'medium' },
  impulsivity: { name: 'The Reactor', emoji: '⚡', text: 'You act first and think second, especially when alerts and headlines hit.', tips: ['Turn off price alerts for everything except your stop-loss.', 'Add a 10-minute "cooling-off" rule before any trade.', 'Verify any shock news on the official exchange website first.'], mix: { index: 45, etf: 30, mf: 20, stock: 5 }, risk: 'low' },
  disposition: { name: 'The Early Exiter', emoji: '🚪', text: 'You sell winners quickly to feel good and hold losers hoping they bounce.', tips: ['Judge each holding as if you were buying it today – would you?', 'Use a trailing stop on winners and a fixed stop on losers.', 'Review losers and winners with the same rules.'], mix: { index: 35, etf: 25, mf: 25, stock: 15 }, risk: 'medium' },
  steady: { name: 'The Steady Compounder', emoji: '🧘', text: 'Calm under pressure. You follow a plan, verify before you act and let time do the work.', tips: ['Keep your rules written down so they survive stressful days.', 'Consider slowly increasing your SIP each year.', 'Teach a friend – explaining rules strengthens them.'], mix: { index: 30, etf: 20, mf: 25, stock: 25 }, risk: 'high' },
}
const MEANING = {
  lossAversion: 'How strongly the fear of losing money drives your choices.', herd: 'How much you copy the crowd, tips and trends.', overconfidence: 'How much you trust your own guess over evidence.',
  greed: 'How often you push for more after your plan is already met.', anchoring: 'How much an old price distorts your view of today\'s value.', recency: 'How much recent events overshadow the long-term picture.',
  impulsivity: 'How fast you react to alerts and news without checking.', disposition: 'Tendency to sell winners early and hold losers.',
}

export function analyze({ type = 'stock', mode = 'pressure', answers }) {
  const scs = buildScenarios(type, mode)
  const raw = Object.fromEntries(Object.keys(BIASES).map((k) => [k, 0]))
  const max = Object.fromEntries(Object.keys(BIASES).map((k) => [k, 0]))
  const review = []
  const qs = []
  let freezes = 0, fastWrong = 0
  const times = []
  const used = new Set()
  for (const ans of answers) {
    const base = SCENARIOS.find((s) => s.id === ans.scenarioId)
    if (!base || used.has(base.id)) continue
    used.add(base.id)
    for (const dim of Object.keys(BIASES)) max[dim] += Math.max(0, ...base.options.map((o) => o.fx[dim] || 0))
    max.impulsivity += 4
    const opt = base.options.find((o) => o.id === ans.optionId)
    const sc = scs.find((s) => s.id === base.id)
    const secs = (ans.timeMs || 0) / 1000
    let q
    if (ans.timedOut || !opt) { freezes++; q = 0.4 } else {
      q = opt.q
      for (const [dim, v] of Object.entries(opt.fx)) raw[dim] += v
      times.push(secs)
      if (q < 0.6 && mode !== 'calm' && base.seconds && secs < base.seconds * 0.25) { raw.impulsivity += 4; fastWrong++ }
    }
    qs.push(q)
    const chosen = sc.options.find((o) => o.id === ans.optionId)
    review.push({ scenarioId: base.id, title: base.title, emoji: base.emoji, bias: BIASES[base.bias], chosen: chosen ? chosen.label : 'No answer (froze)', chosenId: ans.optionId || null, bestLabel: sc.options.find((o) => o.best).label, quality: Math.round(q * 100), seconds: round(secs, 1), timedOut: !!ans.timedOut, pnl: chosen ? chosen.pnl : 0, bestPnl: sc.options.find((o) => o.best).pnl })
  }
  const scores = Object.fromEntries(Object.keys(BIASES).map((k) => [k, max[k] ? Math.round(clamp((raw[k] / max[k]) * 100, 0, 100)) : 0]))
  const biasList = Object.entries(scores).map(([k, v]) => ({ key: k, label: BIASES[k], score: v, level: v >= 50 ? 'High' : v >= 25 ? 'Moderate' : 'Low', meaning: MEANING[k] })).sort((a, b) => b.score - a.score)
  const top = biasList[0]
  const archetypeKey = top.score < 22 ? 'steady' : top.key
  const A = LIB[archetypeKey]
  const quality = Math.round(mean(qs) * 100)
  const avgBias = Math.round(mean(Object.values(scores)))
  const eligibility = Math.round(clamp(0.6 * quality + 0.4 * (100 - avgBias * 1.2), 0, 100))
  const level = eligibility >= 75 ? 'Ready to invest' : eligibility >= 55 ? 'Needs practice' : 'Learn first'
  const risk = scores.lossAversion >= 50 || avgBias >= 45 ? 'low' : avgBias < 22 ? 'high' : A.risk
  const profile = {
    id: newId('prof'), createdAt: new Date().toISOString(), assetType: type, mode, scores, biasList, archetype: { key: archetypeKey, name: A.name, emoji: A.emoji, text: A.text },
    decisionQuality: quality, averageBias: avgBias, eligibility, level, suggestedRisk: risk, suggestedMix: A.mix, tips: [...A.tips, ...(biasList[1].score >= 25 ? LIB[biasList[1].key].tips.slice(0, 1) : [])],
    freezes, fastWrong, avgResponseSec: round(mean(times) || 0, 1), review,
    totalPnl: review.reduce((a, r) => a + r.pnl, 0), bestPnl: review.reduce((a, r) => a + r.bestPnl, 0),
    historicalBasis: 'Simulated crash (Dec 22 – Feb 23), HypeGreen mania & bubble (Jun–Sep 24) in this project\'s fake market.',
  }
  saveProfile(profile)
  return profile
}
