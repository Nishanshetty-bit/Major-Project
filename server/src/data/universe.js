// ─────────────────────────────────────────────────────────────────────────────
//  SIMULATED MARKET UNIVERSE  (all data is fake, generated from a fixed seed)
//  61 monthly points: t=0 → Oct 2021 … t=60 → Oct 2026.
//  Return of asset = alpha + beta·market + sectorBeta·sector + goldBeta·gold + noise
//  plus hand-designed events so students can demo crashes & hype bubbles.
// ─────────────────────────────────────────────────────────────────────────────
import { mulberry32, hashStr, gauss } from '../lib/rng.js'
import { round } from '../lib/stats.js'

export const TODAY = 60
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (t) => {
  const d = new Date(Date.UTC(2021, 9 + t, 1))
  return `${MON[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`
}
export const monthLong = (t) => {
  const d = new Date(Date.UTC(2021, 9 + t, 1))
  return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
export const MONTHS = Array.from({ length: TODAY + 1 }, (_, t) => monthLabel(t))

/** Market-wide events. Month indexes are *return* months (t = month in which the move happens). */
export const EVENTS = [
  { id: 'crash', from: 14, to: 16, title: 'The Great Simulated Crash', emoji: '📉', text: 'Markets fall ~26% in three months. Panic selling everywhere.' },
  { id: 'recovery', from: 17, to: 22, title: 'The Recovery', emoji: '🌱', text: 'Everything bounces back within six months. Those who stayed invested were rewarded.' },
  { id: 'hype', from: 30, to: 32, title: 'HypeGreen Mania', emoji: '🚀', text: 'A single stock rockets +80% in 3 months as social media goes wild.' },
  { id: 'bubble', from: 33, to: 35, title: 'HypeGreen Bubble Bursts', emoji: '💥', text: 'The hyped stock loses 60% in 3 months. Late buyers are wiped out.' },
  { id: 'dip', from: 44, to: 45, title: 'Mini Correction', emoji: '🌊', text: 'A short, sharp dip of ~7% that fully heals within months.' },
]
export const eventRanges = EVENTS.map((e) => ({ ...e, fromLabel: monthLabel(e.from), toLabel: monthLabel(e.to) }))

const N = TODAY
const mk = (seed, vol, mu = 0) => { const r = mulberry32(seed); return Array.from({ length: N + 1 }, (_, t) => (t === 0 ? 0 : mu + vol * gauss(r))) }

// Market factor
const market = mk(20211, 0.03, 0.0032)
;[[14, -0.09], [15, -0.12], [16, -0.07], [17, 0.05], [18, 0.06], [19, 0.04], [20, 0.04], [21, 0.03], [22, 0.03], [44, -0.04], [45, -0.03]].forEach(([t, v]) => (market[t] = v))
for (let t = 49; t <= N; t++) market[t] -= 0.008 // cooler last year so projections stay sensible
// Sector factors
const SECTORS = ['IT', 'Bank', 'Energy', 'Pharma', 'Auto']
const sectorF = Object.fromEntries(SECTORS.map((s, i) => [s, mk(777 + i * 13, 0.022, 0)]))
// Gold: safe haven, rises when stocks crash
const gold = mk(31337, 0.02, 0.004)
;[[14, 0.04], [15, 0.05], [16, 0.02]].forEach(([t, v]) => (gold[t] = v))

/**  Asset specs. type: stock | mf | index | etf  */
const S = [
  // ── Individual stocks ──
  { id: 'infy', name: 'Infosys', symbol: 'INFY', type: 'stock', sector: 'IT', start: 1380, alpha: 0.0015, beta: 1.0, sb: 0.8, idio: 0.033, pe: 32, sectorPe: 24, roe: 24, revGrowth: 14, de: 0.1, div: 2.4, blurb: 'Large IT services company that builds software for global clients.' },
  { id: 'tcs', name: 'TCS', symbol: 'TCS', type: 'stock', sector: 'IT', start: 2950, alpha: 0.0015, beta: 0.9, sb: 0.8, idio: 0.024, pe: 30, sectorPe: 24, roe: 46, revGrowth: 9, de: 0.1, div: 3.1, blurb: 'India\'s biggest IT services firm – stable, cash-rich, pays regular dividends.' },
  { id: 'reliance', name: 'Reliance', symbol: 'RELIANCE', type: 'stock', sector: 'Energy', start: 2400, alpha: 0.0005, beta: 1.0, sb: 0.7, idio: 0.028, pe: 27, sectorPe: 22, roe: 9, revGrowth: 11, de: 0.4, div: 0.4, blurb: 'Conglomerate in oil, retail and telecom – a mini-economy in one stock.' },
  { id: 'hdfcbank', name: 'HDFC Bank', symbol: 'HDFCBANK', type: 'stock', sector: 'Bank', start: 1520, alpha: 0.0005, beta: 0.9, sb: 0.8, idio: 0.022, pe: 19, sectorPe: 18, roe: 16, revGrowth: 18, de: 0.9, div: 1.1, blurb: 'India\'s largest private bank – earns from loans and deposits.' },
  { id: 'icicibank', name: 'ICICI Bank', symbol: 'ICICIBANK', type: 'stock', sector: 'Bank', start: 780, alpha: 0.0015, beta: 1.05, sb: 0.8, idio: 0.028, pe: 18, sectorPe: 18, roe: 17, revGrowth: 20, de: 0.9, div: 0.8, blurb: 'Fast-growing private bank with a strong retail loan business.' },
  { id: 'sunpharma', name: 'Sun Pharma', symbol: 'SUNPHARMA', type: 'stock', sector: 'Pharma', start: 830, alpha: 0.002, beta: 0.6, sb: 0.7, idio: 0.028, pe: 34, sectorPe: 30, roe: 16, revGrowth: 10, de: 0.2, div: 0.7, blurb: 'Pharma maker – medicines are needed in good and bad markets.' },
  { id: 'tatamotors', name: 'Tata Motors', symbol: 'TATAMOTORS', type: 'stock', sector: 'Auto', start: 480, alpha: 0.0015, beta: 1.3, sb: 0.8, idio: 0.048, pe: 14, sectorPe: 25, roe: 22, revGrowth: 16, de: 1.2, div: 0.3, blurb: 'Car and EV maker – big upside in good times, big swings in bad times.' },
  { id: 'hypegreen', name: 'HypeGreen Energy', symbol: 'HYPEGRN', type: 'stock', sector: 'Energy', start: 410, alpha: -0.003, beta: 1.6, sb: 0.5, idio: 0.06, pe: 118, sectorPe: 22, roe: 6, revGrowth: 45, de: 2.4, div: 0, speculative: true, blurb: 'Fictional "hot" green-energy stock. Huge story, huge debt, huge risk.' },
  // ── Mutual funds ──
  { id: 'ppfas', name: 'Parag Parikh Flexi Cap', symbol: 'PPFCF', type: 'mf', sector: 'Diversified', start: 52, alpha: 0.003, beta: 0.8, idio: 0.011, expense: 0.63, aum: 68000, holdings: 28, manager: 'Active manager', blurb: 'Manager mixes Indian + global shares. Known for patient, value style.' },
  { id: 'quantsmall', name: 'Quant Small Cap Fund', symbol: 'QSCF', type: 'mf', sector: 'Small Cap', start: 110, alpha: 0.0035, beta: 1.35, idio: 0.02, expense: 0.64, aum: 22000, holdings: 60, manager: 'Active manager', blurb: 'Invests in small companies. Can grow fast, but falls hard in crashes.' },
  { id: 'sbibluechip', name: 'SBI Bluechip Fund', symbol: 'SBIBC', type: 'mf', sector: 'Large Cap', start: 61, alpha: 0.0015, beta: 0.9, idio: 0.01, expense: 0.85, aum: 51000, holdings: 45, manager: 'Active manager', blurb: 'Invests in the biggest, most trusted Indian companies.' },
  { id: 'hdfcbal', name: 'HDFC Balanced Advantage', symbol: 'HDFCBAF', type: 'mf', sector: 'Hybrid', start: 340, alpha: 0.002, beta: 0.5, idio: 0.007, expense: 0.78, aum: 90000, holdings: 70, manager: 'Active manager', blurb: 'Shifts between shares and bonds automatically – a cushioned ride.' },
  // ── Index funds ──
  { id: 'nifty50idx', name: 'Nippon Nifty 50 Index Fund', symbol: 'NN50IDX', type: 'index', sector: 'Large Cap', start: 36, alpha: 0, beta: 1.0, idio: 0.004, expense: 0.2, aum: 31000, holdings: 50, manager: 'Tracks Nifty 50', trackingError: 0.08, blurb: 'Copies the 50 biggest Indian companies. No manager, very low cost.' },
  { id: 'niftynext', name: 'UTI Nifty Next 50 Index Fund', symbol: 'UTINN50', type: 'index', sector: 'Large Cap', start: 28, alpha: 0.002, beta: 1.12, idio: 0.006, expense: 0.3, aum: 9000, holdings: 50, manager: 'Tracks Nifty Next 50', trackingError: 0.12, blurb: 'Copies the "next 50" – tomorrow\'s large companies.' },
  { id: 'midcap150', name: 'Nifty Midcap 150 Index Fund', symbol: 'NM150IDX', type: 'index', sector: 'Mid Cap', start: 19, alpha: 0.0025, beta: 1.25, idio: 0.008, expense: 0.25, aum: 12000, holdings: 150, manager: 'Tracks Nifty Midcap 150', trackingError: 0.15, blurb: 'Copies 150 mid-sized companies. More growth, more bumps.' },
  // ── ETFs ──
  { id: 'niftybees', name: 'Nifty BeES', symbol: 'NIFTYBEES', type: 'etf', sector: 'Large Cap', start: 190, alpha: 0, beta: 1.0, idio: 0.003, expense: 0.04, aum: 28000, holdings: 50, manager: 'Tracks Nifty 50', blurb: 'Nifty 50 that you buy and sell on the exchange like a share.' },
  { id: 'goldbees', name: 'Gold BeES', symbol: 'GOLDBEES', type: 'etf', sector: 'Gold', start: 42, alpha: 0.0, beta: -0.05, gb: 1, idio: 0.004, expense: 0.55, aum: 14000, holdings: 1, manager: 'Tracks gold price', blurb: 'Digital gold. Tends to rise when shares fall – a crash cushion.' },
  { id: 'bankbees', name: 'Bank BeES', symbol: 'BANKBEES', type: 'etf', sector: 'Bank', start: 395, alpha: 0.0005, beta: 1.0, sb: 0.5, sbSector: 'Bank', idio: 0.006, expense: 0.19, aum: 4800, holdings: 12, manager: 'Tracks Nifty Bank', blurb: 'A basket of the biggest banks, tradable as one unit.' },
  { id: 'liquidbees', name: 'Liquid BeES', symbol: 'LIQUIDBEES', type: 'etf', sector: 'Debt', start: 1000, alpha: 0.0055, beta: 0, idio: 0.0004, expense: 0.2, aum: 7200, holdings: 1, manager: 'Short-term debt', blurb: 'Parks cash in ultra-short loans. Boring, steady, almost never falls.' },
]

function build(spec) {
  const r = mulberry32(hashStr(spec.id))
  const p = [spec.start]
  const sectorSeries = sectorF[spec.sbSector || spec.sector]
  for (let t = 1; t <= N; t++) {
    let ret = spec.alpha + spec.beta * market[t] + (spec.sb && sectorSeries ? spec.sb * sectorSeries[t] : 0) + (spec.gb ? gold[t] : 0) + spec.idio * gauss(r)
    if (spec.id === 'hypegreen') {
      const spike = { 30: 0.3, 31: 0.28, 32: 0.2, 33: -0.3, 34: -0.3, 35: -0.25 }
      if (spike[t] !== undefined) ret = spike[t] + 0.02 * gauss(r)
      else if (t > 35) ret = -0.016 + 0.05 * gauss(r) + 0.5 * market[t]
    }
    if (spec.id === 'liquidbees') ret = 0.0055 + 0.0004 * gauss(r)
    ret = Math.max(-0.6, ret)
    p.push(p[t - 1] * (1 + ret))
  }
  return { ...spec, prices: p.map((x) => round(x, 2)) }
}

export const ASSETS = S.map(build)
export const ASSET_MAP = Object.fromEntries(ASSETS.map((a) => [a.id, a]))
export const TYPES = ['stock', 'mf', 'index', 'etf']
export const TYPE_NAMES = { stock: 'Individual Stocks', mf: 'Mutual Funds', index: 'Index Funds', etf: 'ETFs' }
export const MARKET_PATH = (() => { const p = [100]; for (let t = 1; t <= N; t++) p.push(p[t - 1] * (1 + market[t])); return p.map((x) => round(x, 2)) })()
