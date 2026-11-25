// Smoke test: needs the backend running on :5000  (cd server && npm start)
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { beforeAll, afterEach, test, expect, vi } from 'vitest'
import App from '../src/App.jsx'

beforeAll(() => {
  const real = globalThis.fetch
  globalThis.fetch = (u, o) => real(typeof u === 'string' && u.startsWith('/api') ? 'http://localhost:5000' + u : u, o)
  window.scrollTo = () => {}
  Element.prototype.scrollIntoView = () => {}
  localStorage.setItem('bfs-state-v2', JSON.stringify({ tourSeen: true }))
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
})
afterEach(() => cleanup())
const go = (p) => { window.history.pushState({}, '', p); return render(<App />) }
const errors = []
vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ').slice(0, 300)))

test('home: lessons for all four types render', async () => {
  go('/')
  for (const name of ['Individual Stocks', 'Mutual Funds', 'Index Funds', 'ETFs']) {
    fireEvent.click(await screen.findByLabelText(`Learn about ${name}`))
    await screen.findByText(/Think of it like this/)
    for (const tab of ['How to invest', 'Try it', 'Pros & cons', 'FAQ', 'How it works']) fireEvent.click(screen.getByText(new RegExp(tab)))
  }
  fireEvent.click(await screen.findByText(/Try it/))
  await screen.findByText(/Crash a company/)
})
test('budget: builds a plan with projections and mistakes', async () => {
  go('/budget')
  fireEvent.click(await screen.findByText(/Build my portfolio/))
  await screen.findByText(/What if you choose wrong/, {}, { timeout: 8000 })
  await screen.findByText(/Time Machine/)
  fireEvent.click(screen.getByText('3 years'))
  fireEvent.click(screen.getByText(/Chasing last year/))
})
test('behaviour: full test to fingerprint', async () => {
  go('/behaviour')
  fireEvent.click(await screen.findByText(/Calm practice/))
  fireEvent.click(screen.getByText(/Begin the test/))
  for (let i = 0; i < 10; i++) {
    await waitFor(() => expect(document.querySelectorAll('.opt').length).toBe(3), { timeout: 5000 })
    fireEvent.click(document.querySelectorAll('.opt')[i % 3])
    fireEvent.click(await screen.findByText(i === 9 ? /See my fingerprint/ : /Next scenario/))
  }
  await screen.findByText(/Your behavioural fingerprint/, {}, { timeout: 8000 })
})
test('pre-decision: check, nudge, outcome', async () => {
  go('/pre-decision')
  fireEvent.click(await screen.findByText(/FOMO at the peak/))
  fireEvent.click(screen.getByText(/Check before I act/))
  await screen.findByText(/Pre-decision check/, {}, { timeout: 8000 })
  fireEvent.click(await screen.findByText(/Review again/))
  await screen.findByText(/What happened next/, {}, { timeout: 8000 })
})
test('navbar stock search: search provider symbols and display selected quote', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (url) => {
    const data = url.endsWith('/api/education')
      ? { status: 'ok', types: [], compare: [] }
      : url.endsWith('/api/glossary')
        ? {}
        : url.includes('/api/ai/chat')
          ? { answer: 'The latest quote shows a small day-over-day increase; it is not a forecast.', suggestedPage: null }
        : url.endsWith('/api/market')
          ? { events: [], benchmark: [], labels: [] }
          : url.includes('/ml/market/assets')
            ? { status: 'unavailable' }
            : url.includes('/market/stocks')
              ? { status: 'ok', symbols: [{ symbol: 'RELIANCE', companyName: 'Reliance Industries' }] }
              : url.includes('/market/search')
                ? { status: 'ok', results: [{ symbol: 'INFY', companyName: 'Infosys Limited' }] }
                : { status: 'ok', symbol: 'INFY', exchange: 'NSE', dataStatus: 'fresh', lastPrice: 2500.5, change: 20.25, changePercent: 0.81, previousClose: 2480.25, open: 2490, dayHigh: 2510, dayLow: 2480, yearHigh: 2600, yearLow: 1400, volume: 5000, marketCap: 1000000, currency: 'INR', fetchedAt: '2026-11-25T10:00:00.000Z', provider: 'Test provider' }
    return { ok: true, json: async () => data }
  })
  try {
    go('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Open stock search' }))
    await screen.findByText('Reliance Industries')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Indian stocks' }), { target: { value: 'infosys' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search stocks' }))
    await screen.findByText('Infosys Limited')
    fireEvent.click(screen.getByRole('button', { name: 'View quote' }))
    await screen.findByText('₹2,500.50')
    expect(screen.getByText('+0.81%')).toBeTruthy()
    await screen.findByText('The latest quote shows a small day-over-day increase; it is not a forecast.')
    fireEvent.click(screen.getByRole('button', { name: 'Chat about this stock' }))
    await screen.findByText(/Here is a beginner-friendly snapshot of Infosys Limited/)
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask FinSense AI' }), { target: { value: 'What does this price change mean?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findAllByText('The latest quote shows a small day-over-day increase; it is not a forecast.')
  } finally {
    globalThis.fetch = originalFetch
  }
})
test('learn tutorial guides through a lesson and prompts after five idle seconds', async () => {
  go('/')
  fireEvent.click(await screen.findByRole('button', { name: 'Tutorial' }))
  await screen.findByText('Choose any investment type to open its lesson.')
  fireEvent.click(await screen.findByLabelText('Learn about Individual Stocks'))
  await screen.findByText(/Pick a lesson tab to explore/)
  fireEvent.click(screen.getByRole('tab', { name: 'How to invest' }))
  await screen.findByText('Scroll down to compare the four investment types.')
  await screen.findByText(/Whenever you are ready, scroll down to continue\./, {}, { timeout: 6000 })
})
test('theme toggle switches and persists the selected palette', async () => {
  localStorage.setItem('bfs-state-v2', JSON.stringify({ tourSeen: true, theme: 'light' }))
  go('/')
  fireEvent.click(await screen.findByRole('button', { name: 'Switch to dark theme' }))
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
  await waitFor(() => expect(JSON.parse(localStorage.getItem('bfs-state-v2')).theme).toBe('dark'))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
})
test('emoji markers render as graphical icons and are removed from response text', async () => {
  go('/')
  await screen.findByLabelText('Learn about Individual Stocks')
  expect(document.querySelectorAll('.icon-svg').length).toBeGreaterThan(0)
  expect(document.body.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
})
test('no React runtime errors', () => { expect(errors.filter((e) => !/not wrapped in act/.test(e))).toEqual([]) })
