import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { api } from '../lib/api.js'

const Ctx = createContext(null)
const KEY = 'bfs-state-v2'
const initial = { assetType: null, profile: null, budget: { amount: 50000, types: [], risk: 'medium' }, done: {}, tourSeen: false, theme: 'light' }
const load = () => { try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return initial } }

export function AppProvider({ children }) {
  const [s, setS] = useState(load)
  const [glossary, setGlossary] = useState({})
  const [toasts, setToasts] = useState([])
  const [panel, setPanel] = useState(null) // 'glossary' | 'help' | 'tour' | null
  const [aiStock, setAIStock] = useState(null)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }, [s])
  useEffect(() => { api('/glossary', { cached: true }).then(setGlossary).catch(() => {}) }, [])
  const toast = useCallback((text) => { const id = Math.random(); setToasts((t) => [...t, { id, text }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800) }, [])
  const value = useMemo(() => ({
    ...s, glossary, toasts, toast, panel, setPanel, aiStock, setAIStock,
    setAssetType: (assetType) => setS((p) => ({ ...p, assetType })),
    setProfile: (profile) => setS((p) => ({ ...p, profile })),
    setBudget: (b) => setS((p) => ({ ...p, budget: { ...p.budget, ...b } })),
    setTheme: (theme) => setS((p) => ({ ...p, theme })),
    markDone: (k) => setS((p) => (p.done[k] ? p : { ...p, done: { ...p.done, [k]: true } })),
    seeTour: () => setS((p) => ({ ...p, tourSeen: true })),
    reset: () => setS(initial),
  }), [s, glossary, toasts, toast, panel, aiStock])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useApp = () => useContext(Ctx)
