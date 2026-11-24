import { ASSETS } from '../data/universe.js'

const TIMEOUT_MS = Number(process.env.NEWS_TIMEOUT_MS || 6000)
const MIN_REQUEST_INTERVAL_MS = 5000
const LIMIT = 20
let lastRequestAt = 0
const cache = new Map()
const CACHE_TTL_MS = 60_000

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim()
// Only real named companies from the stock universe are eligible. The legacy
// demo also contains synthetic securities and funds without issuer metadata.
const assetBySymbol = new Map(ASSETS.filter((asset) => asset.type === 'stock' && !asset.speculative).map((asset) => [asset.symbol.toUpperCase(), asset]))

export function providerStatus() {
  return { provider: 'GDELT DOC 2.0', mode: 'real', configured: true, credentialsRequired: false, liveVerified: false, supportedSymbols: [...assetBySymbol.keys()], minimumRequestIntervalMs: MIN_REQUEST_INTERVAL_MS, message: 'Public GDELT news search; live availability depends on the provider response. Coverage is limited to named, non-synthetic stock entries. Article links remain subject to publisher terms.' }
}

export function associateArticle(article, symbol) {
  const asset = assetBySymbol.get(String(symbol || '').toUpperCase())
  if (!asset) return { associated: false, confidence: 0, method: 'unknown-symbol' }
  const title = clean(article.title).toLowerCase()
  const description = clean(article.description).toLowerCase()
  const company = asset.name.toLowerCase()
  if (title.includes(company) || description.includes(company)) return { associated: true, symbol: asset.symbol, company: asset.name, confidence: 0.98, method: 'exact-company-name' }
  const token = asset.symbol.toLowerCase()
  if (token.length >= 4 && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(`${title} ${description}`)) return { associated: true, symbol: asset.symbol, company: asset.name, confidence: 0.82, method: 'unambiguous-ticker' }
  return { associated: false, confidence: 0, method: 'uncertain' }
}

export function dedupeArticles(articles) {
  const seen = new Set()
  return articles.filter((article) => {
    const normalizedUrl = clean(article.url).toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '')
    const normalizedTitle = clean(article.headline || article.title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
    const keys = [normalizedUrl && `url:${normalizedUrl}`, normalizedTitle && `title:${normalizedTitle}`].filter(Boolean)
    if (!keys.length || keys.some((key) => seen.has(key))) return false
    keys.forEach((key) => seen.add(key))
    return true
  })
}

function normalize(row, symbol) {
  return { headline: clean(row.title), description: clean(row.description), url: clean(row.url), publisher: clean(row.domain || row.sourcecountry || 'GDELT'), publishedAt: row.seendate ? parseGdeltDate(row.seendate) : null, association: associateArticle({ title: row.title, description: row.description }, symbol) }
}

function parseGdeltDate(value) {
  const text = String(value)
  if (/^\d{14}$/.test(text)) return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}Z`).toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function fetchNews(symbol, limit = LIMIT) {
  const asset = assetBySymbol.get(String(symbol || '').toUpperCase())
  if (!asset) return { status: 'unavailable', dataSource: providerStatus(), articles: [], message: 'Symbol is not in the supported asset universe.' }
  const cacheKey = `${asset.symbol}:${Math.min(Number(limit) || LIMIT, LIMIT)}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.value
  const query = encodeURIComponent(`"${asset.name}" sourcecountry:IN`)
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=${Math.min(Number(limit) || LIMIT, LIMIT)}&sort=datedesc&timespan=7d`
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < MIN_REQUEST_INTERVAL_MS) return { status: 'unavailable', dataSource: providerStatus(), articles: [], message: 'GDELT request rate limit: retry after the provider pacing interval or use a cached feed.' }
  lastRequestAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (response.status === 429) return { status: 'unavailable', dataSource: providerStatus(), articles: [], message: 'GDELT rate limit reached. Retry after a short pause.' }
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('json')) return { status: 'unavailable', dataSource: providerStatus(), articles: [], message: `GDELT returned a non-JSON response (${response.status}).` }
    const body = await response.json().catch(() => null)
    if (!response.ok || !body || !Array.isArray(body.articles)) return { status: 'unavailable', dataSource: providerStatus(), articles: [], message: `GDELT returned an invalid response (${response.status})` }
    const articles = dedupeArticles(body.articles.map((row) => normalize(row, asset.symbol)).filter((row) => row.association.associated))
    const value = { status: 'ok', dataSource: providerStatus(), symbol: asset.symbol, company: asset.name, fetchedAt: new Date().toISOString(), articles, message: articles.length ? undefined : 'Provider returned no confidently associated articles for this symbol.' }
    cache.set(cacheKey, { value, cachedAt: Date.now() })
    return value
  } catch (error) {
    return { status: 'unavailable', dataSource: providerStatus(), articles: [], message: error.name === 'AbortError' ? 'News provider timed out.' : `News provider unavailable: ${error.message}` }
  } finally { clearTimeout(timer) }
}
