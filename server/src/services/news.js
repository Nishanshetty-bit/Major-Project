// Fake-but-realistic headlines generated from each asset's recent momentum (so news and charts agree… or sometimes don't).
import { mulberry32, hashStr, pick } from '../lib/rng.js'
import { retOver } from '../lib/stats.js'
import { analyze, aggregate } from './sentiment.js'

const SRC = ['MarketPulse', 'Dalal Daily', 'FinWire', 'The Rupee Post', 'BullBear Times']
const T = {
  stockPos: [
    '{n} posts record quarterly profit as demand stays strong', 'Analysts upgrade {n} after revenue beats estimates', '{n} wins major contract, expansion plans announced',
    'Brokerages turn bullish on {n} as margins improve', '{n} announces higher dividend after robust results',
  ],
  stockNeg: [
    '{n} shares fall as quarterly profit misses estimates', 'Analysts downgrade {n} citing weak growth and slowdown', '{n} faces probe over disclosure concerns',
    'Volatile session: {n} slumps as investors book profits', '{n} warns of pressure on margins, cuts guidance',
  ],
  fundPos: [
    '{n} sees strong inflows as investors back long-term growth', '{n} outperforms peers over three years', 'Steady SIP inflows boost {n}; portfolio stable',
    'Experts say {n} offers robust diversification', 'Low cost makes {n} a favourite among new investors',
  ],
  fundNeg: [
    '{n} sees outflows as investors turn cautious', '{n} slumps with the broader market selloff', 'Concerns over valuations weigh on {n}',
    'Analysts warn of volatility ahead for {n}', '{n} lags benchmark over the last year',
  ],
  neutral: ['{n} trades flat as markets await policy decision', 'What should investors do with {n} this quarter?', '{n} holds steady in a quiet session'],
  hypePos: ['{n} soars as retail frenzy lifts shares, record volumes', '{n} surges again – social media calls it "the next big thing"'],
  hypeNeg: [
    'Short-seller report alleges governance lapses at {n}', '{n} plunges as debt concerns spook investors', 'Regulator opens probe into {n} trading; bubble fears grow',
    'Experts warn {n} is overvalued: P/E over 100 while profits stay weak',
  ],
}
const ago = ['2 hours ago', '5 hours ago', 'Yesterday', '2 days ago', '4 days ago', '1 week ago']

export function newsFor(asset, end = 60) {
  const rng = mulberry32(hashStr(asset.id + ':' + end))
  const m3 = retOver(asset.prices, 3, end) ?? 0
  const m1 = retOver(asset.prices, 1, end) ?? 0
  const fund = asset.type !== 'stock'
  const mood = m3 * 0.6 + m1 * 0.4 // recent momentum drives tone
  const posBank = fund ? T.fundPos : T.stockPos
  const negBank = fund ? T.fundNeg : T.stockNeg
  const items = []
  const nPos = mood > 0.08 ? 3 : mood > 0 ? 2 : mood > -0.06 ? 1 : 0
  for (let i = 0; i < 4; i++) {
    let bank
    if (asset.speculative) bank = mood > 0.2 && i < 3 ? T.hypePos : T.hypeNeg
    else if (i < nPos) bank = posBank
    else if (i === 3 && rng() < 0.5) bank = T.neutral
    else bank = negBank
    const title = pick(rng, bank).replace('{n}', asset.name)
    items.push({ title, source: pick(rng, SRC) + ' (simulated)', when: ago[Math.min(i * 1 + Math.floor(rng() * 2), ago.length - 1)], sentiment: analyze(title) })
  }
  return { items, summary: aggregate(items) }
}
