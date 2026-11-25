import { useRef, useState, useEffect, useLayoutEffect, useId, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useInView } from '../hooks/index.js'
import { useApp } from '../state/AppContext.jsx'
import { Icon } from './Icon.jsx'

/** Glass card with mouse-follow spotlight */
export function Card({ children, className = '', lift = false, onClick, style, as: Tag = 'div', accent, selected, ...rest }) {
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <Tag className={`glass spot ${lift ? 'lift press' : ''} ${onClick ? 'clickable press' : ''} ${selected ? 'selected' : ''} ${className}`} onMouseMove={onMove} onClick={onClick} style={{ '--accent': accent, ...style }} {...rest}>
      {children}
    </Tag>
  )
}

/** Button with iOS-like press + ripple */
export function Button({ children, variant = '', size = '', className = '', onClick, ...rest }) {
  const click = (e) => {
    const el = e.currentTarget, r = el.getBoundingClientRect(), d = Math.max(r.width, r.height)
    const s = document.createElement('span')
    s.className = 'ripple'
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`
    el.appendChild(s); setTimeout(() => s.remove(), 700)
    onClick?.(e)
  }
  return <button className={`btn ${variant} ${size} ${className}`} onClick={click} {...rest}>{children}</button>
}

export const Chip = ({ children, tone = '', className = '', ...p }) => <span className={`chip ${tone} ${className}`} {...p}>{children}</span>

export function Reveal({ children, delay = 0, className = '', style }) {
  const [ref, seen] = useInView()
  return <div ref={ref} className={`reveal ${seen ? 'in' : ''} ${className}`} style={{ '--d': `${delay}s`, ...style }}>{children}</div>
}

export const ScrollSection = forwardRef(function ScrollSection({ children, className = '', style }, forwardedRef) {
  const [ref, seen] = useInView()
  const setRef = (node) => {
    ref.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }
  return <section ref={setRef} style={style} className={`sec reveal ${seen ? 'in' : ''} ${className}`}>{children}</section>
})

export function SectionHead({ eyebrow, title, sub, center }) {
  return (
    <Reveal className={`sec-head ${center ? 'center' : ''}`} style={center ? { textAlign: 'center' } : undefined}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 className="h-section" style={{ marginTop: 4 }}>{title}</h2>
      {sub && <p className="muted" style={{ marginTop: 8, maxWidth: 680, marginInline: center ? 'auto' : 0 }}>{sub}</p>}
    </Reveal>
  )
}

/** (i) bubble – hover, focus or tap to explain anything */
export function InfoTip({ children, below }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="tip-i" aria-describedby={open ? id : undefined} aria-label="More info" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} onBlur={() => setOpen(false)}>i</button>
      {open && <span id={id} role="tooltip" className={`tip-pop ${below ? 'below' : ''}`}>{children}</span>}
    </span>
  )
}

/** Dotted-underline glossary term: <Term k="nav">NAV</Term> */
export function Term({ k, children }) {
  const { glossary } = useApp()
  const [open, setOpen] = useState(false)
  const g = glossary[k]
  if (!g) return <>{children}</>
  return (
    <span className="tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span className="term" tabIndex={0} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((o) => !o)}>{children}</span>
      {open && <span role="tooltip" className="tip-pop"><b>{g[0]}</b><br />{g[1]}</span>}
    </span>
  )
}

export function Segmented({ options, value, onChange }) {
  const ref = useRef(null)
  const [thumb, setThumb] = useState({ left: 4, width: 0 })
  useLayoutEffect(() => {
    const b = ref.current?.querySelector('button.on')
    if (b) setThumb({ left: b.offsetLeft, width: b.offsetWidth })
  }, [value, options.length])
  return (
    <div className="seg" ref={ref} role="tablist">
      <span className="thumb" style={thumb} />
      {options.map((o) => <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

export function Meter({ value, max = 5, color }) {
  return <span className="meter" style={{ '--c': color }} aria-label={`${value} of ${max}`}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < value ? 'on' : ''} style={{ transitionDelay: `${i * 60}ms` }} />)}</span>
}
export function Bar({ value, color, max = 100, height }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(Math.max(0, Math.min(100, (value / max) * 100))), 80); return () => clearTimeout(t) }, [value, max])
  return <div className="bar" style={{ height }}><i style={{ width: `${w}%`, '--c': color }} /></div>
}

export function Sheet({ open, onClose, title, sub, children, width }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="sheet" style={width ? { width } : undefined} role="dialog" aria-label={title} initial={{ x: '110%' }} animate={{ x: 0 }} exit={{ x: '110%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
            <div className="sheet-head">
              <div><h3 style={{ fontSize: 22, fontWeight: 800 }}>{title}</h3>{sub && <p className="muted small" style={{ marginTop: 3 }}>{sub}</p>}</div>
              <Button size="icon" className="icon" onClick={onClose} aria-label="Close"><Icon name="close" /></Button>
            </div>
            <div className="sheet-body">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>, document.body)
}

export function Modal({ open, onClose, children, dismissable = true }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && dismissable && onClose?.()
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [open, onClose, dismissable])
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismissable ? onClose : undefined} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 210, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <motion.div className="modal" style={{ position: 'relative', left: 'auto', top: 'auto', pointerEvents: 'auto' }} role="dialog" aria-modal="true" initial={{ scale: 0.86, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 20 }} transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>, document.body)
}

export function Toasts() {
  const { toasts } = useApp()
  return createPortal(<div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>, document.body)
}

export function Loading({ rows = 3, h = 110 }) {
  return <div className="col">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>
}
export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <Card className="pad offline">
      <div className="bold"><Icon name="warning" size={16} /> {error.offline ? 'The backend server is not running' : 'Something went wrong'}</div>
      <p className="small" style={{ marginTop: 6 }}>{error.offline ? <>Open a second terminal and run <code>cd server && npm install && npm start</code> (port 5000). Then press retry.</> : error.message}</p>
      {onRetry && <Button size="sm" className="sm" style={{ marginTop: 10 }} onClick={onRetry}>↻ Retry</Button>}
    </Card>
  )
}

export function Confetti({ fire }) {
  const [bits, setBits] = useState([])
  useEffect(() => {
    if (!fire) return
    const colors = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#ffd60a']
    setBits(Array.from({ length: 70 }, (_, i) => ({ i, left: Math.random() * 100, delay: Math.random() * 0.6, dur: 2 + Math.random() * 1.8, c: colors[i % colors.length] })))
    const t = setTimeout(() => setBits([]), 4500)
    return () => clearTimeout(t)
  }, [fire])
  return createPortal(<>{bits.map((b) => <i key={b.i} className="confetti" style={{ left: `${b.left}vw`, background: b.c, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }} />)}</>, document.body)
}

export const Empty = ({ emoji = 'spark', title, text }) => <div className="center col" style={{ padding: 30, alignItems: 'center' }}><div style={{ color: 'var(--gold)' }}><Icon name={emoji} size={36} /></div><b>{title}</b><p className="muted small">{text}</p></div>
