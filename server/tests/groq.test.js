import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatWithGroq, suggestedPageFor } from '../src/services/groq.js'

test('Groq requests keep the API key in a header and include sanitized stock context', async () => {
  const previousKey = process.env.GROQ_API_KEY
  process.env.GROQ_API_KEY = 'test-groq-key'
  let requestUrl
  let requestOptions
  try {
    const result = await chatWithGroq({
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
        return new Response(JSON.stringify({
          id: 'resp_test',
          object: 'response',
          created_at: 1,
          model: 'openai/gpt-oss-20b',
          output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Start with the amount you can invest.', annotations: [] }] }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    })
    const body = JSON.parse(requestOptions.body)
    assert.equal(requestUrl, 'https://api.groq.com/openai/v1/responses')
    assert.equal(requestUrl.includes(process.env.GROQ_API_KEY), false)
    assert.equal(requestOptions.headers.get('authorization'), `Bearer ${process.env.GROQ_API_KEY}`)
    assert.equal(body.model, 'openai/gpt-oss-20b')
    assert.equal(body.input[0].role, 'system')
    assert.equal(body.input[1].role, 'assistant')
    assert.equal(body.input[2].content, 'How do I make a budget plan?')
    assert.match(body.input[0].content, /"lastPrice":1500.5/)
    assert.equal(body.input[0].content.includes('must not be sent'), false)
    assert.deepEqual(result, {
      answer: 'Start with the amount you can invest.',
      suggestedPage: { path: '/budget', label: 'Budget' },
    })
  } finally {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = previousKey
  }
})

test('Groq chat validates message and history sizes before making a request', async () => {
  const fetchImpl = async () => assert.fail('invalid chat requests must not call Groq')
  await assert.rejects(chatWithGroq({ message: ' '.repeat(2), fetchImpl }), (error) => error.status === 400)
  await assert.rejects(chatWithGroq({ message: 'Hi', history: Array(9).fill({ role: 'user', text: 'hello' }), fetchImpl }), (error) => error.status === 400)
})

test('Groq responses are returned as plain text without Markdown formatting', async () => {
  const previousKey = process.env.GROQ_API_KEY
  process.env.GROQ_API_KEY = 'test-groq-key'
  try {
    const result = await chatWithGroq({
      message: 'What can I learn here?',
      fetchImpl: async () => new Response(JSON.stringify({
        id: 'resp_test',
        object: 'response',
        created_at: 1,
        model: 'openai/gpt-oss-20b',
        output: [{
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{
            type: 'output_text',
            text: 'Hello!\n\n- **Learn** – Explore funds.\n- **Budget** – Plan a portfolio.',
            annotations: [],
          }],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    })

    assert.equal(result.answer, 'Hello!\n\nLearn – Explore funds.\nBudget – Plan a portfolio.')
    assert.doesNotMatch(result.answer, /[*_`#]/)
  } finally {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = previousKey
  }
})

test('Groq configuration errors do not call the external service', async () => {
  const previousKey = process.env.GROQ_API_KEY
  delete process.env.GROQ_API_KEY
  try {
    await assert.rejects(
      chatWithGroq({ message: 'What is this project?', fetchImpl: async () => assert.fail('Groq must not be called without a key') }),
      (error) => error.status === 503 && /GROQ_API_KEY/.test(error.message),
    )
  } finally {
    if (previousKey !== undefined) process.env.GROQ_API_KEY = previousKey
  }
})

test('Groq reports safe messages for invalid keys and unavailable models', async () => {
  const previousKey = process.env.GROQ_API_KEY
  process.env.GROQ_API_KEY = 'test-groq-key'
  try {
    await assert.rejects(
      chatWithGroq({
        message: 'Hello',
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'invalid api key. Private upstream details.' } }), { status: 401 }),
      }),
      (error) => error.status === 503 && /rejected the API key/.test(error.message) && !/Private upstream/.test(error.message),
    )
    await assert.rejects(
      chatWithGroq({
        message: 'Hello',
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 }),
      }),
      (error) => error.status === 503 && /configured Groq model is unavailable/.test(error.message),
    )
  } finally {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = previousKey
  }
})

test('project questions map to their relevant app page', () => {
  assert.deepEqual(suggestedPageFor('How do I check before I buy a stock?'), { path: '/pre-decision', label: 'Pre-Decision' })
  assert.equal(suggestedPageFor('What does a Sharpe ratio mean?'), null)
})
