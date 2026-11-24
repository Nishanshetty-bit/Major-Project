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
test('no React runtime errors', () => { expect(errors.filter((e) => !/not wrapped in act/.test(e))).toEqual([]) })
