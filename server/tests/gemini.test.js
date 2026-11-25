import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatWithGemini, suggestedPageFor } from '../src/services/gemini.js'

test('Gemini requests keep the API key in a header and include sanitized stock context', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  let requestUrl
  let requestOptions
  try {
    const result = await chatWithGemini({
      message: 'How do I make a budget plan?',
      history: [{ role: 'assistant', text: 'I can help with the project.' }],
      stock: {
        symbol: 'infy',
        companyName: 'Infosys',
        quote: { lastPrice: 1500.5, changePercent: 1.2, secretField: 'must not be sent' },
      },
      fetchImpl: async (url, options) => {
        requestUrl = url
        requestOptions = options
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Start with the amount you can invest.' }] } }] }) }
      },
    })
    const body = JSON.parse(requestOptions.body)
    assert.equal(requestUrl.includes(process.env.GEMINI_API_KEY), false)
    assert.equal(requestOptions.headers['x-goog-api-key'], process.env.GEMINI_API_KEY)
    assert.equal(body.contents[0].role, 'model')
    assert.equal(body.contents[1].parts[0].text, 'How do I make a budget plan?')
    assert.match(body.systemInstruction.parts[0].text, /"lastPrice":1500.5/)
    assert.equal(body.systemInstruction.parts[0].text.includes('must not be sent'), false)
    assert.deepEqual(result, {
      answer: 'Start with the amount you can invest.',
      suggestedPage: { path: '/budget', label: 'Budget' },
    })
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('Gemini chat validates message and history sizes before making a request', async () => {
  const fetchImpl = async () => assert.fail('invalid chat requests must not call Gemini')
  await assert.rejects(chatWithGemini({ message: ' '.repeat(2), fetchImpl }), (error) => error.status === 400)
  await assert.rejects(chatWithGemini({ message: 'Hi', history: Array(9).fill({ role: 'user', text: 'hello' }), fetchImpl }), (error) => error.status === 400)
})

test('Gemini configuration errors do not call the external service', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    await assert.rejects(
      chatWithGemini({ message: 'What is this project?', fetchImpl: async () => assert.fail('Gemini must not be called without a key') }),
      (error) => error.status === 503 && /GEMINI_API_KEY/.test(error.message),
    )
  } finally {
    if (previousKey !== undefined) process.env.GEMINI_API_KEY = previousKey
  }
})

test('Gemini reports safe messages for invalid keys and unavailable models', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  try {
    await assert.rejects(
      chatWithGemini({
        message: 'Hello',
        fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid. Private upstream details.' } }) }),
      }),
      (error) => error.status === 503 && /rejected the API key/.test(error.message) && !/Private upstream/.test(error.message),
    )
    await assert.rejects(
      chatWithGemini({
        message: 'Hello',
        fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ error: { message: 'model not found' } }) }),
      }),
      (error) => error.status === 503 && /configured Gemini model is unavailable/.test(error.message),
    )
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('project questions map to their relevant app page', () => {
  assert.deepEqual(suggestedPageFor('How do I check before I buy a stock?'), { path: '/pre-decision', label: 'Pre-Decision' })
  assert.equal(suggestedPageFor('What does a Sharpe ratio mean?'), null)
})
