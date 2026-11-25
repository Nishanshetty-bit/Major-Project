const cache = new Map()
const glyph = (...points) => String.fromCodePoint(...points)
const EMOJI_ICON = new Map([
  [glyph(0x1f3e2), 'building'], [glyph(0x1f9fa), 'basket'], [glyph(0x1fa9e), 'index'], [glyph(0x26a1), 'bolt'],
  [glyph(0x1f6e1, 0xfe0f), 'shield'], [glyph(0x2696, 0xfe0f), 'scale'], [glyph(0x1f680), 'chart'],
  [glyph(0x1f9e0), 'brain'], [glyph(0x1f4c8), 'chart'], [glyph(0x1f4c9), 'chart'], [glyph(0x1f5d3, 0xfe0f), 'calendar'],
  [glyph(0x1f4c5), 'calendar'], [glyph(0x1f4f1), 'phone'], [glyph(0x1f4de), 'phone'], [glyph(0x1f4ac), 'message'],
  [glyph(0x1f465), 'people'], [glyph(0x1f514), 'bell'], [glyph(0x1f4ca), 'chart'], [glyph(0x1f4f0), 'book'],
  [glyph(0x1f4dd), 'book'], [glyph(0x1f50d), 'search'], [glyph(0x1f3af), 'target'], [glyph(0x1f4a1), 'bulb'],
  [glyph(0x23f1, 0xfe0f), 'clock'], [glyph(0x23f0), 'clock'], [glyph(0x2705), 'check'], [glyph(0x26a0, 0xfe0f), 'warning'],
  [glyph(0x1f6a8), 'warning'], [glyph(0x1f9ec), 'index'], [glyph(0x1f631), 'warning'],
])
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u200D\uFE0F]/gu
function cleanResponse(value, key = '') {
  if (typeof value === 'string') {
    if (key === 'emoji') return EMOJI_ICON.get(value) || 'spark'
    return value.replace(EMOJI_RE, '')
  }
  if (Array.isArray(value)) return value.map((item) => cleanResponse(item))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanResponse(v, k)]))
  return value
}

export async function api(path, { method = 'GET', body, cached = false } = {}) {
  if (cached && method === 'GET' && cache.has(path)) return cache.get(path)
  let res
  try {
    res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  } catch {
    const e = new Error('Cannot reach the server'); e.offline = true; throw e
  }
  const data = cleanResponse(await res.json().catch(() => ({})))
  if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.status = res.status; throw e }
  if (cached && method === 'GET') cache.set(path, data)
  return data
}
export const inr = (n, compact = false) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(Math.round(n))
  if (compact && a >= 10_000_000) return `${sign}₹${(a / 10_000_000).toFixed(2)} Cr`
  if (compact && a >= 100_000) return `${sign}₹${(a / 100_000).toFixed(2)} L`
  return `${sign}₹${a.toLocaleString('en-IN')}`
}
export const pct = (n, d = 1) => `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}%`
export const TYPE_META = {
  stock: { name: 'Individual Stocks', short: 'Stocks', emoji: 'building', color: '#a77a12' },
  mf: { name: 'Mutual Funds', short: 'Mutual Funds', emoji: 'basket', color: '#827a67' },
  index: { name: 'Index Funds', short: 'Index Funds', emoji: 'index', color: '#b4994d' },
  etf: { name: 'ETFs', short: 'ETFs', emoji: 'bolt', color: '#c4a447' },
}
export const PALETTE = ['#a77a12', '#b4994d', '#827a67', '#d2bd7a', '#6f6b60', '#c4a447', '#999385', '#947b3c']
