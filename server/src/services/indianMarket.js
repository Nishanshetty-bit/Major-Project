const cache = new Map()
const ttlMs = Number(process.env.INDIAN_STOCK_CACHE_TTL_MS || 30_000)
const staleMs = Number(process.env.INDIAN_STOCK_STALE_MAX_MS || 600_000)
const timeoutMs = Number(process.env.INDIAN_STOCK_TIMEOUT_MS || 4_000)
const provider = '0xramm/Indian-Stock-Market-API (Yahoo Finance upstream)'

function unavailable(symbol, message) {
  return { status: 'unavailable', symbol, exchange: 'NSE', provider, message, fetchedAt: null, marketTimestamp: null }
}

function number(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replaceAll(',', '').replace(/%$/, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function payload(symbol, raw, fetchedAt) {
  const d = raw?.data || raw
  const timestamp = d?.timestamp ?? d?.regular_market_time ?? null
  return {
    status: 'ok',
    dataStatus: 'fresh',
    symbol,
    exchange: 'NSE',
    companyName: d?.company_name ?? null,
    currency: d?.currency ?? 'INR',
    lastPrice: number(d?.last_price),
    change: number(d?.change),
    changePercent: number(d?.percent_change),
    previousClose: number(d?.previous_close),
    open: number(d?.open),
    dayHigh: number(d?.day_high),
    dayLow: number(d?.day_low),
    yearHigh: number(d?.year_high),
    yearLow: number(d?.year_low),
    volume: number(d?.volume),
    marketCap: number(d?.market_cap),
    peRatio: number(d?.pe_ratio),
    dividendYield: number(d?.dividend_yield),
    bookValue: number(d?.book_value),
    earningsPerShare: number(d?.earnings_per_share),
    sector: d?.sector ?? null,
    industry: d?.industry ?? null,
    provider,
    fetchedAt,
    marketTimestamp: timestamp,
    providerLastUpdate: d?.last_update ?? null,
    freshnessNote: 'The provider timestamp may reflect Yahoo Finance market time and does not independently verify exchange real-time freshness.',
  }
}

export async function getIndianQuote(symbolInput, { exchange = 'NSE', fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const symbol = String(symbolInput || '').trim().toUpperCase()
  exchange = String(exchange || 'NSE').trim().toUpperCase()
  if (!/^[A-Z0-9&.-]{1,24}$/.test(symbol)) return unavailable(symbol, 'Use a valid NSE symbol containing letters, numbers, dots, ampersands, or hyphens.')
  if (exchange !== 'NSE') return unavailable(symbol, 'Only NSE quotes are supported.')
  const cached = cache.get(symbol)
  if (!process.env.INDIAN_STOCK_API_BASE_URL) {
    if (cached && now() - cached.cachedAt <= staleMs) return { ...cached.quote, dataStatus: 'stale', freshnessNote: 'Using a previously fetched quote; live provider URL is not configured.' }
    return unavailable(symbol, 'INDIAN_STOCK_API_BASE_URL is not configured; no live quote has been fetched.')
  }
  if (cached && now() - cached.cachedAt <= ttlMs) return { ...cached.quote, dataStatus: 'cached' }
  const base = process.env.INDIAN_STOCK_API_BASE_URL.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${base}/stock?symbol=${encodeURIComponent(symbol + '.NS')}&res=num`, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`)
    const body = await response.json()
    if (body?.status !== 'success' || !body?.data || number(body.data.last_price) === null) throw new Error(body?.message || 'Provider returned no usable quote.')
    const fetchedAt = new Date(now()).toISOString()
    const quote = payload(symbol, body, fetchedAt)
    cache.set(symbol, { quote, cachedAt: now() })
    return quote
  } catch (error) {
    if (cached && now() - cached.cachedAt <= staleMs) return { ...cached.quote, dataStatus: 'stale', freshnessNote: `Live refresh failed (${error.name === 'AbortError' ? 'timeout' : error.message}); showing the last fetched quote.` }
    return unavailable(symbol, `Live quote unavailable: ${error.name === 'AbortError' ? 'provider request timed out' : error.message}`)
  } finally {
    clearTimeout(timer)
  }
}

export function clearIndianQuoteCache() { cache.clear() }
