import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useApi } from '../hooks/index.js'
import { useApp } from '../state/AppContext.jsx'
import { Card, Button, Chip, Reveal, ScrollSection, SectionHead, Segmented, Meter, InfoTip, Term, Loading, ErrorBox } from '../components/ui.jsx'
import { HowItWorks, InvestSteps, TryIt, CompareTable, Timeline } from '../components/explain.jsx'
import { LineChart } from '../components/charts.jsx'
import { api } from '../lib/api.js'
import { Icon, TYPE_ICON } from '../components/Icon.jsx'

const TABS = [{ value: 'how', label: 'How it works' }, { value: 'invest', label: 'How to invest' }, { value: 'try', label: 'Try it' }, { value: 'pros', label: 'Pros & cons' }, { value: 'faq', label: 'FAQ' }]

function Hero({ onStart, onTutorial, tutorialActive }) {
  const nav = useNavigate()
  const ref = useRef(null)
  const move = (e) => { const r = ref.current.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; ref.current.style.setProperty('--px', x); ref.current.style.setProperty('--py', y) }
  const f = (m) => ({ transform: `translate(calc(var(--px,0) * ${m}px), calc(var(--py,0) * ${m}px))`, transition: 'transform .3s ease-out' })
  return (
    <section ref={ref} onMouseMove={move} style={{ position: 'relative', textAlign: 'center', padding: '54px 0 30px' }}>
      <div className="hero-float" style={{ left: '4%', top: 40, '--r': '-8deg' }}><div style={f(30)}><Card className="pad-sm" style={{ borderRadius: 22 }}><div className="tiny muted">Nifty 50 Index</div><b className="up num">▲ +63% in 5 yrs</b></Card></div></div>
      <div className="hero-float" style={{ right: '3%', top: 90, '--r': '6deg', animationDelay: '-2s' }}><div style={f(-36)}><Card className="pad-sm" style={{ borderRadius: 22 }}><Icon name="brain" size={18} /> <b>Regret risk</b><div className="tiny muted">Panic sell · 78%</div></Card></div></div>
      <div className="hero-float" style={{ left: '9%', bottom: 10, color: 'var(--gold)', animationDelay: '-4s' }}><div style={f(-20)}><Icon name="coin" size={42} /></div></div>
      <div className="hero-float" style={{ right: '10%', bottom: 0, color: 'var(--gold)', animationDelay: '-1s' }}><div style={f(24)}><Icon name="chart" size={46} /></div></div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}><Chip tone="blue">Beginner friendly · demo scenarios preserved</Chip></motion.div>
      <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, type: 'spring' }} style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 'clamp(38px, 7vw, 74px)', fontWeight: 700, margin: '16px auto 14px', maxWidth: 900 }}><span className="grad-text">Personalized Stock Advisory</span><br />for Smarter Retail Investing</motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="muted" style={{ fontSize: 19, maxWidth: 640, margin: '0 auto 28px' }}>Learn how investments work, explore market evidence, and build a plan that fits your budget and comfort with risk.</motion.p>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="row center wrap">
        <Button variant="primary" size="lg" onClick={onStart}>Start learning ↓</Button>
        <Button size="lg" onClick={() => nav('/budget')}><Icon name="wallet" size={18} /> Build my plan</Button>
        <Button size="lg" variant={tutorialActive ? 'primary' : ''} onClick={onTutorial} aria-pressed={tutorialActive}><Icon name="question" size={18} /> Tutorial</Button>
      </motion.div>
      <div className="row center wrap" style={{ marginTop: 34, gap: 26 }}>{[['4', 'ways to invest'], ['19', 'simulated assets'], ['10', 'pressure tests'], ['1', 'regret engine']].map(([n, l], i) => <Reveal key={l} delay={0.5 + i * 0.1}><div><div className="xl grad-text">{n}</div><div className="small muted">{l}</div></div></Reveal>)}</div>
    </section>
  )
}

function TypeCard({ t, on, onPick, i }) {
  return (
    <Reveal delay={i * 0.08}>
      <Card as="button" lift className="type-card" selected={on} accent={t.color} onClick={() => onPick(t.id)} style={{ '--tint': t.color + '33' }} aria-pressed={on} aria-label={`Learn about ${t.title}`}>
        <div className="type-emoji"><Icon name={TYPE_ICON[t.id]} /></div>
        <h3 style={{ fontSize: 21, fontWeight: 800 }}>{t.title}</h3>
        <p className="muted small" style={{ margin: '4px 0 14px', minHeight: 40 }}>{t.tagline}</p>
        <div className="row between small"><span className="muted">Risk</span><Meter value={t.risk} color={t.color} /></div>
        <div className="row between small" style={{ marginTop: 6 }}><span className="muted">Cost</span><Meter value={t.cost} color={t.color} /></div>
        <div className="row between small" style={{ marginTop: 6 }}><span className="muted">Effort</span><Meter value={t.effort} color={t.color} /></div>
        <div className="row small bold" style={{ marginTop: 16, color: t.color }}>{on ? 'Now learning ↓' : 'Tap to learn →'}</div>
      </Card>
    </Reveal>
  )
}

function RealMarketPanel() {
  const { data } = useApi('/ml/market/assets')
  const [symbol, setSymbol] = useState('')
  useEffect(() => { if (!symbol && data?.assets?.[0]?.symbol) setSymbol(data.assets[0].symbol) }, [data, symbol])
  const [pred, setPred] = useState(null)
  const { data: history } = useApi(symbol ? `/ml/market/assets/${symbol}/history` : null)
  const [busy, setBusy] = useState(false)
  const [headline, setHeadline] = useState('')
  const [sentiment, setSentiment] = useState(null)
  const [news, setNews] = useState(null)
  const { data: newsProvider } = useApi('/news/status')
  const run = async () => { if (!symbol) return; setBusy(true); try { const [r, s, n] = await Promise.all([api('/ml/predict/returns', { method: 'POST', body: { symbol } }), headline.trim() ? api('/ml/sentiment/analyze', { method: 'POST', body: { text: headline } }) : Promise.resolve(null), api(`/news/latest?symbol=${encodeURIComponent(symbol)}&limit=6`)]); setPred(r); if (s) setSentiment(s); setNews(n) } finally { setBusy(false) } }
  const chosen = data?.assets?.find((a) => a.symbol === symbol)
  if (!data || data.status !== 'ok') return null
  return <ScrollSection><SectionHead eyebrow="Live ML analysis" title="Real market evidence" sub="Historical OHLCV data and model outputs are shown with their source and timestamp. Predictions are probabilities, not guarantees." />
    <Card className="pad-lg col"><div className="row between wrap"><div><Chip tone="green">Real historical data</Chip><span className="tiny muted"> · as of {new Date(data.asOf).toLocaleDateString()}</span></div><select className="input" style={{ maxWidth: 220 }} value={symbol} onChange={(e) => { setSymbol(e.target.value); setPred(null) }}>{data.assets.slice(0, 100).map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}</select></div>
      <div className="grid g3" style={{ marginTop: 14 }}><Card className="pad flat"><div className="tiny muted">Latest adjusted close</div><b className="num" style={{ fontSize: 24 }}>₹{chosen?.price?.toFixed(2)}</b><div className="tiny muted">{chosen?.asOf && new Date(chosen.asOf).toLocaleDateString()}</div></Card><Card className="pad flat"><div className="tiny muted">5-day positive return</div><b className="num" style={{ fontSize: 24 }}>{pred?.probabilities ? `${(pred.probabilities.positiveReturn5d * 100).toFixed(1)}%` : '—'}</b></Card><Card className="pad flat"><div className="tiny muted">20-day positive return</div><b className="num" style={{ fontSize: 24 }}>{pred?.probabilities ? `${(pred.probabilities.positiveReturn20d * 100).toFixed(1)}%` : '—'}</b></Card></div>
      {history?.history?.length > 1 && <LineChart series={[{ name: symbol, color: '#0a84ff', values: history.history.slice(-90).map((x) => x.adjustedClose), fill: true }]} labels={history.history.slice(-90).map((x) => new Date(x.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} height={220} format={(v) => `₹${Math.round(v)}`} />}
      <div className="row wrap" style={{ marginTop: 14 }}><input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Optional financial headline for FinBERT" style={{ flex: 1, minWidth: 260 }} /><Button variant="primary" onClick={run} disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Analysing…' : `Analyse ${symbol}`}</Button></div>{pred?.predictionTimestamp && <div className="tiny muted">Model timestamp: {new Date(pred.predictionTimestamp).toLocaleString()} · {pred.modelVersion || 'version unavailable'} · calibrated probabilities are shown only when validation supported calibration</div>}{pred?.modelMetadata && <div className="row wrap tiny muted">{Object.entries(pred.modelMetadata).map(([h, meta]) => <Chip key={h} tone={meta.calibration === 'sigmoid' ? 'green' : 'orange'}>{h}: {meta.modelName || 'model'} · {meta.calibration || 'uncalibrated'}</Chip>)}</div>}{sentiment?.status === 'ok' && <div className="small"><Chip tone={sentiment.sentiment === 'positive' ? 'green' : sentiment.sentiment === 'negative' ? 'red' : 'orange'}>FinBERT: {sentiment.sentiment} · {(sentiment.confidence * 100).toFixed(1)}% confidence</Chip></div>}
      {news?.status === 'unavailable' && <Card className="pad-sm flat small">{news.dataSource?.provider || newsProvider?.provider || 'Financial news provider'} is unavailable: {news.message}</Card>}
      {news?.status === 'ok' && <Card className="pad-sm flat col"><div className="row between wrap"><b>Real financial news</b><span className="tiny muted">{news.dataSource?.provider} · fetched {news.fetchedAt && new Date(news.fetchedAt).toLocaleTimeString()}</span></div><div className="tiny muted">Provider: {newsProvider?.provider || news.dataSource?.provider} · live availability checked on request.</div>{news.aggregate && <div className="row wrap"><Chip tone={news.aggregate.label === 'Positive' ? 'green' : news.aggregate.label === 'Negative' ? 'red' : 'orange'}>Aggregate: {news.aggregate.label} · {news.aggregate.supportingArticles} supporting articles</Chip><span className="tiny muted">{news.aggregate.latestArticleAt ? `Latest article ${new Date(news.aggregate.latestArticleAt).toLocaleString()} · ` : ''}Sentiment evidence only; not a return forecast.</span></div>}{news.articles?.length ? news.articles.map((article) => <div key={article.url || article.headline} className="row between wrap small"><div><a href={article.url} target="_blank" rel="noreferrer">{article.headline}</a><div className="tiny muted">{article.publisher} · {article.publishedAt ? new Date(article.publishedAt).toLocaleString() : 'publication time unavailable'} · {article.association?.company || symbol} ({article.association?.method}, {Math.round((article.association?.confidence || 0) * 100)}% match)</div></div>{article.sentiment && <div className="col" style={{ alignItems: 'flex-end', gap: 3 }}><Chip tone={article.sentiment.sentiment === 'positive' ? 'green' : article.sentiment.sentiment === 'negative' ? 'red' : 'orange'}>FinBERT: {article.sentiment.sentiment}</Chip><span className="tiny muted">Positive {(article.sentiment.positiveProbability * 100).toFixed(1)}% · Neutral {(article.sentiment.neutralProbability * 100).toFixed(1)}% · Negative {(article.sentiment.negativeProbability * 100).toFixed(1)}%</span></div>}</div>) : <span className="tiny muted">No confidently associated articles were returned.</span>}</Card>}
    </Card></ScrollSection>
}

function Explainer({ t, onTutorialStep }) {
  const [tab, setTab] = useState('how')
  const nav = useNavigate()
  const { setAssetType, setBudget, toast } = useApp()
  useEffect(() => setTab('how'), [t.id])
  return (
    <motion.div key={t.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', damping: 22 }}>
      <Card className="pad-lg col" style={{ '--accent': t.color }}>
        <div className="row between wrap">
          <div className="row"><div className="type-emoji" style={{ '--tint': t.color + '44', margin: 0 }}><Icon name={TYPE_ICON[t.id]} /></div><div><h2 style={{ fontSize: 30, fontWeight: 800 }}>{t.title}</h2><p className="muted">{t.tagline}</p></div></div>
          <Button variant="primary" onClick={() => { setAssetType(t.id); setBudget({ types: [t.id] }); toast(`Great – ${t.title} selected for your plan`); nav('/budget') }}>Invest in {t.title} →</Button>
        </div>
        <Card className="pad-sm flat" style={{ borderRadius: 20 }}><Icon name="bulb" size={17} /> <b>Think of it like this:</b> <span className="muted">{t.analogy}</span></Card>
        <div data-tutorial="lesson-tabs" onClick={onTutorialStep} style={{ overflowX: 'auto' }}><Segmented options={TABS} value={tab} onChange={setTab} /></div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            {tab === 'how' && <HowItWorks data={t} />}
            {tab === 'invest' && <InvestSteps data={t} />}
            {tab === 'try' && <TryIt data={t} />}
            {tab === 'pros' && (
              <div className="grid g2">
                <Card className="pad flat"><h3 className="up">Good things</h3><div className="col" style={{ marginTop: 10 }}>{t.pros.map((p, i) => <motion.div key={p} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className="row"><span className="chip green"><Icon name="check" size={13} /></span>{p}</motion.div>)}</div></Card>
                <Card className="pad flat"><h3 className="down">Watch out</h3><div className="col" style={{ marginTop: 10 }}>{t.cons.map((p, i) => <motion.div key={p} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className="row"><span className="chip red"><Icon name="warning" size={13} /></span>{p}</motion.div>)}</div></Card>
                <Card className="pad flat"><b><Icon name="target" size={16} /> Best for</b><p className="muted">{t.bestFor}</p><div className="divider" /><b>Minimum to start</b><p className="muted">{t.minAmount}</p></Card>
                <Card className="pad flat"><b>Example</b><p className="muted"><b>{t.example.name}:</b> {t.example.line}</p></Card>
              </div>)}
            {tab === 'faq' && (
              <div className="grid g2"><Card className="pad col flat">{t.faqs.map(([q, a]) => <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>)}</Card>
                <Card className="pad flat"><b>Myth buster</b>{t.myths.map(([m, a]) => <div key={m} style={{ marginTop: 8 }}><p className="down bold">{m}</p><p className="muted">{a}</p></div>)}</Card></div>)}
          </motion.div>
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

export default function Home() {
  const { data, error, reload } = useApi('/education')
  const { assetType, setAssetType, markDone, toast } = useApp()
  const [tutorialStep, setTutorialStep] = useState(-1)
  const [tutorialIdle, setTutorialIdle] = useState(false)
  const panelRef = useRef(null)
  const learnRef = useRef(null)
  const sel = data?.types.find((t) => t.id === assetType)
  const pick = (id) => {
    setAssetType(id)
    markDone('learned')
    if (tutorialStep === 0) setTutorialStep(1)
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
  }
  useEffect(() => {
    if (tutorialStep < 0) return undefined
    const selectors = ['[data-tutorial="lesson-cards"]', '[data-tutorial="lesson-tabs"]', '[data-tutorial="compare-section"]', '[data-tutorial="compare-section"]']
    const selector = selectors[tutorialStep]
    const target = selector ? document.querySelector(selector) : null
    target?.classList.add('tutorial-highlight')
    if (tutorialStep < 2) target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    let idleTimer
    const resetIdle = () => {
      setTutorialIdle(false)
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => setTutorialIdle(true), 5000)
    }
    const advanceOnScroll = () => {
      const compare = document.querySelector('[data-tutorial="compare-section"]')
      if (compare && compare.getBoundingClientRect().top < window.innerHeight * 0.85) setTutorialStep(3)
    }
    const onScroll = () => { resetIdle(); if (tutorialStep === 2) advanceOnScroll() }
    window.addEventListener('pointerdown', resetIdle)
    window.addEventListener('keydown', resetIdle)
    window.addEventListener('wheel', resetIdle, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    resetIdle()
    return () => {
      target?.classList.remove('tutorial-highlight')
      window.clearTimeout(idleTimer)
      window.removeEventListener('pointerdown', resetIdle)
      window.removeEventListener('keydown', resetIdle)
      window.removeEventListener('wheel', resetIdle)
      window.removeEventListener('scroll', onScroll)
    }
  }, [tutorialStep, data])
  const tutorialMessages = [
    'Choose any investment type to open its lesson.',
    'Pick a lesson tab to explore how it works, how to invest, and more.',
    'Scroll down to compare the four investment types.',
    'You reached the comparison. Click a column heading to open that lesson.',
  ]
  return (
    <>
      <Hero onStart={() => learnRef.current?.scrollIntoView({ behavior: 'smooth' })} tutorialActive={tutorialStep >= 0} onTutorial={() => setTutorialStep(tutorialStep < 0 ? 0 : -1)} />
      <div className="center tiny muted" style={{ marginTop: 8 }}><Chip tone="orange">Simulated demonstration data</Chip></div>
      <RealMarketPanel />
      <ErrorBox error={error} onRetry={reload} />
      <ScrollSection ref={learnRef} className="learn-content" style={{ marginTop: 40 }}>
        <SectionHead eyebrow="Module 1 · Explainable investing" title="Four ways to grow your money" sub="Tap any card. Each has an animated diagram of where your money goes, a phone walkthrough of how to start, and a hands-on playground." />
        {!data && !error && <Loading rows={1} h={260} />}
        {data && <div className="grid g4" data-tutorial="lesson-cards">{data.types.map((t, i) => <TypeCard key={t.id} t={t} i={i} on={t.id === assetType} onPick={pick} />)}</div>}
        <div ref={panelRef} style={{ scrollMarginTop: 90, marginTop: 24 }}>
          <AnimatePresence mode="wait">{sel ? <Explainer key={sel.id} t={sel} onTutorialStep={tutorialStep === 1 ? () => setTutorialStep(2) : undefined} /> : data && <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="center muted" style={{ padding: 24 }}><Icon name="target" size={16} /> Pick a card to see exactly how it works.</motion.div>}</AnimatePresence>
        </div>
      </ScrollSection>

      {data && <ScrollSection data-tutorial="compare-section"><SectionHead eyebrow="Side by side" title="Compare all four" sub={<>Bars show <Term k="volatility">risk</Term>, cost, effort, <Term k="diversification">diversification</Term> and <Term k="liquidity">sell speed</Term>. Click a column heading to open that lesson.</>} />
        <CompareTable types={data.types} compare={data.compare} selected={assetType} onPick={pick} /></ScrollSection>}

      <ScrollSection><SectionHead eyebrow="Learn from history" title="The simulated market's story" sub="Crashes and bubbles are normal. This 5-year fake market contains both – the rest of the app uses them to test your plan and your nerves." /><Timeline /></ScrollSection>

      <ScrollSection><SectionHead center eyebrow="Your journey" title="Ready for the next step?" />
        <div className="grid g3">
          {[[ 'wallet', 'Budget plan', 'Turn your amount into a diversified portfolio and see 1, 2 and 3-year back-tests.', '/budget'], ['brain', 'Behaviour test', '10 pressure scenarios reveal how you really act under stress.', '/behaviour'], ['shield', 'Pre-decision shield', 'Get a regret warning before buying or selling.', '/pre-decision']].map(([e, t, d, p], i) => <Link3 key={p} {...{ e, t, d, p, i }} />)}
        </div></ScrollSection>
      {tutorialStep >= 0 && <aside className="tutorial-guide" role="status" aria-live="polite">
        <div className="row between"><b>Tutorial · {tutorialStep === 3 ? 'Complete' : `Step ${tutorialStep + 1} of 3`}</b><button className="tutorial-close" onClick={() => setTutorialStep(-1)} aria-label="End tutorial">×</button></div>
        <p>{tutorialIdle && tutorialStep < 3 ? (tutorialStep === 2 ? 'Whenever you are ready, scroll down to continue.' : 'Whenever you are ready, follow the highlighted area.') : tutorialMessages[tutorialStep]}</p>
        {tutorialStep === 3 && <Button size="sm" className="sm" onClick={() => setTutorialStep(-1)}>Finish tutorial</Button>}
      </aside>}
    </>
  )
}
function Link3({ e, t, d, p, i }) {
  const nav = useNavigate()
  return <Reveal delay={i * 0.1}><Card lift onClick={() => nav(p)} className="pad col"><div style={{ color: 'var(--gold)' }}><Icon name={e} size={32} /></div><h3>{t}</h3><p className="muted small">{d}</p><b className="small" style={{ color: 'var(--blue)' }}>Open →</b></Card></Reveal>
}
