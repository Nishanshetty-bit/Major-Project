// Validation, rate limiting, logging & error handling – small and dependency-free.
export class HttpError extends Error { constructor(status, message, details) { super(message); this.status = status; this.details = details } }
export const bad = (msg, details) => new HttpError(400, msg, details)

export function logger(req, res, next) {
  const t = Date.now()
  res.on('finish', () => { if (process.env.NODE_ENV !== 'test') console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t}ms)`) })
  next()
}
export function security(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
}
export function rateLimit({ windowMs = 60_000, max = 240 } = {}) {
  const hits = new Map()
  const iv = setInterval(() => hits.clear(), windowMs); iv.unref?.()
  return (req, res, next) => {
    const k = req.ip
    const n = (hits.get(k) || 0) + 1
    hits.set(k, n)
    if (n > max) return next(new HttpError(429, 'Too many requests – slow down a little.'))
    next()
  }
}
export const num = (v, name, { min = -Infinity, max = Infinity, def, int = false } = {}) => {
  if (v === undefined || v === null || v === '') { if (def !== undefined) return def; throw bad(`${name} is required`) }
  const n = Number(v)
  if (!Number.isFinite(n)) throw bad(`${name} must be a number`)
  if (n < min || n > max) throw bad(`${name} must be between ${min} and ${max}`)
  return int ? Math.round(n) : n
}
export const oneOf = (v, name, list, def) => {
  if (v === undefined || v === null || v === '') { if (def !== undefined) return def; throw bad(`${name} is required`) }
  if (!list.includes(v)) throw bad(`${name} must be one of: ${list.join(', ')}`)
  return v
}
export const wrap = (fn) => (req, res, next) => { try { Promise.resolve(fn(req, res, next)).catch(next) } catch (e) { next(e) } }
export function notFound(req, res, next) { next(new HttpError(404, `No route for ${req.method} ${req.originalUrl}`)) }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500)
  if (status === 500) console.error(err)
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : err.message, details: err.details })
}
