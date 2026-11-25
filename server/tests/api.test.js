import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
process.env.STORE_FILE = ''
process.env.NODE_ENV = 'test'
const { createApp } = await import('../src/app.js')
let server, base
before(async () => { server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}/api` })
after(() => server.close())
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('health + education', async () => {
  assert.equal((await (await fetch(base + '/health')).json()).status, 'ok')
  const ed = await (await fetch(base + '/education')).json()
  assert.equal(ed.types.length, 4)
})
test('assets are scored with explainable factors', async () => {
  const a = await (await fetch(base + '/assets/nifty50idx')).json()
  assert.ok(a.confidence > 0 && a.factors.length >= 5 && a.news.length === 4 && a.history.length === 61)
})
test('allocation sums to 100% and projects 1/2/3 years', async () => {
  const r = await (await post('/allocate', { amount: 50000, types: ['index', 'etf', 'stock'], risk: 'medium' })).json()
  assert.equal(r.holdings.reduce((s, h) => s + h.pct, 0), 100)
  assert.ok(r.invested <= 50000)
  for (const y of [1, 2, 3]) assert.ok(r.projections[y].worst.value <= r.projections[y].median.value && r.projections[y].median.value <= r.projections[y].best.value)
  assert.equal(r.mistakes.length, 4)
})
test('speculative stock excluded for cautious plans', async () => {
  const r = await (await post('/allocate', { amount: 100000, types: ['stock'], risk: 'low' })).json()
  assert.ok(!r.holdings.find((h) => h.id === 'hypegreen'))
})
test('validation errors', async () => {
  assert.equal((await post('/allocate', { amount: 5 })).status, 400)
  assert.equal((await post('/intervention/check', { assetId: 'nope' })).status, 400)
  assert.equal((await fetch(base + '/nothing')).status, 404)
})
test('AI chat proxies to Gemini and returns a page suggestion', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'server-test-key'
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url, options)
    assert.equal(options.headers['x-goog-api-key'], 'server-test-key')
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Open the Budget page to plan allocations.' }] } }] }) }
  }
  try {
    const response = await post('/ai/chat', { message: 'How do I make a budget plan?' })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      answer: 'Open the Budget page to plan allocations.',
      suggestedPage: { path: '/budget', label: 'Budget' },
    })
    assert.equal((await post('/ai/chat', { message: ' ' })).status, 400)
  } finally {
    globalThis.fetch = originalFetch
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})
test('behaviour → profile → intervention → outcome loop', async () => {
  const sc = await (await fetch(base + '/behavioral/scenarios?type=stock')).json()
  assert.equal(sc.scenarios.length, 10)
  const answers = sc.scenarios.map((s) => ({ scenarioId: s.id, optionId: s.options.find((o) => !o.best).id, timeMs: 1500 }))
  const profile = await (await post('/behavioral/analyze', { type: 'stock', answers })).json()
  assert.ok(profile.id && profile.biasList.length === 8)
  const chk = await (await post('/intervention/check', { assetId: 'hypegreen', action: 'BUY', amount: 25000, asOf: 32, emotion: 'tip', profileId: profile.id })).json()
  assert.ok(chk.regret >= 55, 'FOMO at the peak with a biased profile should be high regret, got ' + chk.regret)
  const out = await (await post('/intervention/outcome', { checkId: chk.id, decision: 'proceed' })).json()
  assert.ok(out.pnl < 0 && out.real)
  const j = await (await fetch(base + '/intervention/journal/' + profile.id)).json()
  assert.equal(j.entries.length, 1)
})
test('calm disciplined profile gets low regret for planned buy', async () => {
  const sc = await (await fetch(base + '/behavioral/scenarios?type=index')).json()
  const answers = sc.scenarios.map((s) => ({ scenarioId: s.id, optionId: s.bestId, timeMs: 6000 }))
  const profile = await (await post('/behavioral/analyze', { type: 'index', answers })).json()
  assert.equal(profile.archetype.key, 'steady')
  const chk = await (await post('/intervention/check', { assetId: 'nifty50idx', action: 'BUY', amount: 5000, asOf: 40, emotion: 'calm', portfolioValue: 100000, profileId: profile.id })).json()
  assert.ok(chk.regret < 45, 'got ' + chk.regret)
})
