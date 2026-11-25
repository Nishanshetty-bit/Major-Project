import { useState, useMemo, useEffect, useRef } from 'react'
import { useWidth, useCountUp } from '../hooks/index.js'
import { inr } from '../lib/api.js'

const nice = (min, max) => { const span = max - min || 1, step = Math.pow(10, Math.floor(Math.log10(span / 4))); const m = [1, 2, 2.5, 5, 10].map((x) => x * step).find((s) => span / s <= 5) || step * 10; return { lo: Math.floor(min / m) * m, hi: Math.ceil(max / m) * m, m } }

/**
 * Responsive animated line chart.
 * series: [{ name, color, values, dashed, width, fill }]   band: {low:[], high:[], color}
 * markers: [{ x, label, color }]   shaded: [{ from, to, color, label }]
 */
export function LineChart({ series, labels, band, height = 260, format = (v) => inr(v, true), markers = [], shaded = [], animateKey = '', baseline, dot = true }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState(null)
  const pad = { l: 58, r: 14, t: 14, b: 30 }
  const H = height
  const n = Math.max(...series.map((s) => s.values.length))
  const all = series.flatMap((s) => s.values).concat(band ? [...band.low, ...band.high] : []).concat(baseline ? [baseline] : [])
  const { lo, hi, m } = nice(Math.min(...all), Math.max(...all))
  const x = (i) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r)
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b)
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const ticks = []
  for (let v = lo; v <= hi + 1e-9; v += m) ticks.push(v)
  const xt = useMemo(() => { const k = Math.min(6, n); return Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, k - 1))) }, [n])
  const move = (e) => { const r = e.currentTarget.getBoundingClientRect(); const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; setHover(Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))))) }
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={W} height={H} style={{ display: 'block', touchAction: 'pan-y' }} onMouseMove={move} onTouchMove={move} onMouseLeave={() => setHover(null)} role="img" aria-label="Line chart">
        <defs>{series.map((s, i) => <linearGradient key={i} id={`lg${animateKey}${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".25" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
        {ticks.map((t) => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" /><text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--chart-label)">{format(t)}</text></g>)}
        {shaded.map((s, i) => <g key={i}><rect x={x(s.from)} width={Math.max(2, x(s.to) - x(s.from))} y={pad.t} height={H - pad.t - pad.b} fill={s.color || 'rgba(255,69,58,.1)'} rx="6" /><text x={(x(s.from) + x(s.to)) / 2} y={pad.t + 12} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--chart-label)">{s.label}</text></g>)}
        {baseline && <line x1={pad.l} x2={W - pad.r} y1={y(baseline)} y2={y(baseline)} stroke="var(--chart-baseline)" strokeDasharray="5 5" />}
        {band && <path key={'b' + animateKey} d={`${path(band.high)} L${x(n - 1)} ${y(band.low[n - 1])} ${band.low.map((v, i) => `L${x(n - 1 - i).toFixed(1)} ${y(band.low[n - 1 - i]).toFixed(1)}`).join(' ')} Z`} fill={band.color || 'rgba(10,132,255,.14)'} style={{ animation: 'pop .8s var(--ease) both' }} />}
        {series.map((s, i) => (
          <g key={animateKey + i}>
            {s.fill && <path d={`${path(s.values)} L${x(s.values.length - 1)} ${H - pad.b} L${x(0)} ${H - pad.b} Z`} fill={`url(#lg${animateKey}${i})`} style={{ animation: 'pop 1.2s var(--ease) both' }} />}
            <path d={path(s.values)} pathLength="1" fill="none" stroke={s.color} strokeWidth={s.width || 3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '6 6' : undefined} className={s.dashed ? '' : 'draw'} style={s.dashed ? { animation: 'pop 1s both' } : { animationDelay: `${i * 0.15}s` }} />
          </g>
        ))}
        {markers.map((mk, i) => <g key={i}><line x1={x(mk.x)} x2={x(mk.x)} y1={pad.t} y2={H - pad.b} stroke={mk.color || '#ff9f0a'} strokeDasharray="4 4" /><text x={x(mk.x)} y={pad.t + 10} fontSize="10" fontWeight="700" textAnchor="middle" fill={mk.color || '#ff9f0a'}>{mk.label}</text></g>)}
        {xt.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--chart-label)">{labels?.[i] ?? i}</text>)}
        {hover !== null && <g>
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--chart-hover)" />
          {series.map((s, i) => s.values[hover] !== undefined && <circle key={i} cx={x(hover)} cy={y(s.values[hover])} r="5" fill="#fff" stroke={s.color} strokeWidth="3" />)}
        </g>}
        {dot && hover === null && series.map((s, i) => !s.dashed && <circle key={i} cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r="5" fill={s.color} style={{ animation: 'pop .5s 1.6s both' }} />)}
      </svg>
      {hover !== null && (
        <div className="chart-tooltip" style={{ top: 4, left: Math.min(Math.max(x(hover) - 70, 0), W - 160), minWidth: 130 }}>
          <b>{labels?.[hover] ?? hover}</b>
          {series.map((s, i) => <div key={i} className="row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} /><span className="muted">{s.name}</span><b className="num" style={{ marginLeft: 'auto' }}>{format(s.values[hover])}</b></div>)}
        </div>
      )}
    </div>
  )
}

export function Legend({ items }) {
  return <div className="row wrap" style={{ gap: 14, fontSize: 12.5 }}>{items.map((it) => <span key={it.name} className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 4, borderRadius: 3, background: it.color }} /><span className="muted">{it.name}</span></span>)}</div>
}

export function Donut({ slices, size = 230, center, onSelect, active }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t) }, [])
  const R = 80, C = 2 * Math.PI * R
  let acc = 0
  const total = slices.reduce((a, s) => a + s.value, 0) || 1
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg viewBox="0 0 200 200" width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(120,120,140,.12)" strokeWidth="26" />
        {slices.map((s, i) => {
          const len = (s.value / total) * C, off = acc; acc += len
          const on = active === s.id
          return <circle key={s.id} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth={on ? 32 : 26} strokeLinecap="butt" strokeDasharray={`${ready ? Math.max(0, len - 2.5) : 0} ${C}`} strokeDashoffset={-off} onClick={() => onSelect?.(s.id)} style={{ cursor: onSelect ? 'pointer' : 'default', transition: `stroke-dasharray 1.1s var(--ease) ${i * 0.1}s, stroke-width .35s var(--spring)`, filter: on ? `drop-shadow(0 4px 8px ${s.color}88)` : 'none' }} />
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>{center}</div>
    </div>
  )
}

export function Ring({ value, size = 56, color = '#0a84ff', stroke = 7, label }) {
  const [v, setV] = useState(0)
  useEffect(() => { const t = setTimeout(() => setV(value), 80); return () => clearTimeout(t) }, [value])
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,120,140,.16)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray 1.2s var(--ease)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.3 }}>{label ?? Math.round(value)}</div>
    </div>
  )
}
export const scoreColor = (v) => (v >= 70 ? '#30d158' : v >= 55 ? '#0a84ff' : v >= 45 ? '#ff9f0a' : '#ff453a')
export const riskColor = (v) => (v >= 55 ? '#ff453a' : v >= 35 ? '#ff9f0a' : '#30d158')

export function Radar({ axes, size = 340 }) {
  const [k, setK] = useState(0)
  useEffect(() => { const t = setTimeout(() => setK(1), 80); return () => clearTimeout(t) }, [])
  const cx = size / 2, cy = size / 2, R = size / 2 - 52, n = axes.length
  const pt = (i, r) => { const a = (i / n) * 2 * Math.PI - Math.PI / 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] }
  const poly = axes.map((a, i) => pt(i, (R * a.value * k) / 100).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto' }}>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={axes.map((_, i) => pt(i, R * f).join(',')).join(' ')} fill="none" stroke="rgba(60,60,90,.14)" />)}
      {axes.map((_, i) => <line key={i} x1={cx} y1={cy} x2={pt(i, R)[0]} y2={pt(i, R)[1]} stroke="rgba(60,60,90,.1)" />)}
      <polygon points={poly} fill="rgba(10,132,255,.22)" stroke="#0a84ff" strokeWidth="3" strokeLinejoin="round" style={{ transition: 'all 1.2s var(--spring)' }} />
      {axes.map((a, i) => { const [px, py] = pt(i, (R * a.value * k) / 100); const [lx, ly] = pt(i, R + 26); return <g key={a.label}><circle cx={px} cy={py} r="5" fill="#fff" stroke={a.value >= 50 ? '#ff453a' : '#0a84ff'} strokeWidth="3" style={{ transition: 'all 1.2s var(--spring)' }} /><text x={lx} y={ly} fontSize="11" fontWeight="700" textAnchor="middle" fill="rgba(17,24,39,.75)">{a.label}</text><text x={lx} y={ly + 13} fontSize="11" textAnchor="middle" fill="rgba(17,24,39,.45)">{a.value}</text></g> })}
    </svg>
  )
}

export function Spark({ values, color = '#0a84ff', w = 90, h = 32 }) {
  const mn = Math.min(...values), mx = Math.max(...values)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6)).toFixed(1)}`).join(' ')
  return <svg width={w} height={h} style={{ overflow: 'visible' }}><path d={d} pathLength="1" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" className="draw" /></svg>
}

export function Count({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), className, style }) {
  const v = useCountUp(value)
  return <span className={`num ${className || ''}`} style={style}>{format(v)}</span>
}

/** Gauge for regret probability */
export function Gauge({ value, size = 220 }) {
  const v = useCountUp(value, 1400)
  const a = -90 + (v / 100) * 180
  const col = v >= 55 ? '#ff453a' : v >= 35 ? '#ff9f0a' : '#30d158'
  const arc = (from, to, c) => { const p = (deg) => [100 + 80 * Math.cos((deg * Math.PI) / 180), 100 + 80 * Math.sin((deg * Math.PI) / 180)]; const [x1, y1] = p(180 + from * 1.8), [x2, y2] = p(180 + to * 1.8); return <path d={`M${x1} ${y1} A80 80 0 0 1 ${x2} ${y2}`} stroke={c} strokeWidth="18" fill="none" strokeLinecap="round" /> }
  return (
    <div style={{ width: size, margin: '0 auto', textAlign: 'center' }}>
      <svg viewBox="0 0 200 120" width={size}>
        {arc(0, 33, '#30d158')}{arc(36, 63, '#ff9f0a')}{arc(66, 100, '#ff453a')}
        <g style={{ transform: `rotate(${a}deg)`, transformOrigin: '100px 100px', transition: 'transform .2s linear' }}><path d="M100 100 L100 36" stroke="#111" strokeWidth="4" strokeLinecap="round" /><circle cx="100" cy="100" r="9" fill="#111" /></g>
      </svg>
      <div className="num" style={{ fontSize: 46, fontWeight: 800, color: col, marginTop: -8 }}>{Math.round(v)}%</div>
    </div>
  )
}
