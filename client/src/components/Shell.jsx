import { useRef, useLayoutEffect, useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../state/AppContext.jsx'
import { Button, Card, Sheet, Modal } from './ui.jsx'
import { Icon } from './Icon.jsx'
import StockSearch from './StockSearch.jsx'
import AIAssistant from './AIAssistant.jsx'

export const NAV = [
  { label: 'Learn', icon: 'book', path: '/' },
  { label: 'Budget', icon: 'wallet', path: '/budget' },
  { label: 'Behaviour', icon: 'brain', path: '/behaviour' },
  { label: 'Pre-Decision', icon: 'shield', path: '/pre-decision' },
]

export function Navbar() {
  const nav = useNavigate(), loc = useLocation(), { setPanel, theme, setTheme } = useApp()
  const wrap = useRef(null), hover = useRef(null)
  const [stocksOpen, setStocksOpen] = useState(false)
  const idx = Math.max(0, NAV.findIndex((n) => n.path === loc.pathname))
  const [pill, setPill] = useState({ left: 5, width: 0 })
  useLayoutEffect(() => {
    const place = () => { const b = wrap.current?.querySelectorAll('.nav-item')[idx]; if (b) setPill({ left: b.offsetLeft, width: b.offsetWidth }) }
    place(); window.addEventListener('resize', place); return () => window.removeEventListener('resize', place)
  }, [idx])
  const over = (e) => { const h = hover.current, b = e.currentTarget; if (!h) return; h.style.opacity = 1; h.style.left = b.offsetLeft - 6 + 'px'; h.style.width = b.offsetWidth + 12 + 'px' }
  return (
    <header className="nav-wrap">
      <button className="logo-btn" onClick={() => nav('/')} aria-label="Home"><span className="logo-dot"><Icon name="chart" size={17} /></span><span className="logo-word">FinSense</span></button>
      <nav className="nav-pill" ref={wrap} onMouseLeave={() => hover.current && (hover.current.style.opacity = 0)} aria-label="Main">
        <span className="active-pill" style={pill} />
        <span className="hover-lens" ref={hover} />
        {NAV.map((n, i) => (
          <button key={n.path} className={`nav-item ${i === idx ? 'active' : ''}`} onMouseEnter={over} onClick={() => nav(n.path)} aria-current={i === idx ? 'page' : undefined}>
            <span className="ic"><Icon name={n.icon} size={17} /></span>{n.label}
          </button>
        ))}
      </nav>
      <button className="theme-toggle nav-search" onClick={() => setStocksOpen(true)} aria-label="Open stock search" title="Search stocks"><Icon name="search" /></button>
      <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
      <button className="logo-btn" style={{ padding: 8 }} onClick={() => setPanel('tour')} aria-label="Replay welcome tour" title="Welcome tour"><span className="logo-dot"><Icon name="question" size={17} /></span></button>
      <StockSearch open={stocksOpen} onClose={() => setStocksOpen(false)} />
    </header>
  )
}

export function JourneyBar() {
  const loc = useLocation(), nav = useNavigate(), { done } = useApp()
  const steps = [{ k: 'learned', l: 'Learn', e: 'book', p: '/' }, { k: 'budgeted', l: 'Plan', e: 'wallet', p: '/budget' }, { k: 'profiled', l: 'Know yourself', e: 'brain', p: '/behaviour' }, { k: 'protected', l: 'Stay safe', e: 'shield', p: '/pre-decision' }]
  return (
    <div className="journey" aria-label="Your journey">
      {steps.map((s, i) => (
        <div key={s.k} style={{ display: 'contents' }}>
          {i > 0 && <div className={`j-line ${done[steps[i - 1].k] ? 'done' : ''}`}><i /></div>}
          <button className={`j-step ${done[s.k] ? 'done' : ''} ${loc.pathname === s.p ? 'here' : ''}`} onClick={() => nav(s.p)} title={`Go to ${s.l}`}>
            <div className="j-dot">{done[s.k] ? <Icon name="check" size={16} /> : <Icon name={s.e} size={16} />}</div><span>{s.l}</span>
          </button>
        </div>
      ))}
    </div>
  )
}

const SLIDES = [
  { e: 'book', t: 'Learn how money grows', d: 'Stocks, mutual funds, index funds and ETFs explained with simple animations. No jargon, no pressure.' },
  { e: 'wallet', t: 'Build a plan for your budget', d: 'Tell us how much you have. We split it across smart picks and show what happened in the past – including what happens if you choose wrong.' },
  { e: 'brain', t: 'Discover your money personality', d: 'Ten stressful, realistic situations reveal your biases – panic, FOMO, greed – before they cost you real money.' },
  { e: 'shield', t: 'Get a warning before you regret', d: 'Before you buy or sell, our engine compares your habits with market history and nudges you if the odds of regret are high.' },
]
export function Tour() {
  const { panel, setPanel, seeTour, tourSeen } = useApp()
  const [i, setI] = useState(0)
  const open = panel === 'tour' || !tourSeen
  const close = () => { seeTour(); setPanel(null); setI(0) }
  const s = SLIDES[i]
  return (
    <Modal open={open} onClose={close}>
      <div className="center col" style={{ alignItems: 'center', textAlign: 'center', minHeight: 330 }}>
        <div className="eyebrow">Welcome to FinSense · {i + 1} / {SLIDES.length}</div>
        <motion.div key={i} initial={{ scale: 0.3, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} style={{ margin: '10px 0', color: 'var(--gold)' }}><Icon name={s.e} size={72} /></motion.div>
        <motion.h2 key={'t' + i} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ fontSize: 28, fontWeight: 800 }}>{s.t}</motion.h2>
        <motion.p key={'d' + i} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 }} className="muted" style={{ maxWidth: 420 }}>{s.d}</motion.p>
        <div className="row" style={{ gap: 7, margin: '14px 0 4px' }}>{SLIDES.map((_, k) => <button key={k} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} style={{ width: k === i ? 26 : 8, height: 8, borderRadius: 9, border: 'none', background: k === i ? 'var(--blue)' : 'rgba(120,120,140,.3)', transition: 'all .4s var(--spring)' }} />)}</div>
        <div className="row" style={{ marginTop: 10 }}>
          <Button variant="ghost" onClick={close}>Skip</Button>
          {i > 0 && <Button onClick={() => setI(i - 1)}>Back</Button>}
          <Button variant="primary" onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : close())}>{i < SLIDES.length - 1 ? 'Next' : "Let's go"}</Button>
        </div>
        <p className="tiny faint" style={{ marginTop: 6 }}>All market data here is simulated for learning. Nothing is financial advice.</p>
      </div>
    </Modal>
  )
}

/** Per-page "what can I click here?" help content */
export const HELP = {
  '/': [
    ['Four type cards', 'Tap a card to open its lesson. Each type has 5 tabs: how it works, how to invest, a hands-on try-it, pros and cons, and FAQ.'],
    ['Animated diagram', 'Coins show where your money travels. Tap a step on the right to jump to it, or press ⏯ to pause.'],
    ['How to invest tab', 'A phone mock-up shows every screen you will see in a real investing app. Use Next/Back or tap the dots.'],
    ['Try it tab', 'Move the slider to see what your money buys. Press "Crash a company" to feel why diversification matters.'],
    ['Compare table', 'Click a column heading to open that investment type lesson.'],
    ['Market timeline', 'Hover the chart. Coloured bands are the simulated crash, recovery and bubble that the other modules use.'],
    ['Dotted words', 'Hover or tap any dotted-underline word to see its meaning. The Aa button opens the full glossary.'],
  ],
  '/budget': [
    ['Amount slider & presets', 'Choose how much you want to invest. Anything from ₹5,000 to ₹10 lakh works.'],
    ['Type chips', 'Pick one or more types. Leave all selected for a mixed plan.'],
    ['Risk style', 'Cautious avoids volatile assets, Adventurous allows a small speculative slice.'],
    ['Donut chart', 'Tap a slice or a holding to open its detail drawer with score breakdown, news and price history.'],
    ['Confidence ring', '0–100 = 70% performance + 30% news sentiment. Open an asset to see every factor.'],
    ['1Y / 2Y / 3Y tabs', 'Shows what this plan would have grown to in every past window of that length: best, typical and worst.'],
    ['What if you choose wrong?', 'Four classic mistakes tested on the same data, plus a Time Machine where you can pick any asset and any month.'],
  ],
  '/behaviour': [
    ['Pick a type', 'The scenarios use assets of the type you choose, so the test feels relevant.'],
    ['Pressure vs Calm mode', 'Pressure adds timers, alerts and crowd messages. Calm lets you think freely – compare both to see how stress changes you.'],
    ['Timer ring', 'When it runs out you "freeze" – which is also recorded.'],
    ['After each choice', 'We reveal what happened next and what the disciplined choice would have been.'],
    ['Results', 'Radar chart, your archetype, bias scores, a review of all 10 choices and coaching tips. Your profile feeds the Pre-Decision engine.'],
  ],
  '/pre-decision': [
    ['Presets', 'One tap loads a famous mistake (FOMO at the peak, panic in the crash) from the simulated history.'],
    ['Trade form', 'Pick an asset, Buy/Sell, amount and how you feel. Feelings change the risk – honesty helps.'],
    ['Regret gauge', 'The probability that you will wish you had not done it, with a four-part breakdown.'],
    ['Historical analogs', 'Bars show what happened 3 months after similar past situations.'],
    ['Ghost comparison', 'Compare acting now vs a more disciplined way, over many similar cases.'],
    ['Cooling-off timer', 'On risky trades the Proceed button unlocks only after a short pause.'],
    ['Your journal', 'Every decision is logged, with the money saved or missed by heeding nudges.'],
  ],
}

export function Dock() {
  const { setPanel, panel, glossary, setAIStock } = useApp()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const items = HELP[loc.pathname] || []
  const terms = useMemo(() => Object.values(glossary).filter(([t, d]) => (t + d).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a[0].localeCompare(b[0])), [glossary, q])
  return (
    <>
      <div className="dock">
        <Button className="icon" onClick={() => { setAIStock(null); setPanel('ai') }} aria-label="Chat with AI" title="Chat with AI"><Icon name="message" /></Button>
        <Button className="icon" onClick={() => setPanel('help')} aria-label="Explain this page" title="Explain this page"><Icon name="bulb" /></Button>
        <Button className="icon" onClick={() => setPanel('glossary')} aria-label="Open glossary" title="Glossary"><b>Aa</b></Button>
      </div>
      <Sheet open={panel === 'help'} onClose={() => setPanel(null)} title="What can I click here?" sub="A quick guide to every part of this page">
        <div className="col">
          {items.map(([t, d], i) => <Card key={t} className="pad-sm flat" style={{ animation: `pop .5s ${i * 0.05}s var(--spring) both` }}><b>{t}</b><p className="muted small">{d}</p></Card>)}
          <Button onClick={() => setPanel('tour')}><Icon name="play" size={16} /> Replay welcome tour</Button>
        </div>
      </Sheet>
      <Sheet open={panel === 'glossary'} onClose={() => setPanel(null)} title="Glossary" sub="Plain-English meanings">
        <input className="input" placeholder="Search a word…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Search glossary" />
        <div className="col">{terms.map(([t, d]) => <div key={t}><b>{t}</b><p className="muted small">{d}</p><div className="divider" /></div>)}{!terms.length && <p className="muted">No match.</p>}</div>
      </Sheet>
      <AIAssistant />
    </>
  )
}
