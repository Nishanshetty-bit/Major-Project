import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api, inr, pct, TYPE_META, PALETTE } from '../lib/api.js'
import { useApp } from '../state/AppContext.jsx'
import { useApi } from '../hooks/index.js'
import { Card, Button, Chip, Reveal, SectionHead, Segmented, InfoTip, Term, Sheet, Bar, ErrorBox, Loading, Confetti } from '../components/ui.jsx'
import { LineChart, Legend, Donut, Ring, Count, scoreColor, riskColor, Spark } from '../components/charts.jsx'
import { Icon, TYPE_ICON } from '../components/Icon.jsx'

const RISKS = [{ v: 'low', e: 'shield', t: 'Cautious', d: 'Smaller swings. Max 30% in one holding. No speculative picks.' }, { v: 'medium', e: 'scale', t: 'Balanced', d: 'A mix of steady and growth assets. Max 35% in one holding.' }, { v: 'high', e: 'chart', t: 'Adventurous', d: 'Accepts bigger swings for growth. Up to 40% per holding and a small speculative slice.' }]

function Analysing({ steps }) {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length)), 330); return () => clearInterval(t) }, [steps.length])
  return (
    <Card className="pad-lg col" style={{ maxWidth: 520, margin: '30px auto' }}>
      <div className="row"><div style={{ color: 'var(--gold)', animation: 'spin 1.6s linear infinite' }}><Icon name="settings" size={30} /></div><h3>Building your portfolio…</h3></div>
      {steps.map((s, k) => <motion.div key={k} initial={{ opacity: 0.3 }} animate={{ opacity: k <= i ? 1 : 0.3 }} className="row small"><span style={{ width: 22, height: 22, borderRadius: 11, display: 'grid', placeItems: 'center', background: k < i ? '#30d158' : 'rgba(120,120,140,.2)', color: '#fff', transition: 'all .4s var(--spring)', transform: k < i ? 'scale(1.1)' : 'none' }}>{k < i ? '✓' : ''}</span>{s}</motion.div>)}
    </Card>
  )
}

function AssetDrawer({ id, onClose }) {
  const { data } = useApi(id ? `/assets/${id}` : null, { enabled: !!id })
  const a = data
  return (
    <Sheet open={!!id} onClose={onClose} title={a?.name || 'Loading…'} sub={a ? `${TYPE_META[a.type].name} · ${a.sector}` : ''} width={520}>
      {!a ? <Loading /> : <div className="col">
        <p className="muted">{a.blurb}</p>
        <div className="row"><Ring value={a.confidence} size={74} color={scoreColor(a.confidence)} /><div><div className="bold">{a.verdict} · {a.confidence}/100 <InfoTip>{a.formula}. Open the bars below to see every ingredient.</InfoTip></div><div className="small muted">Performance {a.performance} · News {a.sentiment} ({a.sentimentLabel})</div></div></div>
        {a.flags.length > 0 && <div className="col" style={{ gap: 6 }}>{a.flags.map((f) => <Chip key={f} tone="orange"><Icon name="warning" size={14} /> {f}</Chip>)}</div>}
        <Card className="pad-sm flat"><LineChart key={a.id} series={[{ name: a.name, color: TYPE_META[a.type].color, values: a.history, fill: true }]} labels={a.labels} height={190} format={(v) => '₹' + Math.round(v)} animateKey={a.id} shaded={[{ from: 14, to: 16, label: '' }]} /></Card>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[['1Y', pct(a.metrics.return1Y, 0)], ['3Y / yr', pct(a.metrics.cagr3Y, 1)], ['Swings', a.metrics.volatility + '%'], ['Worst fall', a.metrics.maxDrawdown + '%'], ['RSI', a.metrics.rsi], ['Profit years', a.metrics.consistency + '%']].map(([l, v]) => <Card key={l} className="pad-sm flat center"><div className="tiny muted">{l}</div><b className="num">{v}</b></Card>)}
        </div>
        <h4>Why this score? <InfoTip>Each bar is points earned out of the maximum. Green = strong, red = weak.</InfoTip></h4>
        {a.factors.map((f) => <div key={f.name}><div className="row between small"><b>{f.name}</b><span className="num muted">{f.points} / {f.max}</span></div><Bar value={f.points} max={f.max} color={f.tone === 'good' ? '#30d158' : f.tone === 'bad' ? '#ff453a' : '#ff9f0a'} /><p className="tiny muted">{f.note}</p></div>)}
        <h4>Latest news (simulated) <InfoTip>A tiny language model scores each headline. Words like "record" or "probe" push the score up or down.</InfoTip></h4>
        {a.news.map((n) => <Card key={n.title} className="pad-sm flat"><div className="small bold">{n.title}</div><div className="row between tiny muted" style={{ marginTop: 4 }}><span>{n.source} · {n.when}</span><Chip tone={n.sentiment.label === 'Positive' ? 'green' : n.sentiment.label === 'Negative' ? 'red' : ''}>{n.sentiment.label} {n.sentiment.score > 0 ? '+' : ''}{n.sentiment.score}</Chip></div></Card>)}
      </div>}
    </Sheet>
  )
}

function Projection({ res, amount }) {
  const [y, setY] = useState(1)
  const p = res.projections[y]
  const labels = p.paths.labels
  return (
    <div className="col">
      <div className="row between wrap"><Segmented value={y} onChange={setY} options={[{ value: 1, label: '1 year' }, { value: 2, label: '2 years' }, { value: 3, label: '3 years' }]} /><span className="small muted">Back-tested on {p.windows} real windows of {y * 12} months · profitable in <b className={p.positivePct >= 70 ? 'up' : 'down'}>{p.positivePct}%</b></span></div>
      <Card className="pad col">
        <LineChart series={[{ name: 'Best period', color: '#30d158', values: p.paths.best }, { name: 'Typical (median)', color: '#0a84ff', values: p.paths.median, width: 4 }, { name: 'Worst period', color: '#ff453a', values: p.paths.worst }]} band={{ low: p.paths.worst, high: p.paths.best, color: 'rgba(10,132,255,.1)' }} labels={labels} height={300} baseline={amount} animateKey={`p${y}`} />
        <Legend items={[{ name: 'Best period', color: '#30d158' }, { name: 'Typical (median)', color: '#0a84ff' }, { name: 'Worst period', color: '#ff453a' }, { name: `Your ${inr(amount)}`, color: '#999' }]} />
      </Card>
      <div className="grid g3">
        { [['Worst case', p.worst, '#ff453a'], ['Typical', p.median, '#a77a12'], ['Best case', p.best, '#39845d']].map(([t, d, c]) => (
          <Card key={t} className="pad col" style={{ borderTop: `4px solid ${c}` }}><b>{t}</b><div className="num" style={{ fontSize: 28, fontWeight: 800 }}><Count value={d.value} format={(v) => inr(v)} /></div><div className={`bold small ${d.gain >= 0 ? 'up' : 'down'}`}>{d.gain >= 0 ? '+' : ''}{inr(d.gain)} ({pct((d.multiple - 1) * 100, 1)})</div><div className="tiny muted">If you started in {d.start}</div></Card>
        ))}
      </div>
    </div>
  )
}

function HorizonBars({ res }) {
  const rows = [1, 2, 3].map((y) => ({ y, w: (res.projections[y].worst.multiple - 1) * 100, m: (res.projections[y].median.multiple - 1) * 100, b: (res.projections[y].best.multiple - 1) * 100 }))
  const mx = Math.max(...rows.flatMap((r) => [Math.abs(r.w), r.m, r.b]), 1)
  return (
    <Card className="pad col">
      <div className="row between"><b>How the picture changes with time</b><InfoTip>Longer holding periods squeeze the gap between worst and best. This is "time diversification".</InfoTip></div>
      {rows.map((r) => (
        <div key={r.y} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 10, alignItems: 'center' }}>
          <b>{r.y} yr</b>
          <div className="col" style={{ gap: 5 }}>{[['Worst', r.w, '#ff453a'], ['Typical', r.m, '#0a84ff'], ['Best', r.b, '#30d158']].map(([l, v, c]) => <div key={l} className="row" style={{ gap: 8 }}><span className="tiny muted" style={{ width: 46 }}>{l}</span><div className="bar" style={{ flex: 1 }}><i style={{ width: `${Math.max(3, (Math.abs(v) / mx) * 100)}%`, '--c': c }} /></div><b className={`tiny num ${v >= 0 ? 'up' : 'down'}`} style={{ width: 54, textAlign: 'right' }}>{pct(v, 0)}</b></div>)}</div>
        </div>
      ))}
    </Card>
  )
}

function Mistakes({ list }) {
  const [id, setId] = useState(list[0].id)
  const m = list.find((x) => x.id === id)
  const labels = m.wrongPath.map((_, i) => (i === 0 ? m.startLabel : `+${i}m`))
  const worst = Math.min(...m.checkpoints.map((c) => c.wrong))
  return (
    <div className="col">
      <div className="tabs">{list.map((x) => <Chip key={x.id} className={`pick ${x.id === id ? 'on' : ''}`} onClick={() => setId(x.id)}><Icon name={x.emoji} size={14} /> {x.title}</Chip>)}</div>
      <AnimatePresence mode="wait">
        <motion.div key={id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid g2" style={{ alignItems: 'start' }}>
          <Card className="pad col">
            <div className="row between"><h3><Icon name={m.emoji} size={18} /> {m.title}</h3><Chip tone="red">{m.tag}</Chip></div>
            {m.story.map((s, i) => <motion.div key={i} initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 * i }} className="row" style={{ alignItems: 'flex-start' }}><span className="chip">{i + 1}</span><span className="muted">{s}</span></motion.div>)}
            <div className="glass pad-sm" style={{ background: 'rgba(255,69,58,.08)' }}><div className="tiny muted">Money lost along the way</div><div className="num down" style={{ fontSize: 32, fontWeight: 800 }}><Count value={Math.abs(m.loss)} format={(v) => '−' + inr(v)} /></div></div>
            <Card className="pad-sm flat"><Icon name="bulb" size={16} /> <b>Lesson:</b> <span className="muted">{m.lesson}</span></Card>
          </Card>
          <Card className="pad col">
            <LineChart key={id} series={[{ name: m.wrongLabel, color: '#ff453a', values: m.wrongPath }, { name: m.rightLabel, color: '#0a84ff', values: m.rightPath }]} labels={labels} height={230} animateKey={id} />
            <Legend items={[{ name: m.wrongLabel, color: '#ff453a' }, { name: m.rightLabel, color: '#0a84ff' }]} />
            <table className="t"><thead><tr><th></th><th>Wrong choice</th><th>Smart plan</th></tr></thead><tbody>{m.checkpoints.map((c) => <tr key={c.label}><td>{c.label}</td><td className={`num bold ${c.wrong < c.right ? 'down' : ''}`}>{inr(c.wrong)}</td><td className="num bold">{inr(c.right)}</td></tr>)}</tbody></table>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function TimeMachine({ amount, labels }) {
  const { data: assets } = useApi('/assets')
  const [aid, setAid] = useState('hypegreen')
  const [month, setMonth] = useState(32)
  const [r, setR] = useState(null)
  useEffect(() => {
    const t = setTimeout(() => api(`/time-machine?assetId=${aid}&month=${month}&amount=${amount}`).then(setR).catch(() => {}), 220)
    return () => clearTimeout(t)
  }, [aid, month, amount])
  const preset = (a, m) => { setAid(a); setMonth(m) }
  return (
    <Card className="pad col">
      <div className="row between wrap"><div><b style={{ fontSize: 18 }}>⏳ Time Machine</b><p className="muted small">Pick any asset and any month in the past. See what your {inr(amount)} would have become.</p></div>
        <div className="row wrap"><Chip className="pick" onClick={() => preset('hypegreen', 32)}><Icon name="chart" size={14} /> HypeGreen at the peak</Chip><Chip className="pick" onClick={() => preset('quantsmall', 13)}><Icon name="warning" size={14} /> Small-cap before crash</Chip><Chip className="pick" onClick={() => preset('nifty50idx', 5)}><Icon name="index" size={14} /> Nifty, early</Chip></div></div>
      <div className="grid g2">
        <div className="col"><label className="small bold">Asset</label><select className="input" value={aid} onChange={(e) => setAid(e.target.value)}>{assets?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="col"><label className="small bold">Buy in: <span style={{ color: 'var(--blue)' }}>{labels[month]}</span></label><input type="range" min="0" max="59" value={month} style={{ '--p': `${(month / 59) * 100}%` }} onChange={(e) => setMonth(+e.target.value)} aria-label="Month to invest" /></div>
      </div>
      {r && <div className="grid g2" style={{ alignItems: 'center' }}>
        <LineChart key={aid + month} series={[{ name: r.asset.name, color: r.gain >= 0 ? '#30d158' : '#ff453a', values: r.path, fill: true }]} labels={r.labels} height={220} baseline={amount} animateKey={aid + month} />
        <div className="col"><Chip tone={r.gain >= amount * 0.1 ? 'green' : r.gain >= -amount * 0.05 ? 'orange' : 'red'}>{r.verdict}</Chip>
          <div className="num" style={{ fontSize: 32, fontWeight: 800 }}>{inr(r.final)} <span className={`small ${r.gain >= 0 ? 'up' : 'down'}`}>{r.gain >= 0 ? '+' : ''}{inr(r.gain)}</span></div>
          <div className="small muted">Lowest point: <b>{inr(r.lowestValue)}</b> in {r.lowestMonth}</div>
          <Card className="pad-sm flat small">{r.note}</Card>
          <div className="row wrap">{r.checkpoints.map((c) => <Chip key={c.months}>+{c.months}m: {inr(c.value, true)}</Chip>)}</div></div>
      </div>}
    </Card>
  )
}

export default function Budget() {
  const { budget, setBudget, assetType, profile, markDone, toast } = useApp()
  const nav = useNavigate()
  const [amountInput, setAmountInput] = useState(String(budget.amount || 50000))
  const amount = Number(amountInput)
  const amountValid = Number.isSafeInteger(amount) && amount >= 5000 && amount <= 1000000
  const [types, setTypes] = useState(budget.types?.length ? budget.types : assetType ? [assetType] : [])
  const [risk, setRisk] = useState(profile?.suggestedRisk || budget.risk || 'medium')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(null)
  const [boom, setBoom] = useState(0)
  const out = useRef(null)
  const toggle = (t) => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))
  const STEPS = ['Scoring every asset (70% performance + 30% news)', 'Filtering by your risk style', 'Checking what your budget can buy', 'Balancing weights & diversification', 'Back-testing 1, 2 and 3-year windows']
  const build = async () => {
    setBusy(true); setErr(null); setRes(null); setBudget({ amount, types, risk })
    try {
      const [r] = await Promise.all([api('/allocate', { method: 'POST', body: { amount, types, risk } }), new Promise((ok) => setTimeout(ok, 1900))])
      setRes(r); markDone('budgeted'); setBoom((b) => b + 1); setOpen(null)
      setTimeout(() => out.current?.scrollIntoView({ behavior: 'smooth' }), 150)
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  const slices = useMemo(() => res?.holdings.map((h, i) => ({ id: h.id, value: h.pct, color: PALETTE[i % PALETTE.length] })) || [], [res])
  const [hover, setHover] = useState(null)
  const colorOf = (id) => slices.find((s) => s.id === id)?.color
  return (
    <>
      <SectionHead eyebrow="Module 2 · Budget-aware allocation" title="Turn your budget into a smart plan" sub="Choose an amount, the kinds of investments you like and your comfort with risk. We split your money, explain every choice, and show what would have happened in the past." />
      <Card className="pad-lg col">
        <div className="row between wrap"><b style={{ fontSize: 18 }}>1 · How much do you want to invest?</b><InfoTip>This is a one-time (lump sum) amount. Prices of shares are real-looking but simulated.</InfoTip></div>
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <div className="num" style={{ fontSize: 44, fontWeight: 800 }}>{amountValid ? <Count value={amount} format={(v) => inr(v)} /> : '—'}</div>
          <label className="col" style={{ marginLeft: 'auto', width: 'min(320px, 100%)' }}>
            <span className="tiny muted">Enter your amount in rupees</span>
            <input className="input" type="number" inputMode="numeric" min="5000" max="1000000" step="1" placeholder="e.g. 20,000" aria-label="Investment amount" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
          </label>
        </div>
        {!amountValid && <p className="tiny down" role="alert">Enter a whole amount between ₹5,000 and ₹10,00,000.</p>}
        <input type="range" min="5000" max="1000000" step="1" value={Math.min(Math.max(amount || 5000, 5000), 1000000)} style={{ '--p': `${(Math.min(Math.max(amount || 5000, 5000), 1000000) - 5000) / 995000 * 100}%` }} onChange={(e) => setAmountInput(e.target.value)} aria-label="Investment amount slider" />
        <div className="divider" />
        <div className="row between wrap"><b style={{ fontSize: 18 }}>2 · What kinds of investments?</b><span className="small muted">{types.length ? `${types.length} selected` : 'None selected = a mix of all four'}</span></div>
        <div className="grid g4">{Object.entries(TYPE_META).map(([k, m]) => <Card key={k} lift onClick={() => toggle(k)} selected={types.includes(k)} accent={m.color} className="pad-sm row" role="checkbox" aria-checked={types.includes(k)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && toggle(k)}><Icon name={TYPE_ICON[k]} size={24} /><div><b>{m.name}</b><div className="tiny muted">{types.includes(k) ? 'Included' : 'Tap to include'}</div></div></Card>)}</div>
        <div className="divider" />
        <b style={{ fontSize: 18 }}>3 · How do you handle ups and downs?</b>
        <div className="grid g3">{RISKS.map((r) => <Card key={r.v} lift onClick={() => setRisk(r.v)} selected={risk === r.v} className="pad-sm"><div className="row"><Icon name={r.e} size={24} /><b>{r.t}</b>{profile?.suggestedRisk === r.v && <Chip tone="purple">Suggested for you</Chip>}</div><p className="tiny muted" style={{ marginTop: 4 }}>{r.d}</p></Card>)}</div>
        {!profile && <p className="tiny muted"><Icon name="bulb" size={14} /> Tip: take the <button className="chip pick" onClick={() => nav('/behaviour')}>behaviour test</button> and we will suggest the right risk style for you.</p>}
        <Button variant="primary" size="lg" onClick={build} disabled={busy || !amountValid}>{busy ? 'Working…' : <><Icon name="spark" size={16} /> Build my portfolio</>}</Button>
      </Card>

      <ErrorBox error={err} onRetry={build} />
      {busy && <Analysing steps={STEPS} />}
      <Confetti fire={boom} />

      {res && !busy && (
        <div ref={out} style={{ scrollMarginTop: 90 }}>
          <section className="sec">
            <SectionHead eyebrow="Your plan" title={`${res.input.riskLabel} portfolio of ${inr(res.input.amount)}`} sub="Tap a slice or a holding to see exactly why it was picked." />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', alignItems: 'start' }}>
              <Card className="pad col" style={{ alignItems: 'center' }}>
                <Donut slices={slices} active={hover} onSelect={(id) => { setHover(id); setOpen(id) }} center={<div><div className="tiny muted">Holdings</div><div className="xl">{res.holdings.length}</div><div className="tiny muted">Spread score {res.diversificationScore}/100</div></div>} />
                <div className="row wrap center">{Object.entries(res.typeMix).filter(([, v]) => v).map(([k, v]) => <Chip key={k}><Icon name={TYPE_ICON[k]} size={14} /> {v}%</Chip>)}</div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', width: '100%', gap: 8 }}>
                  {[['Invested', inr(res.invested)], ['Cash left', inr(res.cashLeft)], ['Typical swings', res.stats.volatility + '%']].map(([l, v]) => <Card key={l} className="pad-sm flat center"><div className="tiny muted">{l}</div><b className="num small">{v}</b></Card>)}
                </div>
                <p className="tiny muted center">Cash left = money that cannot buy a whole share. Fund units can be fractional.</p>
              </Card>
              <div className="col">
                {res.holdings.map((h, i) => (
                  <Reveal key={h.id} delay={i * 0.05}>
                    <Card lift onClick={() => setOpen(h.id)} onMouseEnter={() => setHover(h.id)} onMouseLeave={() => setHover(null)} className="pad-sm" style={{ borderLeft: `6px solid ${colorOf(h.id)}` }}>
                      <div className="row"><Ring value={h.confidence} size={52} color={scoreColor(h.confidence)} />
                        <div style={{ flex: 1, minWidth: 0 }}><div className="row between"><b>{h.name}</b><b className="num">{h.pct}%</b></div>
                          <div className="row wrap" style={{ gap: 6, margin: '2px 0' }}><Chip><Icon name={TYPE_ICON[h.type]} size={14} /> {TYPE_META[h.type].short}</Chip><Chip tone={h.risk === 'High' ? 'red' : h.risk === 'Medium' ? 'orange' : 'green'}>{h.risk} risk</Chip><Chip tone={h.sentiment === 'Positive' ? 'green' : h.sentiment === 'Negative' ? 'red' : ''}>News: {h.sentiment}</Chip></div>
                          <div className="small muted">{inr(h.amount)} · {h.units} {h.unit} @ ₹{h.price}</div></div></div>
                      <p className="tiny muted" style={{ marginTop: 6 }}>{h.why}</p>
                    </Card>
                  </Reveal>
                ))}
              </div>
            </div>
            <Card className="pad col" style={{ marginTop: 16 }}>
              <details className="faq"><summary>How was this plan built?</summary><ol className="muted small" style={{ paddingLeft: 20, marginTop: 6 }}>{res.method.map((m) => <li key={m}>{m}</li>)}</ol></details>
              {res.excluded.length > 0 && <details className="faq"><summary>What we left out ({res.excluded.length}) and why</summary><div className="col" style={{ marginTop: 8 }}>{res.excluded.map((e) => <div key={e.id} className="small"><b>{e.name}:</b> <span className="muted">{e.reason}</span></div>)}</div></details>}
            </Card>
          </section>

          <section className="sec">
            <SectionHead eyebrow="Approximate profit from history" title="What would 1, 2 and 3 years have looked like?" sub={<>We replayed this exact mix through every possible start month in the simulated market (a <Term k="backtest">back-test</Term>). The past does not guarantee the future – but it shows the range of what can happen.</>} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
              <div style={{ gridColumn: 'span 2' }}><Projection res={res} amount={res.input.amount} /></div>
              <HorizonBars res={res} />
            </div>
            <Card className="pad col" style={{ marginTop: 16 }}>
              <b>Your plan vs the simulated market over 5 years</b>
              <LineChart series={[{ name: 'Your plan', color: '#0a84ff', values: res.history.portfolio, fill: true }, { name: 'Market index', color: '#9b9bb0', values: res.history.benchmark, dashed: true }]} labels={res.history.labels} height={260} baseline={res.input.amount} animateKey="hist" shaded={[{ from: 14, to: 16, label: 'Crash' }]} />
              <Legend items={[{ name: 'Your plan', color: '#0a84ff' }, { name: 'Market index', color: '#9b9bb0' }]} />
            </Card>
          </section>

          <section className="sec">
            <SectionHead eyebrow="Equally important" title="What if you choose wrong?" sub="Four classic mistakes, tested on the same history with the same money. Compare the damage with your smart plan." />
            <Mistakes list={res.mistakes} />
            <div style={{ height: 16 }} />
            <TimeMachine amount={res.input.amount} labels={res.history.labels} />
          </section>

          <section className="sec center col" style={{ alignItems: 'center' }}>
            <h2 className="h-section">Plans are easy. Sticking to them is hard.</h2>
            <p className="muted" style={{ maxWidth: 540 }}>Find out how you behave when the crash arrives and the alerts start buzzing.</p>
            <Button variant="primary" size="lg" onClick={() => nav('/behaviour')}><Icon name="brain" size={17} /> Take the behaviour test →</Button>
          </section>
        </div>
      )}
      <AssetDrawer id={open} onClose={() => setOpen(null)} />
    </>
  )
}
