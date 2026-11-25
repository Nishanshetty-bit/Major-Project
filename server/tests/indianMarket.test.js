import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearIndianQuoteCache, getIndianQuote, getIndianSymbols, searchIndianStocks } from '../src/services/indianMarket.js'

test('Indian quote maps provider fields and uses cache on repeated calls', async () => {
  const before = process.env.INDIAN_STOCK_API_BASE_URL
  process.env.INDIAN_STOCK_API_BASE_URL = 'https://provider.example'
  clearIndianQuoteCache()
  let calls = 0
  const fetchImpl = async (url) => {
    calls++
    assert.match(url, /stock\?symbol=INFY\.NS&res=num/)
    return { ok: true, json: async () => ({ status: 'success', data: { company_name: 'Infosys', last_price: '1,500.5', percent_change: '1.2', volume: '2000', timestamp: 123, last_update: '2026-11-25' } }) }
  }
  try {
    const fresh = await getIndianQuote('infy', { fetchImpl })
    assert.equal(fresh.status, 'ok')
    assert.equal(fresh.lastPrice, 1500.5)
    assert.equal(fresh.changePercent, 1.2)
    assert.equal(fresh.marketTimestamp, 123)
    assert.equal(fresh.providerLastUpdate, '2026-11-25')
    assert.equal(fresh.dataStatus, 'fresh')
    const cached = await getIndianQuote('INFY', { fetchImpl })
    assert.equal(cached.dataStatus, 'cached')
    assert.equal(calls, 1)
  } finally {
    clearIndianQuoteCache()
    if (before === undefined) delete process.env.INDIAN_STOCK_API_BASE_URL
    else process.env.INDIAN_STOCK_API_BASE_URL = before
  }
})

test('Indian quote marks provider failures unavailable and rejects malformed symbols', async () => {
  const before = process.env.INDIAN_STOCK_API_BASE_URL
  process.env.INDIAN_STOCK_API_BASE_URL = 'https://provider.example'
  clearIndianQuoteCache()
  try {
    const failed = await getIndianQuote('RELIANCE', { fetchImpl: async () => { throw new Error('offline') } })
    assert.equal(failed.status, 'unavailable')
    assert.match(failed.message, /offline/)
    assert.equal((await getIndianQuote('REL IANCE')).status, 'unavailable')
    assert.match((await getIndianQuote('RELIANCE', { exchange: 'BSE' })).message, /Only NSE/)
  } finally {
    clearIndianQuoteCache()
    if (before === undefined) delete process.env.INDIAN_STOCK_API_BASE_URL
    else process.env.INDIAN_STOCK_API_BASE_URL = before
  }
})

test('Indian stock directory and search use provider endpoints and normalize results', async () => {
  const before = process.env.INDIAN_STOCK_API_BASE_URL
  process.env.INDIAN_STOCK_API_BASE_URL = 'https://provider.example'
  const urls = []
  const fetchImpl = async (url) => {
    urls.push(url)
    if (url.endsWith('/symbols')) return { ok: true, json: async () => ({ status: 'success', symbols: [{ search_term: 'Infosys', symbol: 'INFY' }, { search_term: 'INFY', symbol: 'INFY' }, { search_term: 'TCS', symbol: 'TCS' }] }) }
    if (url.includes('q=unknown')) return { ok: false, status: 404, json: async () => ({ status: 'error', message: 'No results found for: unknown' }) }
    return { ok: true, json: async () => ({ status: 'success', results: [{ company_name: 'Infosys Limited', symbol: 'INFY' }] }) }
  }
  try {
    const directory = await getIndianSymbols({ fetchImpl })
    assert.equal(directory.status, 'ok')
    assert.deepEqual(directory.symbols, [{ symbol: 'INFY', companyName: 'Infosys' }, { symbol: 'TCS', companyName: 'TCS' }])
    const results = await searchIndianStocks('infosys india', { fetchImpl })
    assert.deepEqual(results.results, [{ symbol: 'INFY', companyName: 'Infosys Limited' }])
    assert.match(urls[0], /\/symbols$/)
    assert.match(urls[1], /\/search\?q=infosys%20india$/)
    assert.deepEqual((await searchIndianStocks('unknown', { fetchImpl })).results, [])
    assert.equal((await searchIndianStocks(' ')).status, 'unavailable')
  } finally {
    if (before === undefined) delete process.env.INDIAN_STOCK_API_BASE_URL
    else process.env.INDIAN_STOCK_API_BASE_URL = before
  }
})

test('Indian stock API defaults to the local Wrangler address', async () => {
  const before = process.env.INDIAN_STOCK_API_BASE_URL
  delete process.env.INDIAN_STOCK_API_BASE_URL
  try {
    const result = await getIndianSymbols({
      fetchImpl: async (url) => {
        assert.equal(url, 'http://127.0.0.1:8787/symbols')
        return { ok: true, json: async () => ({ status: 'success', symbols: [] }) }
      },
    })
    assert.equal(result.status, 'ok')
  } finally {
    if (before === undefined) delete process.env.INDIAN_STOCK_API_BASE_URL
    else process.env.INDIAN_STOCK_API_BASE_URL = before
  }
})
