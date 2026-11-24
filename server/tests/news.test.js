import { test } from 'node:test'
import assert from 'node:assert/strict'
import { associateArticle, dedupeArticles, fetchNews, providerStatus } from '../src/services/realNews.js'
import { aggregateProbabilities } from '../src/services/sentiment.js'

test('news association requires known company or unambiguous ticker', () => {
  const exact = associateArticle({ title: 'Infosys reports quarterly results', description: '' }, 'INFY')
  assert.equal(exact.associated, true)
  assert.equal(exact.method, 'exact-company-name')
  assert.equal(associateArticle({ title: 'INFY outlook', description: '' }, 'INFY').associated, true)
  assert.equal(associateArticle({ title: 'The bank raises rates', description: '' }, 'HDFCBANK').associated, false)
  assert.equal(associateArticle({ title: 'Anything', description: '' }, 'UNKNOWN').associated, false)
})

test('news deduplication removes duplicate URLs and title-source pairs', () => {
  const rows = [{ url: 'https://a', title: 'A', publisher: 'P' }, { url: 'https://a', title: 'A copy', publisher: 'P2' }, { url: '', title: 'B', publisher: 'P' }, { url: '', title: 'B', publisher: 'P' }]
  assert.equal(dedupeArticles(rows).length, 2)
})

test('news deduplication collapses syndicated matching headlines', () => {
  const rows = [{ url: 'https://a/story', headline: 'Company reports record profit', publisher: 'A' }, { url: 'https://b/story?ref=feed', headline: 'Company reports record profit!', publisher: 'B' }]
  assert.equal(dedupeArticles(rows).length, 1)
})

test('news provider parses GDELT metadata and keeps synthetic assets unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ articles: [{ title: 'Infosys reports quarterly results', url: 'https://news.example/infy', domain: 'news.example', seendate: '20261124120000' }] }) })
  try {
    const result = await fetchNews('INFY')
    assert.equal(result.status, 'ok')
    assert.equal(result.articles.length, 1)
    assert.equal(result.articles[0].publisher, 'news.example')
    assert.equal(result.articles[0].publishedAt, '2026-11-24T12:00:00.000Z')
    assert.equal((await fetchNews('HYPEGRN')).status, 'unavailable')
    assert.match((await fetchNews('RELIANCE')).message, /rate limit/i)
  } finally { globalThis.fetch = originalFetch }
})

test('news provider distinguishes timeouts, rate limits and invalid payloads', async () => {
  const originalFetch = globalThis.fetch
  try {
    const timeoutProvider = await import('../src/services/realNews.js?timeout-case')
    globalThis.fetch = async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error }
    assert.match((await timeoutProvider.fetchNews('INFY')).message, /timed out/i)

    const rateProvider = await import('../src/services/realNews.js?rate-limit-case')
    globalThis.fetch = async () => ({ ok: false, status: 429, headers: { get: () => 'text/plain' } })
    assert.match((await rateProvider.fetchNews('INFY')).message, /rate limit/i)

    const invalidProvider = await import('../src/services/realNews.js?invalid-payload-case')
    globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' } })
    assert.match((await invalidProvider.fetchNews('INFY')).message, /non-JSON/i)
  } finally { globalThis.fetch = originalFetch }
})

test('sentiment aggregation caps publisher dominance and uses probabilities', () => {
  const items = [1, 2, 3].map((_, i) => ({ publisher: 'same', publishedAt: new Date().toISOString(), sentiment: { negativeProbability: 0.05, neutralProbability: 0.1, positiveProbability: 0.85 } })).concat([{ publisher: 'other', publishedAt: new Date().toISOString(), sentiment: { negativeProbability: 0.8, neutralProbability: 0.1, positiveProbability: 0.1 } }])
  const result = aggregateProbabilities(items)
  assert.equal(result.supportingArticles, 3)
  assert.ok(result.positiveProbability > result.negativeProbability)
  assert.match(result.formula, /publisher-capped/)
})

test('provider status identifies real GDELT and no credentials requirement', () => {
  const status = providerStatus()
  assert.equal(status.mode, 'real')
  assert.equal(status.credentialsRequired, false)
})
