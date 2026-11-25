import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, stockQuoteSummary } from '../lib/api.js'
import { useApp } from '../state/AppContext.jsx'
import { Button, Sheet } from './ui.jsx'
import { Icon } from './Icon.jsx'

const QUICK_QUESTIONS = [
  { question: 'How do I make a budget plan?', path: '/budget' },
  { question: 'How can I understand my investing behaviour?', path: '/behaviour' },
  { question: 'How do I check a decision before I buy or sell?', path: '/pre-decision' },
  { question: 'Where can I learn about stocks and funds?', path: '/' },
]
const PAGE_LABELS = { '/': 'Learn', '/budget': 'Budget', '/behaviour': 'Behaviour', '/pre-decision': 'Pre-Decision' }

export default function AIAssistant() {
  const { panel, setPanel, aiStock, setAIStock } = useApp()
  const nav = useNavigate()
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const log = useRef(null)
  const open = panel === 'ai'

  useEffect(() => {
    if (!open) return
    const stockIntro = aiStock
      ? aiStock.explanation
        ? `${aiStock.explanationIsFallback ? 'Groq is temporarily unavailable, so here is a quote-only snapshot:' : `Here is a beginner-friendly snapshot of ${aiStock.companyName || aiStock.symbol}:`}\n\n${aiStock.explanation}\n\nAsk me anything else about this quote.`
        : `Groq is temporarily unavailable, so here is a quote-only snapshot:\n\n${stockQuoteSummary(aiStock)}\n\nAsk me anything else about this quote.`
      : ''
    setMessages(stockIntro ? [{ role: 'assistant', text: stockIntro }] : [])
    setError('')
    setDraft('')
  }, [open, aiStock?.symbol, aiStock?.explanation])

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages, busy])

  const close = () => {
    setPanel(null)
    setAIStock(null)
  }
  const goToPage = (path) => {
    close()
    nav(path)
  }
  const submit = async (event) => {
    event.preventDefault()
    const message = draft.trim()
    if (!message || busy) return
    const history = messages.slice(-8).map(({ role, text }) => ({ role, text }))
    setMessages((current) => [...current, { role: 'user', text: message }])
    setDraft('')
    setError('')
    setBusy(true)
    try {
      const result = await api('/ai/chat', {
        method: 'POST',
        body: {
          message,
          history,
          stock: aiStock ? { symbol: aiStock.symbol, companyName: aiStock.companyName, quote: aiStock.quote } : null,
        },
      })
      setMessages((current) => [...current, {
        role: 'assistant',
        text: result.answer,
        suggestedPage: result.suggestedPage,
      }])
    } catch (requestError) {
      setError(requestError.message)
      setDraft(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={close} title={aiStock ? `Ask AI about ${aiStock.symbol}` : 'FinSense AI'} sub="Project help and beginner-friendly investing explanations" width="min(540px, calc(100vw - 24px))">
      {messages.length === 0 && <div className="ai-suggestions">
        <b>Quick questions</b>
        <p className="tiny muted">Choose a question to open the related page, or ask me below.</p>
        {QUICK_QUESTIONS.map((item) => <Button key={item.path} className="ai-suggestion" onClick={() => goToPage(item.path)}>{item.question}<Icon name="chart" size={15} /></Button>)}
      </div>}
      <div className="ai-messages" role="log" aria-live="polite" ref={log}>
        {messages.map((item, index) => <div key={`${item.role}-${index}`} className={`ai-message ${item.role === 'user' ? 'user' : ''}`}>
          <div className="tiny muted">{item.role === 'user' ? 'You' : 'FinSense AI'}</div>
          <p className="ai-answer">{item.text}</p>
          {item.suggestedPage && PAGE_LABELS[item.suggestedPage.path] && <Button className="sm" size="sm" onClick={() => goToPage(item.suggestedPage.path)}>Open {PAGE_LABELS[item.suggestedPage.path]} page</Button>}
        </div>)}
        {busy && <div className="ai-message"><div className="tiny muted">FinSense AI</div><p>Thinking…</p></div>}
      </div>
      {error && <p className="small down ai-error" role="alert">{error}</p>}
      <form className="ai-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="ai-message">Ask FinSense AI</label>
        <textarea id="ai-message" className="input" rows="2" maxLength="1500" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={aiStock ? `Ask about ${aiStock.symbol}…` : 'Ask about the project or investing basics…'} />
        <Button type="submit" variant="primary" disabled={busy || !draft.trim()} aria-label="Send message"><Icon name="message" size={17} /> Send</Button>
      </form>
      <p className="tiny muted ai-disclaimer">Messages are processed by Groq; do not share sensitive personal information. Educational information only, not financial advice. Quotes may be delayed or cached.</p>
    </Sheet>
  )
}
