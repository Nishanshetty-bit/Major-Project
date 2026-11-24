import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../lib/api.js'

export function useApi(path, { enabled = true, cached = true } = {}) {
  const [state, set] = useState({ data: null, error: null, loading: !!enabled })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled || !path) return
    let live = true
    set((s) => ({ ...s, loading: true, error: null }))
    api(path, { cached }).then((data) => live && set({ data, error: null, loading: false })).catch((error) => live && set({ data: null, error, loading: false }))
    return () => { live = false }
  }, [path, enabled, n, cached])
  return { ...state, reload: useCallback(() => setN((x) => x + 1), []) }
}

export function useInView(opts = { threshold: 0.15 }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) { setSeen(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, opts)
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, seen]
}

export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now(), a = from.current, b = Number(target) || 0
    let raf
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - p, 4)
      setV(a + (b - a) * e)
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = b
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

export function useInterval(fn, ms, on = true) {
  const f = useRef(fn); f.current = fn
  useEffect(() => { if (!on || ms == null) return; const id = setInterval(() => f.current(), ms); return () => clearInterval(id) }, [ms, on])
}

export function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => setW(Math.max(260, el.clientWidth))
    set()
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', set); return () => window.removeEventListener('resize', set) }
    const ro = new ResizeObserver(set); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}
