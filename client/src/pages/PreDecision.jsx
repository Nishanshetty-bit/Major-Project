import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api, inr, pct, TYPE_META } from '../lib/api.js'
import { useApp } from '../state/AppContext.jsx'
import { useApi } from '../hooks/index.js'
import { Card, Button, Chip, SectionHead, Segmented, InfoTip, Term, Modal, Bar, ErrorBox, Confetti } from '../components/ui.jsx'
import { LineChart, Gauge, Ring, Count, scoreColor, riskColor } from '../components/charts.jsx'

const anonId = () => { try { let a = localStorage.getItem('bfs-anon'); if (!a) { a = 'anon_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('bfs-anon', a) } return a } catch { return 'anon_local' } }
const EMO_ICON = { calm: '😌', excited: '🤩', fearful: '😨', tip: '📱', angry: '😡', bored: '🥱' }

function Nudge({ r, open, onClose, onDecide, busy }) {
  const [left, setLeft] = useState(r?.nudge.cooling || 0)
  useEffect(() => { setLeft(r?.nudge.cooling || 0) }, [r?.id])
  useEffect(() => { if (!open || left <= 0) return; const t = setTimeout(() => setLeft((x) => x - 1), 1000); return () => clearTimeout(t) }, [open, left])
  if (!r) return null
  const n = r.nudge
  const col = riskColor(r.regret)
  return (
    <Modal open={open} onClose={onClose} dismissable={false}>
      <div className="col" style={{ gap: 14 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1, rotate: [0, -10, 10, -6, 0] }} transition={{ type: 'spring', delay: 0.1 }} style={{ fontSize: 46 }}>{r.level === 'High' ? '🚨' : r.level === 'Medium' ? '⚠️' : '✅'}</motion.div>
          <div><div className="eyebrow" style={{ color: col }}>Pre-decision check · {r.input.action === 'BUY' ? 'Buy' : 'Sell'} {r.asset.name}</div><h3 style={{ fontSize: 24, fontWeight: 800 }}>{n.title}</h3></div>
        </div>
        <p className="muted">{n.summary}</p>
        <Card className="pad-sm flat col" style={{ gap: 6 }}>{n.risks.slice(0, 3).map((x, i) => <motion.div key={i} initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 * i }} className="small row" style={{ alignItems: 'flex-start' }}><span style={{ color: col }}>●</span>{x}</motion.div>)}</Card>
        <div className="row between small"><span>Regret probability</span><b className="num" style={{ color: col, fontSize: 20 }}>{r.regret}%</b></div><Bar value={r.regret} color={col} />
        <div className="col" style={{ gap: 8 }}>
          <Button variant="primary" disabled={busy} onClick={() => onDecide('review')}>🔍 Review again – pause and think</Button>
          {n.options.find((o) => o.id === 'modify') && <Button variant="green" disabled={busy} onClick={() => onDecide('modify')}>{n.options.find((o) => o.id === 'modify').label} <span className="small" style={{ opacity: 0.85 }}>· {n.options.find((o) => o.id === 'modify').hint}</span></Button>}
          <Button disabled={busy || left > 0} onClick={() => onDecide('proceed')}>{left > 0 ? `Cooling-off… ${left}s` : 'Proceed anyway'}</Button>
        </div>
        {left > 0 && <p className="tiny muted center">Strong emotions fade in minutes. This short pause is deliberate.</p>}
      </div>
    </Modal>
  )
}

function Outcome({ o, r }) {
  const good = o.decision !== 'proceed' ? o.warningWasRight : !o.warningWasRight
  const labels = ['Decision', '+1 month', '+2 months', '+3 months']
  return (
    <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
      <Card className="pad-lg col" style={{ borderTop: `5px solid ${o.pnl >= 0 && o.decision === 'proceed' ? '#30d158' : o.decision === 'proceed' ? '#ff453a' : '#0a84ff'}` }}>
        <div className="eyebrow">What happened next · {o.real ? 'real replay of the simulated history' : 'simulated from similar past cases'}</div>
        <h3 style={{ fontSize: 26, fontWeight: 800 }}>{o.headline}</h3>
        <p className="muted">{o.detail}</p>
        <div className="grid g2" style={{ alignItems: 'center' }}>
          <LineChart series={[{ name: r.asset.name, color: o.forwardPct >= 0 ? '#30d158' : '#ff453a', values: o.path.map((v) => v), fill: true }]} labels={labels} height={200} format={(v) => v.toFixed(0) + '%'} baseline={0} animateKey={'o' + o.checkId} />
          <div className="col"><Chip tone="blue">{o.windowLabel}</Chip><div className="num" style={{ fontSize: 40, fontWeight: 800, color: o.forwardPct >= 0 ? '#1c9a3d' : '#e0352b' }}>{pct(o.forwardPct, 1)}</div><p className="small muted">{o.warningWasRight ? '🎯 The warning pointed the right way.' : '🎲 This time the warning was too cautious. A nudge is a probability – not a prophecy.'}</p></div>
        </div>
      </Card>
    </motion.div>
  )
}

export default function PreDecision() {
  const { profile, markDone, toast } = useApp()
  const nav = useNavigate()
  const pid = profile?.id || anonId()
  const { data: meta, error: merr, reload } = useApi('/intervention/presets')
  const { data: market } = useApi('/market')
  const [form, setForm] = useState({ assetId: 'tcs', action: 'BUY', amount: 20000, portfolioValue: 80000, emotion: 'calm', asOf: 60 })
  const [res, setRes] = useState(null)
  const [out, setOut] = useState(null)
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [journal, setJournal] = useState(null)
  const [boom, setBoom] = useState(0)
  const resRef = useRef(null)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const loadJournal = () => api(`/intervention/journal/${pid}`).then(setJournal).catch(() => {})
  useEffect(() => { loadJournal() }, [pid])
  const preset = (p) => { setForm({ assetId: p.assetId, action: p.action, amount: p.amount, portfolioValue: p.portfolioValue, emotion: p.emotion, asOf: p.asOf }); setRes(null); setOut(null); toast(`Loaded: ${p.title}`) }
  const check = async () => {
    setBusy(true); setErr(null); setOut(null)
    try {
      const r = await api('/intervention/check', { method: 'POST', body: { ...form, profileId: pid } })
      setRes(r); markDone('protected'); setModal(true)
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  const decide = async (decision) => {
    setBusy(true)
    try {
      const o = await api('/intervention/outcome', { method: 'POST', body: { checkId: res.id, decision } })
      setOut(o); setModal(false)
      if (decision === 'modify') set('amount', res.nudge.suggestedAmount)
      if ((decision !== 'proceed') && o.warningWasRight) setBoom((b) => b + 1)
      loadJournal(); setTimeout(() => resRef.current?.scrollIntoView({ behavior: 'smooth' }), 200)
    } catch (e) { setErr(e); setModal(false) } finally { setBusy(false) }
  }
  const asset = meta?.assets.find((a) => a.id === form.assetId)
  const labels = market?.labels
  const replay = form.asOf < 60
  return (
    <>
      <Confetti fire={boom} />
      <SectionHead eyebrow="Module 4 · Pre-decision intervention" title="A calm friend who speaks up before you click Buy" sub={<>We combine your behaviour fingerprint with what happened in similar past situations to estimate your <Term k="regret">regret probability</Term> – then deliver a <Term k="nudge">nudge</Term> while you can still change your mind.</>} />
      <ErrorBox error={merr || err} onRetry={merr ? reload : check} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', alignItems: 'start' }}>
        <Card className="pad-lg col">
          <div className="row between wrap"><b style={{ fontSize: 18 }}>Your intended trade</b>{profile ? <Chip tone="purple">{profile.archetype.emoji} {profile.archetype.name}</Chip> : <Chip tone="orange" onClick={() => nav('/behaviour')} style={{ cursor: 'pointer' }}>No fingerprint yet – take the test →</Chip>}</div>
          <div className="tiny muted">Quick scenarios from the simulated history:</div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>{meta?.presets.map((p) => <Card key={p.id} lift onClick={() => preset(p)} className="pad-sm"><div className="row"><span style={{ fontSize: 24 }}>{p.emoji}</span><b className="small">{p.title}</b></div><div className="tiny muted" style={{ marginTop: 3 }}>{p.text}</div><div className="tiny" style={{ color: 'var(--blue)', marginTop: 3 }}>{p.asOf === 60 ? 'Today' : p.asOfLabel}</div></Card>)}</div>
          <div className="divider" />
          <label className="small bold">Asset</label>
          <select className="input" value={form.assetId} onChange={(e) => set('assetId', e.target.value)}>{Object.keys(TYPE_META).map((t) => <optgroup key={t} label={TYPE_META[t].name}>{meta?.assets.filter((a) => a.type === t).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}</select>
          <div className="row between wrap"><Segmented value={form.action} onChange={(v) => set('action', v)} options={[{ value: 'BUY', label: '🟢 Buy' }, { value: 'SELL', label: '🔴 Sell' }]} /><InfoTip>Buying and selling trigger different biases: FOMO and greed when buying, panic and loss aversion when selling.</InfoTip></div>
          <div className="row between"><label className="small bold">Amount</label><b className="num">{inr(form.amount)}</b></div>
          <input type="range" min="500" max="200000" step="500" value={form.amount} style={{ '--p': `${(form.amount / 200000) * 100}%` }} onChange={(e) => set('amount', +e.target.value)} aria-label="Trade amount" />
          <div className="row between"><label className="small bold">Your total portfolio <InfoTip>Used to measure how big this trade is. Big bets raise regret risk.</InfoTip></label><b className="num">{inr(form.portfolioValue)}</b></div>
          <input type="range" min="5000" max="1000000" step="5000" value={form.portfolioValue} style={{ '--p': `${((form.portfolioValue - 5000) / 995000) * 100}%` }} onChange={(e) => set('portfolioValue', +e.target.value)} aria-label="Portfolio value" />
          <label className="small bold">How do you feel right now? <InfoTip>Be honest – emotions are the biggest driver of regret. Calm decisions lower the risk score.</InfoTip></label>
          <div className="row wrap">{meta?.emotions.map((e) => <Chip key={e.id} className={`pick ${form.emotion === e.id ? 'on' : ''}`} onClick={() => set('emotion', e.id)}>{EMO_ICON[e.id]} {e.label}</Chip>)}</div>
          <div className="row between"><label className="small bold">When? <InfoTip>Choose "Today" for current prices or slide back to replay a moment in the simulated past. For past dates you will see what actually happened next.</InfoTip></label><b style={{ color: replay ? 'var(--purple)' : 'var(--green)' }}>{replay ? `⏪ ${labels?.[form.asOf] || ''}` : '📍 Today'}</b></div>
          <input type="range" min="12" max="60" value={form.asOf} style={{ '--p': `${((form.asOf - 12) / 48) * 100}%` }} onChange={(e) => set('asOf', +e.target.value)} aria-label="Decision month" />
          <Button variant="primary" size="lg" onClick={check} disabled={busy}>{busy ? 'Analysing…' : '🔎 Check before I act'}</Button>
        </Card>

        <div ref={resRef} style={{ scrollMarginTop: 90 }} className="col">
          <AnimatePresence mode="wait">
            {!res ? <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Card className="pad-lg center col" style={{ alignItems: 'center', minHeight: 340, justifyContent: 'center' }}><div style={{ fontSize: 64, animation: 'floaty 5s infinite' }}>🛡️</div><h3>Set up a trade, then press Check</h3><p className="muted small" style={{ maxWidth: 360 }}>You will see a regret gauge, what happened in similar past situations, and calmer alternatives – before any money moves.</p></Card></motion.div>
              : <motion.div key={res.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="col">
                <Card className="pad-lg col"><div className="row between"><b>Regret probability <InfoTip>Chance you will wish you had not done this. 4 factors, weighted. Below 35% = low, 35–55% = medium, above = high.</InfoTip></b><Chip tone={res.level === 'High' ? 'red' : res.level === 'Medium' ? 'orange' : 'green'}>{res.level}</Chip></div>
                  <Gauge value={res.regret} />
                  {res.breakdown.map((b) => <div key={b.key}><div className="row between small"><b>{b.label} <span className="tiny muted">({b.weight}% weight)</span></b><span className="num">{b.score}</span></div><Bar value={b.score} color={riskColor(b.score)} /></div>)}
                  {!res.profileUsed && <p className="tiny muted">⚠ Using average bias levels. <button className="chip pick" onClick={() => nav('/behaviour')}>Take the behaviour test</button> for a personalised score.</p>}
                  <Button onClick={() => setModal(true)}>👁 Show the nudge again</Button></Card>
                <Card className="pad col"><b>{TYPE_META[res.asset.type].emoji} {res.asset.name} on {res.asOfLabel}</b>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>{[['Price', '₹' + res.asset.price], ['3M move', pct(res.asset.change3M, 0)], ['RSI', res.asset.rsi], ['Score', res.asset.confidence]].map(([l, v]) => <Card key={l} className="pad-sm flat center"><div className="tiny muted">{l === 'RSI' ? <Term k="rsi">RSI</Term> : l}</div><b className="num small">{v}</b></Card>)}</div></Card>
              </motion.div>}
          </AnimatePresence>
        </div>
      </div>

      {res && (
        <section className="sec">
          <SectionHead eyebrow="The evidence" title="What happened in similar situations before?" sub={`We found ${res.analog.n} similar moments in the simulated history and looked 3 months ahead.`} />
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <Card className="pad col"><div className="row between"><b>3-month outcomes after similar moves</b><Chip tone={res.analog.pNegative >= 50 ? 'red' : ''}>{res.analog.pNegative}% were lower</Chip></div>
              <div className="row" style={{ alignItems: 'flex-end', height: 170, gap: 8 }}>{res.analog.histogram.map((h, i) => <div key={h.label} className="col center" style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}><b className="tiny num">{h.pct}%</b><motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(3, h.pct * 2.2)}%` }} transition={{ delay: i * 0.06, type: 'spring' }} style={{ width: '100%', maxWidth: 40, borderRadius: 10, background: h.negative ? 'linear-gradient(#ff6b63,#ff453a)' : 'linear-gradient(#5be07f,#30d158)' }} /><span className="tiny muted center" style={{ fontSize: 10 }}>{h.label}</span></div>)}</div>
              <p className="tiny muted">Typical outcome <b>{pct(res.analog.median)}</b> · bad case (10th percentile) <b className="down">{pct(res.analog.p10)}</b> · good case <b className="up">{pct(res.analog.p90)}</b></p></Card>
            <Card className="pad col"><b>⚠️ Why we are flagging this</b>{res.nudge.risks.map((x, i) => <motion.div key={i} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="small row" style={{ alignItems: 'flex-start' }}><span className="chip">{i + 1}</span><span className="muted">{x}</span></motion.div>)}<p className="tiny muted">Feeling noted: <b>{res.nudge.emotion}</b></p></Card>
          </div>
          <Card className="pad col" style={{ marginTop: 16 }}><div className="row between wrap"><b>👻 Ghost comparison – the same {inr(res.input.amount)}, three ways</b><InfoTip>Each card shows the money value 3 months later across all {res.analog.n} similar cases: the typical result and the range from bad (10th percentile) to good (90th).</InfoTip></div>
            <div className="grid g3">{res.nudge.ghost.map((g) => { const lo = Math.min(...res.nudge.ghost.map((x) => x.p10)), hi = Math.max(...res.nudge.ghost.map((x) => x.p90)); const sp = hi - lo || 1; return (
              <Card key={g.id} className="pad col flat" style={{ outline: g.you ? '2px solid #ff9f0a' : g.plan ? '2px solid #30d158' : 'none' }}>{g.you && <Chip tone="orange">Your impulse</Chip>}{g.plan && <Chip tone="green">Disciplined</Chip>}{!g.you && !g.plan && <Chip>Alternative</Chip>}
                <b>{g.label}</b><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{inr(g.median)}</div><div className="tiny muted">typical value</div>
                <div style={{ position: 'relative', height: 12, borderRadius: 9, background: 'rgba(120,120,140,.18)' }}><motion.i initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: `${((g.p10 - lo) / sp) * 100}%`, width: `${Math.max(2, ((g.p90 - g.p10) / sp) * 100)}%`, borderRadius: 9, background: g.plan ? '#30d158' : g.you ? '#ff9f0a' : '#0a84ff' }} /><i style={{ position: 'absolute', top: -3, bottom: -3, width: 3, borderRadius: 2, background: '#111', left: `${((g.median - lo) / sp) * 100}%` }} /></div>
                <div className="row between tiny muted"><span>{inr(g.p10, true)}</span><span>{inr(g.p90, true)}</span></div></Card>) })}</div></Card>
          {out && <div style={{ marginTop: 16 }}><Outcome o={out} r={res} /></div>}
        </section>
      )}

      <section className="sec">
        <SectionHead eyebrow="Your decision journal" title="Regret you avoided" sub="Every check is logged so you can see how often nudges helped – and when they were too cautious." />
        <div className="grid g4">
          {[['🔔', 'Nudges shown', journal?.nudges ?? 0, (v) => Math.round(v)], ['🧘', 'You paused / changed', journal?.heededPct ?? 0, (v) => Math.round(v) + '%'], ['💰', 'Losses avoided', journal?.saved ?? 0, (v) => inr(v)], ['🎯', 'Warnings that were right', journal?.accuracyPct ?? 0, (v) => (journal?.accuracyPct == null ? '–' : Math.round(v) + '%')]].map(([e, l, v, f]) => <Card key={l} className="pad col"><div style={{ fontSize: 28 }}>{e}</div><div className="num" style={{ fontSize: 28, fontWeight: 800 }}><Count value={v} format={f} /></div><div className="small muted">{l}</div></Card>)}
        </div>
        <Card className="pad col" style={{ marginTop: 16 }}>
          {!journal?.entries.length ? <p className="muted center">No decisions yet. Run a check and choose what to do.</p> : journal.entries.slice(0, 8).map((e) => <div key={e.id} className="row between wrap small" style={{ padding: '6px 0', borderBottom: '1px solid rgba(60,60,90,.08)' }}><span><b>{e.action}</b> {e.asset} · {inr(e.amount)}</span><span className="row"><Chip tone={e.level === 'High' ? 'red' : e.level === 'Medium' ? 'orange' : 'green'}>{e.regret}% {e.level}</Chip><Chip>{e.decision}</Chip><b className={`num ${e.pnl >= 0 ? 'up' : 'down'}`}>{e.pnl >= 0 ? '+' : ''}{inr(e.pnl)}</b></span></div>)}
        </Card>
      </section>
      <Nudge r={res} open={modal} onClose={() => setModal(false)} onDecide={decide} busy={busy} />
    </>
  )
}
