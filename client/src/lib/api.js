const cache = new Map()
export async function api(path, { method = 'GET', body, cached = false } = {}) {
  if (cached && method === 'GET' && cache.has(path)) return cache.get(path)
  let res
  try {
    res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  } catch {
    const e = new Error('Cannot reach the server'); e.offline = true; throw e
  }
  const data = await res.json().catch(() => ({}))
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
  stock: { name: 'Individual Stocks', short: 'Stocks', emoji: '🏢', color: '#ff453a' },
  mf: { name: 'Mutual Funds', short: 'Mutual Funds', emoji: '🧺', color: '#0a84ff' },
  index: { name: 'Index Funds', short: 'Index Funds', emoji: '🪞', color: '#30d158' },
  etf: { name: 'ETFs', short: 'ETFs', emoji: '⚡', color: '#ff9f0a' },
}
export const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#5e5ce6']
