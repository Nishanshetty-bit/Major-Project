export const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
export const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) }
export const round = (x, d = 2) => { const f = 10 ** d; return Math.round(x * f) / f }
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
/** linear points: 0 at `a`, `pts` at `b` */
export const scale = (x, a, b, pts) => clamp((x - a) / (b - a), 0, 1) * pts
export const pctNum = (frac, d = 1) => round(frac * 100, d)

export const monthlyReturns = (p) => p.slice(1).map((v, i) => v / p[i] - 1)
export const retOver = (p, h, end = p.length - 1) => (end - h < 0 ? null : p[end] / p[end - h] - 1)
export function cagrAvail(p, years, end = p.length - 1) {
  const h = Math.min(years * 12, end)
  if (h < 6) return 0
  return (p[end] / p[end - h]) ** (12 / h) - 1
}
export const annVol = (p, end = p.length - 1) => std(monthlyReturns(p.slice(0, end + 1))) * Math.sqrt(12)
export function maxDrawdown(p, end = p.length - 1, start = 0) {
  let peak = -Infinity, mdd = 0
  for (let i = start; i <= end; i++) { peak = Math.max(peak, p[i]); mdd = Math.min(mdd, p[i] / peak - 1) }
  return mdd
}
/** Simple RSI on monthly closes (share of gains vs moves), 0-100 */
export function rsi(p, end = p.length - 1, n = 6) {
  let g = 0, l = 0
  for (let i = Math.max(1, end - n + 1); i <= end; i++) { const d = p[i] / p[i - 1] - 1; d > 0 ? (g += d) : (l -= d) }
  return g + l === 0 ? 50 : (100 * g) / (g + l)
}
export function rolling(p, h) {
  const out = []
  for (let s = 0; s + h < p.length; s++) out.push(p[s + h] / p[s])
  return out
}
export function percentile(a, q) {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}
export const sharpe = (cagr, vol, rf = 0.06) => (vol > 0.0001 ? (cagr - rf) / vol : 0)
