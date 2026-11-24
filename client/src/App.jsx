import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AppProvider } from './state/AppContext.jsx'
import { Navbar, JourneyBar, Tour, Dock } from './components/Shell.jsx'
import { Toasts } from './components/ui.jsx'
import Home from './pages/Home.jsx'
import Budget from './pages/Budget.jsx'
import Behaviour from './pages/Behaviour.jsx'
import PreDecision from './pages/PreDecision.jsx'

function Pages() {
  const loc = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.main key={loc.pathname} className="page" initial={{ opacity: 0, y: 24, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }} onAnimationStart={() => window.scrollTo({ top: 0 })}>
        <JourneyBar />
        <Routes location={loc}>
          <Route path="/" element={<Home />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/behaviour" element={<Behaviour />} />
          <Route path="/pre-decision" element={<PreDecision />} />
          <Route path="*" element={<Home />} />
        </Routes>
        <p className="center muted tiny" style={{ marginTop: 50 }}>Educational project · all prices, news and returns are simulated · not financial advice</p>
      </motion.main>
    </AnimatePresence>
  )
}
export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="aurora"><i /><i /><i /><i /></div>
        <Navbar />
        <Pages />
        <Dock /><Tour /><Toasts />
      </BrowserRouter>
    </AppProvider>
  )
}
