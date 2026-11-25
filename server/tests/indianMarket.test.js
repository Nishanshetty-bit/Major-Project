import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearIndianQuoteCache, getIndianQuote } from '../src/services/indianMarket.js'

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
