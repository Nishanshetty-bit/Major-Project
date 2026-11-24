import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api, inr, TYPE_META } from '../lib/api.js'
import { useApp } from '../state/AppContext.jsx'
import { Card, Button, Chip, SectionHead, Segmented, InfoTip, Term, Bar, ErrorBox, Confetti } from '../components/ui.jsx'
import { LineChart, Radar, Ring, Count, scoreColor } from '../components/charts.jsx'

const APP_ICON = { TradeApp: '📊', WhatsApp: '💬', Instagram: '📸', News: '📰', Mom: '📞', 'X (Twitter)': '🐦', YouTube: '▶️', Bank: '🏦', Notes: '📝', FinWire: '📰' }
const LETTERS = ['A', 'B', 'C']

function Ticker({ s, elapsed, secs }) {
  const [pts, setPts] = useState([s.chart.from])
  const last = useRef(0)
  useEffect(() => {
    const dur = secs || 12
    const p = Math.min(1, elapsed / dur)
    const amp = Math.abs(s.chart.to - s.chart.from) * 0.12 + 0.6
    const v = s.chart.from + (s.chart.to - s.chart.from) * (1 - Math.pow(1 - p, 2)) + Math.sin(elapsed * 9) * amp * 0.5 + Math.sin(elapsed * 23) * amp * 0.3
    if (elapsed - last.current >= 0.2) { last.current = elapsed; setPts((a) => [...a.slice(-59), v]) }
  }, [elapsed])
  const mn = Math.min(...pts), mx = Math.max(...pts), cur = pts[pts.length - 1]
  const W = 360, H = 120
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / 59) * W} ${H - 8 - ((v - mn) / (mx - mn || 1)) * (H - 16)}`).join(' ')
  const chg = ((cur - s.chart.from) / s.chart.from) * 100
  const up = chg >= 0
  return (
    <div>
      <div className="row between"><div><div className="tiny muted">{s.assetName}</div><div className="num" style={{ fontSize: 30, fontWeight: 800, color: up ? '#1c9a3d' : '#e0352b', transition: 'color .3s' }}>₹{((s.chart.startPrice * cur) / 100).toFixed(s.chart.startPrice < 100 ? 2 : 0)}</div></div>
        <Chip tone={up ? 'green' : 'red'}>{up ? '▲' : '▼'} {chg.toFixed(1)}%</Chip></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}><path d={d} fill="none" stroke={up ? '#30d158' : '#ff453a'} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /><circle cx={((pts.length - 1) / 59) * W} cy={H - 8 - ((cur - mn) / (mx - mn || 1)) * (H - 16)} r="5" fill={up ? '#30d158' : '#ff453a'}><animate attributeName="r" values="4;8;4" dur="1s" repeatCount="indefinite" /></circle></svg>
    </div>
  )
}

function TimerRing({ left, total }) {
  const f = total ? left / total : 1
  const c = 2 * Math.PI * 30
  const col = f > 0.5 ? '#30d158' : f > 0.25 ? '#ff9f0a' : '#ff453a'
  return (
    <div style={{ position: 'relative', width: 74, height: 74, flex: 'none' }} className={f < 0.25 ? 'heart' : ''} aria-label={`${Math.ceil(left)} seconds left`} role="timer">
      <svg className="timer-ring" viewBox="0 0 74 74" style={{ transform: 'rotate(-90deg)' }}><circle cx="37" cy="37" r="30" fill="none" stroke="rgba(120,120,140,.2)" strokeWidth="7" /><circle cx="37" cy="37" r="30" fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${f * c} ${c}`} style={{ transition: 'stroke .3s' }} /></svg>
      <div className="num" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22, color: col }}>{Math.ceil(left)}</div>
    </div>
  )
}

function Play({ s, idx, total, mode, onAnswer }) {
  const [elapsed, setElapsed] = useState(0)
  const t0 = useRef(performance.now())
  const done = useRef(false)
  const timed = mode === 'pressure' && s.seconds > 0
  const answer = useCallback((optionId, timedOut = false) => {
    if (done.current) return
    done.current = true
    onAnswer({ scenarioId: s.id, optionId, timeMs: Math.round(performance.now() - t0.current), timedOut })
  }, [s.id, onAnswer])
  useEffect(() => {
    const id = setInterval(() => {
      const e = (performance.now() - t0.current) / 1000
      setElapsed(e)
      if (timed && e >= s.seconds) answer(null, true)
    }, 100)
    return () => clearInterval(id)
  }, [timed, s.seconds, answer])
  useEffect(() => {
    const k = (e) => { const i = ['a', 'b', 'c'].indexOf(e.key.toLowerCase()); if (i >= 0 && s.options[i]) answer(s.options[i].id) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [s, answer])
  const left = timed ? Math.max(0, s.seconds - elapsed) : 0
  const frac = timed ? left / s.seconds : 1
  const stress = timed ? 1 - frac : 0
  const alerts = s.alerts.map((a, i) => ({ ...a, i })).filter((a) => (timed ? elapsed >= a.at && elapsed < a.at + 5.5 : true))
  const chat = s.chat.filter((c) => (timed ? elapsed >= c.at : true))
  const crowd = s.crowdPct ? Math.min(s.crowdPct, Math.round(s.crowdPct * Math.min(1, elapsed / 6 + (timed ? 0 : 1)))) : null
  const bpm = 1.2 - stress * 0.75
  return (
    <div className={`stage ${timed && frac < 0.3 ? 'shake' : ''}`} style={{ '--bpm': `${bpm}s` }}>
      {timed && <div className="vignette" style={{ '--v': stress > 0.5 ? (stress - 0.5) * 0.9 : 0 }} />}
      {timed && <div className="notif-stack" aria-live="assertive">{alerts.map((a) => <div key={a.i} className={`notif ${a.tone}`}><div className="app">{APP_ICON[a.app] || '🔔'}</div><div style={{ minWidth: 0 }}><div className="row between tiny muted"><b>{a.app}</b><span>now</span></div><div className="small bold">{a.title}</div><div className="small muted">{a.body}</div></div></div>)}</div>}
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 5 }}>{Array.from({ length: total }, (_, i) => <i key={i} style={{ width: i === idx ? 26 : 9, height: 9, borderRadius: 9, background: i < idx ? '#30d158' : i === idx ? 'var(--blue)' : 'rgba(120,120,140,.25)', transition: 'all .4s var(--spring)' }} />)}</div>
        <span className="small muted">Scenario {idx + 1} / {total} {timed && <span className="heart" style={{ marginLeft: 6 }}>❤️</span>}</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', alignItems: 'start' }}>
        <div className="col">
          <Card className="pad col"><div className="row between"><b>📱 Your trading app</b><Chip tone={timed ? 'red' : ''}>{timed ? '● LIVE' : 'Paused'}</Chip></div><Ticker s={s} elapsed={elapsed} secs={s.seconds} />
            {crowd !== null && <div><div className="row between tiny"><b>Crowd sentiment</b><b className="num">{crowd}% buying</b></div><Bar value={crowd} color="#ff9f0a" /></div>}</Card>
          <Card className="pad col"><b>{s.id === 6 || s.id === 3 ? '👥 Group chat' : '💬 Messages & thoughts'}</b>
            <div className="chatbox">{chat.map((c, i) => <div key={i} className="bubble"><b>{c.name}</b>{c.text}</div>)}{!chat.length && <span className="tiny faint">…waiting for messages</span>}</div></Card>
          {!timed && <Card className="pad col"><b>🔔 Notifications you received</b>{alerts.map((a) => <div key={a.i} className="small"><b>{a.app}:</b> {a.title} – <span className="muted">{a.body}</span></div>)}</Card>}
        </div>
        <div className="col">
          <Card className="pad col" style={{ borderTop: `4px solid ${timed && frac < 0.3 ? '#ff453a' : 'var(--blue)'}` }}>
            <div className="row" style={{ alignItems: 'flex-start' }}><div style={{ fontSize: 44 }}>{s.emoji}</div><div style={{ flex: 1 }}><div className="eyebrow">{s.title}</div><p style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{s.story}</p></div>{timed ? <TimerRing left={left} total={s.seconds} /> : null}</div>
            <p className="muted bold">{s.question}</p>
            {!timed && <p className="tiny muted">Calm mode: take your time. There is no timer and no notification noise.</p>}
          </Card>
          <div className="col" style={{ gap: 10 }}>{s.options.map((o, i) => <button key={o.id} className="opt" onClick={() => answer(o.id)}><span className="letter">{LETTERS[i]}</span><span><b>{o.label}</b><br /><span className="small muted">{o.sub}</span></span></button>)}</div>
          <p className="tiny faint center">Tip: press A, B or C on your keyboard</p>
        </div>
      </div>
    </div>
  )
}

function Reveal({ s, ans, onNext, last }) {
  const o = s.options.find((x) => x.id === ans.optionId)
  const best = s.options.find((x) => x.best)
  const good = o && o.best
  const vals = [s.chart.from, ...s.chart.after]
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="grid g2" style={{ alignItems: 'start' }}>
      <Card className="pad col" style={{ borderTop: `4px solid ${good ? '#30d158' : o ? '#ff9f0a' : '#8e8e93'}` }}>
        <div className="eyebrow">What happened next</div>
        <h3>{ans.timedOut ? '🥶 You froze – time ran out' : good ? '✅ Disciplined choice!' : '🤔 Let us look at that'}</h3>
        {o && <p><b>You chose:</b> {o.label}</p>}
        <Card className="pad-sm flat">{o ? o.outcome : 'You did nothing. In real markets, freezing is also a decision – sometimes useful (crash), sometimes costly (a good opportunity).'}</Card>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Card className="pad-sm flat center"><div className="tiny muted">Your result on ₹50,000</div><b className={`num ${o && o.pnl < 0 ? 'down' : 'up'}`} style={{ fontSize: 22 }}>{o ? (o.pnl >= 0 ? '+' : '') + inr(o.pnl) : '₹0'}</b></Card>
          <Card className="pad-sm flat center"><div className="tiny muted">Disciplined choice</div><b className={`num ${best.pnl < 0 ? 'down' : 'up'}`} style={{ fontSize: 22 }}>{best.pnl >= 0 ? '+' : ''}{inr(best.pnl)}</b></Card>
        </div>
        {!good && <p className="small muted">The disciplined choice was: <b>{best.label}</b></p>}
        <Card className="pad-sm flat">💡 <b>Lesson:</b> <span className="muted">{s.lesson}</span></Card>
        <Button variant="primary" onClick={onNext}>{last ? 'See my fingerprint 🧬' : 'Next scenario →'}</Button>
      </Card>
      <Card className="pad col"><b>The price path afterwards</b><LineChart key={s.id} series={[{ name: s.assetName, color: vals[vals.length - 1] >= vals[0] ? '#30d158' : '#ff453a', values: vals, fill: true }]} labels={['Before', 'Decision', 'Day 3', 'Week 1', 'Month 1', 'Month 3']} height={230} format={(v) => v.toFixed(0)} baseline={vals[0]} animateKey={'r' + s.id} /><p className="tiny muted">Index 100 = price before the event. Bias being tested: <b>{s.biasLabel}</b>.</p></Card>
    </motion.div>
  )
}

function Results({ p, onRetake }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(null)
  const axes = p.biasList.map((b) => ({ label: b.label.split(' ')[0], value: b.score }))
  const lvlColor = p.eligibility >= 75 ? '#30d158' : p.eligibility >= 55 ? '#ff9f0a' : '#ff453a'
  return (
    <div className="col" style={{ gap: 20 }}>
      <Card className="pad-lg center col" style={{ alignItems: 'center', background: 'linear-gradient(135deg,rgba(10,132,255,.14),rgba(191,90,242,.14))' }}>
        <div className="eyebrow">Your behavioural fingerprint</div>
        <motion.div initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 10 }} style={{ fontSize: 84 }}>{p.archetype.emoji}</motion.div>
        <h2 style={{ fontSize: 36, fontWeight: 800 }} className="grad-text">{p.archetype.name}</h2>
        <p className="muted" style={{ maxWidth: 520 }}>{p.archetype.text}</p>
        <div className="row wrap center"><Chip tone="blue">Decision quality {p.decisionQuality}%</Chip><Chip tone={p.freezes ? 'orange' : ''}>{p.freezes} freezes</Chip><Chip>Avg. reaction {p.avgResponseSec}s</Chip></div>
      </Card>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card className="pad col"><b>Bias radar <InfoTip>Further from the centre = stronger bias. Each score is 0–100.</InfoTip></b><Radar axes={axes} /></Card>
        <Card className="pad col"><b>Your biases, ranked</b>
          {p.biasList.map((b, i) => <div key={b.key}><div className="row between small"><b>{b.label} <InfoTip>{b.meaning}</InfoTip></b><span><Chip tone={b.level === 'High' ? 'red' : b.level === 'Moderate' ? 'orange' : 'green'}>{b.level}</Chip> <b className="num">{b.score}</b></span></div><Bar value={b.score} color={b.level === 'High' ? '#ff453a' : b.level === 'Moderate' ? '#ff9f0a' : '#30d158'} /></div>)}</Card>
      </div>
      <div className="grid g3">
        <Card className="pad row"><Ring value={p.eligibility} size={80} color={lvlColor} /><div><div className="tiny muted">Investor readiness</div><b style={{ fontSize: 18, color: lvlColor }}>{p.level}</b></div></Card>
        <Card className="pad col"><div className="tiny muted">Your 10 choices vs disciplined ones <InfoTip>Sum of results on a ₹50,000 stake in each scenario.</InfoTip></div><div className="row between"><b className={`num ${p.totalPnl < 0 ? 'down' : 'up'}`} style={{ fontSize: 24 }}>{p.totalPnl >= 0 ? '+' : ''}{inr(p.totalPnl)}</b><span className="muted">vs</span><b className="num up" style={{ fontSize: 24 }}>{p.bestPnl >= 0 ? '+' : ''}{inr(p.bestPnl)}</b></div><div className="tiny muted">Behaviour cost you about <b>{inr(Math.max(0, p.bestPnl - p.totalPnl))}</b></div></Card>
        <Card className="pad col"><div className="tiny muted">Suggested mix for you</div><div className="row wrap">{Object.entries(p.suggestedMix).map(([k, v]) => <Chip key={k}>{TYPE_META[k].emoji} {v}%</Chip>)}</div><div className="tiny muted">Risk style: <b>{p.suggestedRisk}</b></div></Card>
      </div>
      <Card className="pad col"><b>🧑‍🏫 Your personal coaching plan</b>{p.tips.map((t, i) => <motion.div key={t} initial={{ x: -14, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 * i }} className="row" style={{ alignItems: 'flex-start' }}><span className="chip blue">{i + 1}</span><span className="muted">{t}</span></motion.div>)}</Card>
      <Card className="pad col"><b>Scenario-by-scenario review</b>
        {p.review.map((r) => <div key={r.scenarioId}><button className="row between" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: '6px 0' }} onClick={() => setOpen(open === r.scenarioId ? null : r.scenarioId)}><span className="row"><span style={{ fontSize: 22 }}>{r.emoji}</span><b>{r.title}</b></span><span className="row"><Chip tone={r.quality >= 80 ? 'green' : r.quality >= 40 ? 'orange' : 'red'}>{r.timedOut ? 'Froze' : r.quality >= 80 ? 'Disciplined' : r.quality >= 40 ? 'Mixed' : 'Biased'}</Chip><span>{open === r.scenarioId ? '−' : '+'}</span></span></button>
          <AnimatePresence initial={false}>{open === r.scenarioId && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}><div className="small muted" style={{ padding: '4px 0 10px 32px' }}>You chose: <b>{r.chosen}</b> ({r.seconds}s)<br />Disciplined: <b>{r.bestLabel}</b><br />Bias tested: {r.bias}</div></motion.div>}</AnimatePresence><div className="divider" style={{ margin: 4 }} /></div>)}</Card>
      <div className="row center wrap"><Button onClick={onRetake}>↻ Retake</Button><Button variant="primary" onClick={() => nav('/budget')}>💼 Build a plan for my personality</Button><Button variant="green" onClick={() => nav('/pre-decision')}>🛡️ Protect my decisions →</Button></div>
    </div>
  )
}

export default function Behaviour() {
  const { assetType, profile, setProfile, markDone, toast } = useApp()
  const [type, setType] = useState(assetType || 'stock')
  const [mode, setMode] = useState('pressure')
  const [phase, setPhase] = useState(profile ? 'result' : 'intro')
  const [scenarios, setScn] = useState([])
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState([])
  const [err, setErr] = useState(null)
  const [boom, setBoom] = useState(0)
  const start = async () => {
    setErr(null)
    try { const r = await api(`/behavioral/scenarios?type=${type}&mode=${mode}`); setScn(r.scenarios); setAnswers([]); setI(0); setPhase('play') } catch (e) { setErr(e) }
  }
  const onAnswer = useCallback((a) => { setAnswers((x) => [...x, a]); setPhase('reveal') }, [])
  const next = async () => {
    if (i + 1 < scenarios.length) { setI(i + 1); setPhase('play'); return }
    setPhase('loading')
    try { const p = await api('/behavioral/analyze', { method: 'POST', body: { type, mode, answers } }); setProfile(p); markDone('profiled'); setBoom((b) => b + 1); setPhase('result'); toast('Fingerprint saved – the Pre-Decision shield will use it 🛡️') } catch (e) { setErr(e); setPhase('intro') }
  }
  return (
    <>
      <Confetti fire={boom} />
      {phase !== 'play' && <SectionHead eyebrow="Module 3 · Behavioural fingerprinting" title="How do you really act under pressure?" sub={<>Ten realistic, stressful situations. No right or wrong answers – only patterns. We detect biases like <Term k="lossaversion">loss aversion</Term>, <Term k="fomo">FOMO</Term> and <Term k="anchoring">anchoring</Term>.</>} />}
      <ErrorBox error={err} onRetry={start} />
      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="col" style={{ gap: 18 }}>
            <Card className="pad-lg col">
              <b style={{ fontSize: 18 }}>1 · Which type of investment should the test use?</b>
              <div className="grid g4">{Object.entries(TYPE_META).map(([k, m]) => <Card key={k} lift selected={type === k} accent={m.color} onClick={() => setType(k)} className="pad-sm row"><span style={{ fontSize: 26 }}>{m.emoji}</span><b>{m.name}</b></Card>)}</div>
              <b style={{ fontSize: 18, marginTop: 8 }}>2 · Pressure level</b>
              <div className="row wrap"><Segmented value={mode} onChange={setMode} options={[{ value: 'pressure', label: '🔥 Real pressure' }, { value: 'calm', label: '🧘 Calm practice' }]} /><InfoTip>Pressure = countdown timer, buzzing alerts, crowd messages and a racing heartbeat. Calm = the same questions without any rush. Try both and compare!</InfoTip></div>
              <div className="grid g3">{[['⏱️', 'Timed', 'Each scenario has 9–14 seconds. Freezing is recorded too.'], ['🔔', 'Noisy', 'Fake alerts, WhatsApp tips and panic messages.'], ['🧬', 'Revealing', '8 biases scored, an archetype and a coaching plan.']].map(([e, t, d]) => <Card key={t} className="pad-sm flat"><div style={{ fontSize: 26 }}>{e}</div><b>{t}</b><p className="tiny muted">{d}</p></Card>)}</div>
              <Button variant="primary" size="lg" onClick={start}>Begin the test →</Button>
              {profile && <Button variant="ghost" onClick={() => setPhase('result')}>See my previous result</Button>}
            </Card>
          </motion.div>)}
        {phase === 'play' && scenarios[i] && <motion.div key={'p' + i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}><Play s={scenarios[i]} idx={i} total={scenarios.length} mode={mode} onAnswer={onAnswer} /></motion.div>}
        {phase === 'reveal' && <motion.div key={'r' + i} exit={{ opacity: 0 }}><Reveal s={scenarios[i]} ans={answers[answers.length - 1]} onNext={next} last={i + 1 === scenarios.length} /></motion.div>}
        {phase === 'loading' && <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="center col" style={{ alignItems: 'center', padding: 80 }}><div style={{ fontSize: 60, animation: 'spin 1.2s linear infinite' }}>🧬</div><h3>Analysing your decisions…</h3></motion.div>}
        {phase === 'result' && profile && <motion.div key="res" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}><Results p={profile} onRetake={() => setPhase('intro')} /></motion.div>}
      </AnimatePresence>
    </>
  )
}
