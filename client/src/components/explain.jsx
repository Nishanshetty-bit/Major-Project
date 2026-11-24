import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, Button, Chip, Segmented, InfoTip } from './ui.jsx'
import { LineChart, Count } from './charts.jsx'
import { useApi, useInterval } from '../hooks/index.js'
import { inr, pct } from '../lib/api.js'

/* ───────────── Animated money-flow scenes ───────────── */
const line = (...p) => p.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ')
const SCENES = {
  stock: {
    nodes: [{ id: 'you', x: 60, y: 150, e: '🙋', l: 'You', on: [0, 1, 3] }, { id: 'broker', x: 200, y: 150, e: '📱', l: 'Broker app', on: [1] }, { id: 'exch', x: 340, y: 150, e: '🏛️', l: 'Stock exchange', on: [1, 3] }, { id: 'co', x: 510, y: 150, e: '🏢', l: 'One company', on: [0, 1, 2, 3] }],
    flows: [
      { d: 'M60 110 C 200 20, 400 20, 510 110', on: [0], kind: 'pick', note: 'You pick ONE company' },
      { d: line([90, 150], [170, 150], [230, 150], [310, 150], [370, 150], [478, 150]), on: [1], kind: 'coin', note: 'Money → exchange → company' },
      { d: 'M510 190 C 400 280, 160 280, 60 195', on: [1], kind: 'share', note: 'Shares arrive in your account' },
      { d: 'M510 110 C 400 40, 150 40, 60 110', on: [3], kind: 'coin', note: 'Dividends / sale proceeds' },
    ],
  },
  mf: {
    nodes: [{ id: 'i1', x: 50, y: 60, e: '🙋', l: '', on: [0] }, { id: 'i2', x: 50, y: 150, e: '🙋‍♀️', l: 'Many investors', on: [0, 2, 3] }, { id: 'i3', x: 50, y: 240, e: '🧑', l: '', on: [0] }, { id: 'pool', x: 200, y: 150, e: '🧺', l: 'Fund pool', on: [0, 1, 2, 3] }, { id: 'mgr', x: 340, y: 150, e: '👨‍💼', l: 'Fund manager', on: [1] }],
    flows: [
      ...[60, 150, 240].map((y) => ({ d: line([80, y], [170, 150]), on: [0], kind: 'coin' })),
      { d: line([230, 150], [310, 150]), on: [1], kind: 'coin', note: 'Manager picks 30–60 companies' },
      ...[90, 150, 210].map((y) => ({ d: line([370, 150], [470, y]), on: [1], kind: 'coin' })),
      { d: 'M200 190 C 150 280, 70 280, 50 255', on: [2], kind: 'share', note: 'You get units at NAV' },
      ...[90, 210].map((y) => ({ d: line([480, y], [230, 160]), on: [3], kind: 'coin', note: 'Growth shared by all' })),
    ],
    cluster: { x: 520, y: 150, n: 9 },
  },
  index: {
    nodes: [{ id: 'you', x: 55, y: 150, e: '🙋', l: 'You', on: [1, 2] }, { id: 'fund', x: 190, y: 150, e: '🪞', l: 'Index fund', on: [1, 2, 3] }, { id: 'bot', x: 320, y: 150, e: '🤖', l: 'Copies the list', on: [1] }, { id: 'sb', x: 450, y: 40, e: '📋', l: 'Nifty 50 list', on: [0] }],
    flows: [
      { d: line([85, 150], [160, 150]), on: [1], kind: 'coin' }, { d: line([220, 150], [290, 150]), on: [1], kind: 'coin', note: 'Buys all 50 – same proportions' },
      ...[90, 130, 170, 210].map((y) => ({ d: line([350, 150], [470, y]), on: [1], kind: 'coin' })),
      { d: 'M190 190 C 150 270, 80 270, 55 190', on: [2], kind: 'share', note: 'You own a slice of the whole basket' },
      { d: line([190, 110], [190, 60], [240, 60]), on: [3], kind: 'coin', note: 'Tiny fee: 0.1–0.3%' },
    ],
    bubbles: true, feeBin: [3],
  },
  etf: {
    nodes: [{ id: 'you', x: 45, y: 150, e: '🙋', l: 'You', on: [1, 3] }, { id: 'broker', x: 150, y: 150, e: '📱', l: 'Broker', on: [1, 3] }, { id: 'exch', x: 270, y: 150, e: '🏛️', l: 'Exchange', on: [1, 2, 3] }, { id: 'etf', x: 390, y: 150, e: '🧺', l: 'ETF units', on: [0, 1, 2] }],
    flows: [
      { d: line([72, 150], [122, 150], [178, 150], [242, 150], [298, 150], [362, 150]), on: [1], kind: 'coin', note: 'Buy units, just like a share' },
      ...[100, 150, 200].map((y) => ({ d: line([420, 150], [500, y]), on: [0], kind: 'coin', note: 'The basket holds ~50 companies' })),
      { d: 'M270 190 C 200 270, 90 270, 45 190', on: [3], kind: 'coin', note: 'Sell any time the market is open' },
    ],
    cluster: { x: 535, y: 150, n: 7 }, ticker: [2],
  },
}
const Dash = ({ d }) => <path d={d} fill="none" stroke="rgba(60,60,90,.18)" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
const Mover = ({ d, delay, kind }) => (
  <g opacity="0">
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.9;1" dur="2.6s" begin={`${delay}s`} repeatCount="indefinite" />
    {kind === 'share' ? <><rect x="-10" y="-12" width="20" height="24" rx="5" fill="#fff" stroke="#0a84ff" strokeWidth="2" /><text y="5" fontSize="13" textAnchor="middle">📄</text></> : <><circle r="10" fill="#ffd60a" stroke="#ff9f0a" strokeWidth="2" /><text y="4" fontSize="12" fontWeight="800" textAnchor="middle" fill="#a35c00">₹</text></>}
    <animateMotion dur="2.6s" begin={`${delay}s`} repeatCount="indefinite" path={d} />
  </g>
)
function PriceWiggle({ x, y, up }) {
  const pts = [0, 14, 8, 22, 12, 30, 18, 38, 26, 46, 30, 54, 44].map((v, i) => (i % 2 ? '' : '')) // placeholder to keep hooks-free
  const d = up ? 'M0 40 L18 30 L32 36 L50 18 L66 24 L86 6' : 'M0 6 L18 16 L32 10 L50 28 L66 22 L86 40'
  return <g transform={`translate(${x},${y})`}><rect x="-10" y="-12" width="110" height="64" rx="14" fill="rgba(255,255,255,.85)" stroke="#fff" /><path d={d} pathLength="1" className="draw" fill="none" stroke={up ? '#30d158' : '#ff453a'} strokeWidth="3.5" strokeLinecap="round" /></g>
}
export function FlowScene({ type, step }) {
  const sc = SCENES[type]
  const [tick, setTick] = useState(0)
  useInterval(() => setTick((t) => t + 1), 1400, type === 'etf' || step === 2)
  const note = sc.flows.find((f) => f.on.includes(step) && f.note)?.note
  const price = (326.9 + Math.sin(tick) * 1.8 + (tick % 3) * 0.3).toFixed(2)
  return (
    <svg viewBox="0 0 600 300" width="100%" role="img" aria-label={`Animated diagram of how ${type} investing works`} style={{ display: 'block' }}>
      {sc.flows.map((f, i) => <Dash key={'t' + i} d={f.d} />)}
      {sc.flows.map((f, i) => f.on.includes(step) && (f.kind === 'pick'
        ? <path key={`${step}-${i}`} d={f.d} fill="none" stroke="#0a84ff" strokeWidth="4" strokeDasharray="10 10" strokeLinecap="round"><animate attributeName="stroke-dashoffset" from="40" to="0" dur=".8s" repeatCount="indefinite" /></path>
        : <g key={`${step}-${i}`}>{[0, 0.85, 1.7].map((d) => <Mover key={d} d={f.d} delay={d} kind={f.kind} />)}</g>))}
      {sc.bubbles && <g>{[[480, 60, 16], [520, 90, 22], [560, 60, 12], [490, 120, 14], [545, 135, 26], [500, 170, 20], [565, 185, 13], [520, 215, 17], [480, 235, 12], [560, 235, 15], [455, 195, 11], [455, 100, 10]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={`hsl(${210 + i * 9} 85% ${62 + (i % 3) * 6}%)`} stroke="#fff" strokeWidth="2" style={{ animation: `pop .6s ${i * 0.05}s both`, opacity: step === 0 || step === 1 ? 1 : 0.55 }} />)}<text x="515" y="275" fontSize="11" fontWeight="700" textAnchor="middle" fill="rgba(17,24,39,.55)">50 companies (bigger = larger share)</text></g>}
      {sc.cluster && <g>{Array.from({ length: sc.cluster.n }, (_, i) => <text key={i} x={sc.cluster.x - 30 + (i % 3) * 30} y={sc.cluster.y - 60 + Math.floor(i / 3) * 42} fontSize="26" textAnchor="middle" style={{ animation: `pop .6s ${i * 0.06}s both`, opacity: step === 1 || step === 3 || step === 0 ? 1 : 0.6 }}>{['🏢', '🏭', '🏦', '🏥', '🛒', '🚗', '⚡', '💻', '🏗️'][i % 9]}</text>)}<text x={sc.cluster.x} y={sc.cluster.y + 100} fontSize="11" fontWeight="700" textAnchor="middle" fill="rgba(17,24,39,.55)">{type === 'mf' ? '30–60 companies' : '~50 companies'}</text></g>}
      {sc.nodes.map((n) => { const on = n.on.includes(step); return (
        <g key={n.id} style={{ transformOrigin: `${n.x}px ${n.y}px`, transform: on ? 'scale(1.14)' : 'scale(.92)', opacity: on ? 1 : 0.5, transition: 'all .6s cubic-bezier(.34,1.56,.64,1)' }}>
          <circle cx={n.x} cy={n.y} r="32" fill="rgba(255,255,255,.85)" stroke={on ? '#0a84ff' : '#fff'} strokeWidth={on ? 3 : 1.5} style={{ filter: on ? 'drop-shadow(0 8px 14px rgba(10,132,255,.3))' : 'none' }} />
          <text x={n.x} y={n.y + 10} fontSize="30" textAnchor="middle">{n.e}</text>
          <text x={n.x} y={n.y + 52} fontSize="11.5" fontWeight="700" textAnchor="middle" fill="rgba(17,24,39,.7)">{n.l}</text>
        </g>) })}
      {type === 'stock' && step === 2 && <PriceWiggle x={455} y={20} up={tick % 2 === 0} />}
      {type === 'etf' && sc.ticker.includes(step) && <g transform="translate(205,45)"><rect width="130" height="40" rx="14" fill="rgba(255,255,255,.9)" stroke="#fff" /><text x="14" y="25" fontSize="15" fontWeight="800" fill={tick % 2 ? '#30d158' : '#ff453a'}>₹{price} {tick % 2 ? '▲' : '▼'}</text><circle cx="116" cy="20" r="4" fill="#30d158" style={{ animation: 'blink 1s infinite' }} /></g>}
      {note && <g><rect x="150" y="268" width="300" height="26" rx="13" fill="rgba(28,28,30,.82)" /><text x="300" y="285" fontSize="12.5" fontWeight="600" textAnchor="middle" fill="#fff">{note}</text></g>}
    </svg>
  )
}

/** Step player: diagram + clickable steps, auto-advance */
export function HowItWorks({ data }) {
  const [step, setStep] = useState(0)
  const [play, setPlay] = useState(true)
  useEffect(() => setStep(0), [data.id])
  useInterval(() => setStep((s) => (s + 1) % data.how.length), 4600, play)
  return (
    <div className="grid g2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))', alignItems: 'center' }}>
      <Card className="pad-sm flat"><FlowScene type={data.id} step={step} />
        <div className="row between" style={{ padding: '0 8px 4px' }}><span className="tiny muted">Step {step + 1} of {data.how.length}</span><Button size="sm" className="sm" onClick={() => setPlay((p) => !p)} aria-label={play ? 'Pause' : 'Play'}>{play ? '⏸ Pause' : '▶ Play'}</Button></div>
      </Card>
      <div className="col">
        {data.how.map((s, i) => (
          <Card key={i} onClick={() => { setStep(i); setPlay(false) }} selected={i === step} accent={data.color} className="pad-sm" style={{ opacity: i === step ? 1 : 0.7 }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 30, height: 30, borderRadius: 15, display: 'grid', placeItems: 'center', fontWeight: 800, flex: 'none', background: i === step ? data.color : 'rgba(120,120,140,.18)', color: i === step ? '#fff' : 'inherit', transition: 'all .4s var(--spring)', transform: i === step ? 'scale(1.15)' : 'none' }}>{i + 1}</div>
              <div><b>{s.title}</b><AnimatePresence initial={false}>{i === step && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="muted small" style={{ overflow: 'hidden' }}>{s.text}</motion.p>}</AnimatePresence></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ───────────── Phone walkthrough ───────────── */
function Screen({ step, ex }) {
  if (step === 0) return (<div><b style={{ fontSize: 15 }}>Open your account</b>
    <div className="ph-card" style={{ marginTop: 10 }}>PAN card<div className="ph-field"><i /><span>ABCDE1234F ✓</span></div></div>
    <div className="ph-card" style={{ animationDelay: '.3s' }}>Aadhaar e-KYC<div className="ph-field"><i style={{ animationDelay: '.5s' }} /><span>XXXX XXXX 4821 ✓</span></div></div>
    <div className="ph-card" style={{ animationDelay: '.6s' }}>Bank account<div className="ph-field"><i style={{ animationDelay: '1s' }} /><span>Linked via UPI ✓</span></div></div>
    <div style={{ textAlign: 'center', fontSize: 46, animation: 'pop .6s 1.8s var(--spring) both' }}>✅</div><div className="center small bold" style={{ animation: 'pop .6s 1.9s both' }}>Account ready!</div></div>)
  if (step === 1) return (<div><b style={{ fontSize: 15 }}>Add money</b>
    <div className="ph-card" style={{ marginTop: 10, textAlign: 'center' }}><div className="tiny muted">Wallet balance</div><div className="num" style={{ fontSize: 30, fontWeight: 800 }}><Count value={10000} format={(v) => inr(v)} /></div></div>
    {['UPI – PhonePe', 'UPI – GPay', 'Net banking'].map((m, i) => <div key={m} className="ph-card" style={{ animationDelay: `${0.2 + i * 0.15}s`, display: 'flex', justifyContent: 'space-between', outline: i === 0 ? '2px solid #0a84ff' : 'none' }}>{m}<span>{i === 0 ? '●' : '○'}</span></div>)}
    <div className="finger" style={{ left: 120, top: 330 }}>👆</div><div style={{ background: '#0a84ff', color: '#fff', borderRadius: 12, padding: 10, textAlign: 'center', fontWeight: 700, marginTop: 6 }}>Add ₹10,000</div></div>)
  if (step === 2) return (<div><b style={{ fontSize: 15 }}>Search & pick</b>
    <div className="ph-card" style={{ marginTop: 10 }}>🔍 <span className="typing">{ex}</span></div>
    {[[ex, 'Confidence 74 · Good', true], ['Similar option A', 'Confidence 61', false], ['Similar option B', 'Confidence 48', false]].map(([n, s, hi], i) => <div key={n} className="ph-card" style={{ animationDelay: `${1 + i * 0.18}s`, outline: hi ? '2px solid #30d158' : 'none' }}><b>{n}</b><div className="tiny muted">{s}</div></div>)}
    <div className="tiny muted center">Tip: read before you tap</div></div>)
  if (step === 3) return (<div><b style={{ fontSize: 15 }}>Place order</b>
    <div className="ph-card" style={{ marginTop: 10 }}><b>{ex}</b><div className="row between small" style={{ marginTop: 8 }}><span>Quantity</span><span className="bold">− 10 +</span></div><div className="row between small"><span>Order type</span><span className="chip blue">Limit</span></div><div className="row between small"><span>Estimated cost</span><b>₹15,420</b></div></div>
    <div style={{ position: 'relative' }}><div style={{ background: '#30d158', color: '#fff', borderRadius: 14, padding: 13, textAlign: 'center', fontWeight: 800, animation: 'pulse 1.6s infinite' }}>BUY</div><div className="finger" style={{ left: 90, top: 8 }}>👆</div></div>
    <div className="center small" style={{ marginTop: 14, animation: 'pop .5s 2.2s both' }}>🎉 Order placed</div></div>)
  return (<div><b style={{ fontSize: 15 }}>Track & relax</b>
    <div className="ph-card" style={{ marginTop: 10 }}><div className="tiny muted">Current value</div><div className="num" style={{ fontSize: 24, fontWeight: 800 }}><Count value={16660} format={(v) => inr(v)} /></div><div className="up small bold">+₹1,240 (+8.0%)</div>
      <svg viewBox="0 0 180 60" width="100%"><path d="M0 50 L20 44 L40 48 L60 34 L80 38 L100 24 L120 28 L150 12 L180 8" pathLength="1" className="draw" fill="none" stroke="#30d158" strokeWidth="3" strokeLinecap="round" /></svg></div>
    <div className="ph-card" style={{ animationDelay: '.6s' }}>🔁 SIP ₹2,000 / month <span className="chip green" style={{ float: 'right' }}>Active</span></div>
    <div className="ph-card" style={{ animationDelay: '.8s' }}>📅 Next review: in 3 months</div></div>)
}
export function InvestSteps({ data }) {
  const [i, setI] = useState(0)
  useEffect(() => setI(0), [data.id])
  const s = data.invest[i]
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', alignItems: 'center', gap: 28 }}>
      <div>
        <motion.div className="phone" key={data.id} initial={{ rotateY: 40, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: 'spring', damping: 18 }}>
          <div className="phone-screen"><AnimatePresence mode="wait"><motion.div key={i} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.28 }}><Screen step={i} ex={data.example.name} /></motion.div></AnimatePresence></div>
        </motion.div>
      </div>
      <div className="col">
        <div className="row" style={{ gap: 6 }}>{data.invest.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Step ${k + 1}`} style={{ flex: 1, height: 8, borderRadius: 9, border: 'none', background: k <= i ? data.color : 'rgba(120,120,140,.2)', transition: 'background .4s' }} />)}</div>
        <div className="eyebrow" style={{ color: data.color }}>Step {i + 1} of {data.invest.length}</div>
        <AnimatePresence mode="wait"><motion.div key={i} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}>
          <h3 style={{ fontSize: 26, fontWeight: 800 }}>{s.title}</h3><p className="muted" style={{ marginTop: 8 }}>{s.text}</p>
          <Card className="pad-sm flat" style={{ marginTop: 14 }}>💡 <b>Beginner tip:</b> <span className="muted">{s.tip}</span></Card>
        </motion.div></AnimatePresence>
        <div className="row"><Button disabled={i === 0} onClick={() => setI(i - 1)}>← Back</Button><Button variant="primary" disabled={i === data.invest.length - 1} onClick={() => setI(i + 1)}>Next →</Button></div>
      </div>
    </div>
  )
}

/* ───────────── Try it: what does my money buy + crash test ───────────── */
const HOLD = { stock: 1, mf: 45, index: 50, etf: 50 }
export function TryIt({ data }) {
  const [amt, setAmt] = useState(25000)
  const [hit, setHit] = useState(null)
  const [aid, setAid] = useState(null)
  const { data: list } = useApi(`/assets?type=${data.id}`)
  const { data: asset } = useApi(aid ? `/assets/${aid}` : null, { enabled: !!aid })
  useEffect(() => { setHit(null); setAid(null) }, [data.id])
  useEffect(() => { if (list && !aid) setAid(list.find((a) => !a.speculative)?.id || list[0].id) }, [list, aid])
  const n = HOLD[data.id]
  const rep = list?.find((a) => a.id === aid)
  const units = rep ? (data.id === 'stock' || data.id === 'etf' ? Math.floor(amt / rep.price) : (amt / rep.price).toFixed(2)) : '–'
  const crash = () => { setHit(Math.floor(Math.random() * n)) }
  const loss = hit === null ? 0 : amt / n * 0.5
  const hist = asset?.history
  const grown = hist ? Math.round((amt * hist[hist.length - 1]) / hist[0]) : 0
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Card className="pad col">
        <div className="row between"><b>How much will you invest?</b><span className="num bold" style={{ fontSize: 24 }}>{inr(amt)}</span></div>
        <input type="range" min="1000" max="200000" step="1000" value={amt} style={{ '--p': `${(amt / 200000) * 100}%` }} onChange={(e) => setAmt(+e.target.value)} aria-label="Investment amount" />
        <div className="row wrap">{list?.filter((a) => !a.speculative).slice(0, 4).map((a) => <Chip key={a.id} className={`pick ${a.id === aid ? 'on' : ''}`} onClick={() => setAid(a.id)}>{a.name}</Chip>)}</div>
        <Card className="pad-sm flat">You get about <b className="num">{units}</b> {data.id === 'stock' ? 'shares' : 'units'} of <b>{rep?.name}</b> at {rep?.unit} ₹{rep?.price}.</Card>
        <div className="divider" />
        <div className="row between"><b>You indirectly own <span className="num" style={{ color: data.color }}>{n}</span> {n === 1 ? 'company' : 'companies'}</b><InfoTip>Each dot is one company your money sits in. If one company fails, only its dot is hurt.</InfoTip></div>
        {n === 1 ? <div className={`dot big ${hit === 0 ? 'hit' : ''}`} style={{ display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 }}>{hit === 0 ? '💥 −50%' : '100% of your money here'}</div> : <div className="dots">{Array.from({ length: n }, (_, i) => <div key={i} className={`dot ${hit === i ? 'hit' : ''}`} style={{ animationDelay: `${i * 12}ms` }} />)}</div>}
        <div className="row"><Button variant="danger" onClick={crash}>💥 Crash a company by 50%</Button>{hit !== null && <Button onClick={() => setHit(null)}>Reset</Button>}</div>
        {hit !== null && <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass pad-sm" style={{ background: 'rgba(255,69,58,.1)' }}>Your loss: <b className="down num">−{inr(loss)}</b> ({((loss / amt) * 100).toFixed(1)}% of your money). {n === 1 ? 'With a single stock one bad event hurts a lot.' : 'Spread across many companies, one failure barely shows.'}</motion.div>}
      </Card>
      <Card className="pad col">
        <div className="row between"><b>If you had invested {inr(amt)} 5 years ago…</b><InfoTip>Based on simulated prices of {rep?.name}. Past results never promise future returns.</InfoTip></div>
        {hist ? <>
          <div className="num" style={{ fontSize: 34, fontWeight: 800 }}>→ <Count value={grown} format={(v) => inr(v)} /> <span className={`small ${grown >= amt ? 'up' : 'down'}`}>{pct(((grown / amt) - 1) * 100, 0)}</span></div>
          <LineChart key={aid} series={[{ name: rep.name, color: data.color, values: hist.map((v) => Math.round((amt * v) / hist[0])), fill: true }]} labels={asset.labels} height={220} animateKey={aid} baseline={amt} shaded={[{ from: 14, to: 16, label: 'Crash' }]} />
          <p className="tiny muted">Dashed line = your starting amount. Notice the crash dip around Dec 22 – Feb 23 and the recovery afterwards.</p></> : <div className="skeleton" style={{ height: 260 }} />}
      </Card>
    </div>
  )
}

/* ───────────── Compare + quiz ───────────── */
export function CompareTable({ types, compare, selected, onPick }) {
  return (
    <Card className="pad" style={{ overflowX: 'auto' }}>
      <table className="t" style={{ minWidth: 640 }}>
        <thead><tr><th></th>{types.map((t) => <th key={t.id}><button onClick={() => onPick(t.id)} className={`chip pick ${selected === t.id ? 'on' : ''}`}>{t.emoji} {t.title}</button></th>)}</tr></thead>
        <tbody>
          {compare.map((c) => <tr key={c.key}><td><b>{c.label}</b> <InfoTip>{c.hint}</InfoTip></td>{types.map((t) => <td key={t.id}><div className="bar" style={{ width: 120 }}><i style={{ width: `${t[c.key] * 20}%`, '--c': t.color }} /></div></td>)}</tr>)}
          <tr><td><b>Minimum to start</b></td>{types.map((t) => <td key={t.id} className="small">{t.minAmount}</td>)}</tr>
          <tr><td><b>Best for</b></td>{types.map((t) => <td key={t.id} className="small muted">{t.bestFor}</td>)}</tr>
        </tbody>
      </table>
    </Card>
  )
}
const Q = [
  ['How would you feel if your money fell 20% in a month?', [['I would panic', 0], ['Worried but I would wait', 1], ['Buy more, it is on sale!', 2]]],
  ['How much time do you want to spend on investing?', [['Almost none – set and forget', 0], ['A little each month', 1], ['I enjoy researching companies', 2]]],
  ['Which sounds more like you?', [['Safety first, steady growth', 0], ['A balance of safe and bold', 1], ['I want the biggest upside', 2]]],
]
export function Quiz({ onPick }) {
  const [a, setA] = useState([])
  const done = a.length === Q.length
  const sum = a.reduce((x, y) => x + y, 0)
  const rec = sum <= 1 ? 'index' : sum <= 3 ? 'etf' : sum <= 4 ? 'mf' : 'stock'
  const names = { index: 'Index Funds', etf: 'ETFs', mf: 'Mutual Funds', stock: 'Individual Stocks' }
  const why = { index: 'You value calm and simplicity – automatic diversification at very low cost fits you.', etf: 'You like low cost and a bit of control – ETFs give index-style investing with live trading.', mf: 'You like a balance and prefer experts to do the research.', stock: 'You enjoy research and accept big swings. Just keep each stock small!' }
  return (
    <Card className="pad">
      <div className="row between"><b style={{ fontSize: 18 }}>🧭 Which one fits me?</b>{a.length > 0 && <Button size="sm" className="sm" onClick={() => setA([])}>Restart</Button>}</div>
      <AnimatePresence mode="wait">
        {!done ? <motion.div key={a.length} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} className="col" style={{ marginTop: 12 }}>
          <div className="tiny faint">Question {a.length + 1} of {Q.length}</div><b>{Q[a.length][0]}</b>
          {Q[a.length][1].map(([t, v]) => <Button key={t} onClick={() => setA([...a, v])} style={{ justifyContent: 'flex-start' }}>{t}</Button>)}
        </motion.div> : <motion.div key="r" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="col center" style={{ marginTop: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 50 }}>🎯</div><h3>Try <span className="grad-text">{names[rec]}</span> first</h3><p className="muted small">{why[rec]}</p>
          <Button variant="primary" onClick={() => onPick(rec)}>Open the {names[rec]} lesson</Button></motion.div>}
      </AnimatePresence>
    </Card>
  )
}

/* ───────────── Market timeline ───────────── */
export function Timeline() {
  const { data } = useApi('/market')
  const [sel, setSel] = useState(null)
  if (!data) return <div className="skeleton" style={{ height: 340 }} />
  const colors = { crash: 'rgba(255,69,58,.14)', recovery: 'rgba(48,209,88,.14)', hype: 'rgba(255,159,10,.16)', bubble: 'rgba(255,69,58,.18)', dip: 'rgba(100,100,120,.12)' }
  const ev = data.events.find((e) => e.id === sel)
  return (
    <Card className="pad col">
      <LineChart series={[{ name: 'Simulated market index', color: '#0a84ff', values: data.benchmark, fill: true }]} labels={data.labels} height={280} format={(v) => Math.round(v)} shaded={data.events.map((e) => ({ from: e.from, to: e.to, color: colors[e.id], label: e.emoji }))} animateKey="tl" />
      <div className="row wrap">{data.events.map((e) => <Chip key={e.id} className={`pick ${sel === e.id ? 'on' : ''}`} onClick={() => setSel(e.id === sel ? null : e.id)}>{e.emoji} {e.title}</Chip>)}</div>
      <AnimatePresence mode="wait">{ev ? <motion.div key={ev.id} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}><Card className="pad-sm flat"><b>{ev.emoji} {ev.title}</b> <span className="chip">{ev.fromLabel} → {ev.toLabel}</span><p className="muted small">{ev.text}</p></Card></motion.div> : <p className="muted small">Tap an event to learn what happened. These same events power the budget back-tests, behaviour tests and regret warnings.</p>}</AnimatePresence>
    </Card>
  )
}
