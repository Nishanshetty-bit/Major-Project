const cache = new Map()
const ttlMs = Number(process.env.INDIAN_STOCK_CACHE_TTL_MS || 30_000)
const staleMs = Number(process.env.INDIAN_STOCK_STALE_MAX_MS || 600_000)
const timeoutMs = Number(process.env.INDIAN_STOCK_TIMEOUT_MS || 4_000)
const provider = '0xramm/Indian-Stock-Market-API (Yahoo Finance upstream)'
const defaultProviderUrl = 'http://127.0.0.1:8787'

function unavailable(symbol, message) {
  return { status: 'unavailable', symbol, exchange: 'NSE', provider, message, fetchedAt: null, marketTimestamp: null }
}

function unavailableResult(message) {
  return { status: 'unavailable', provider, message, fetchedAt: null }
}

function number(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replaceAll(',', '').replace(/%$/, ''))
  return Number.isFinite(parsed) ? parsed : null
}

async function providerRequest(path, { fetchImpl, now, allowSearchMiss = false }) {
  const base = (process.env.INDIAN_STOCK_API_BASE_URL || defaultProviderUrl).replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${base}${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
    const body = await response.json()
    const searchMiss = allowSearchMiss && response.status === 404 && body?.status === 'error' && /^No results found\b/i.test(body.message || '')
    if (!response.ok && !searchMiss) throw new Error(`Provider returned HTTP ${response.status}`)
    if (body?.status !== 'success' && !searchMiss) throw new Error(body?.message || 'Provider returned an invalid response.')
    return { body, fetchedAt: new Date(now()).toISOString() }
  } finally {
    clearTimeout(timer)
  }
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
  if (cached && now() - cached.cachedAt <= ttlMs) return { ...cached.quote, dataStatus: 'cached' }
  try {
    const { body, fetchedAt } = await providerRequest(`/stock?symbol=${encodeURIComponent(symbol + '.NS')}&res=num`, { fetchImpl, now })
    if (!body?.data || number(body.data.last_price) === null) throw new Error(body?.message || 'Provider returned no usable quote.')
    const quote = payload(symbol, body, fetchedAt)
    cache.set(symbol, { quote, cachedAt: now() })
    return quote
  } catch (error) {
    if (cached && now() - cached.cachedAt <= staleMs) return { ...cached.quote, dataStatus: 'stale', freshnessNote: `Live refresh failed (${error.name === 'AbortError' ? 'timeout' : error.message}); showing the last fetched quote.` }
    return unavailable(symbol, `Live quote unavailable: ${error.name === 'AbortError' ? 'provider request timed out' : error.message}`)
  }
}

export async function getIndianSymbols({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  try {
    const { body, fetchedAt } = await providerRequest('/symbols', { fetchImpl, now })
    if (!Array.isArray(body.symbols)) throw new Error('Provider returned an invalid stock symbol list.')
    const seen = new Set()
    const symbols = []
    for (const entry of body.symbols) {
      const symbol = String(entry?.symbol || '').toUpperCase()
      if (!/^[A-Z0-9&.-]{1,24}$/.test(symbol) || seen.has(symbol)) continue
      seen.add(symbol)
      symbols.push({ symbol, companyName: String(entry.search_term || entry.company_name || symbol).trim() })
    }
    return { status: 'ok', provider, fetchedAt, symbols }
  } catch (error) {
    return unavailableResult(`Stock list unavailable: ${error.name === 'AbortError' ? 'provider request timed out' : error.message}`)
  }
}

export async function searchIndianStocks(queryInput, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const query = String(queryInput || '').trim()
  if (!query || query.length > 100) return unavailableResult('Enter a search term of 1 to 100 characters.')
  try {
    const { body, fetchedAt } = await providerRequest(`/search?q=${encodeURIComponent(query)}`, { fetchImpl, now, allowSearchMiss: true })
    if (body.status === 'error') return { status: 'ok', provider, fetchedAt, results: [] }
    if (!Array.isArray(body.results)) throw new Error('Provider returned an invalid stock search response.')
    const results = body.results
      .filter((entry) => /^[A-Z0-9&.-]{1,24}$/.test(String(entry?.symbol || '').toUpperCase()))
      .map((entry) => ({
        symbol: String(entry.symbol).toUpperCase(),
        companyName: String(entry.company_name || entry.search_term || entry.symbol).trim(),
      }))
    return { status: 'ok', provider, fetchedAt, results }
  } catch (error) {
    return unavailableResult(`Stock search unavailable: ${error.name === 'AbortError' ? 'provider request timed out' : error.message}`)
  }
}

export function clearIndianQuoteCache() { cache.clear() }
