import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 43 + 11) % 100}%`,
  top: `${(i * 67 + 17) % 100}%`,
  delay: `${(i % 7) * 0.19}s`,
}))

export default function LaunchReveal() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2700)
    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div className="launch-reveal" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.025 }} transition={{ duration: 0.65, ease: 'easeInOut' }} role="status" aria-label="FinSense is loading">
          {PARTICLES.map((p, i) => <i key={i} className="launch-particle" style={p} />)}
          <div className="launch-content">
            <motion.div className="launch-wordmark" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>{'FinSense'}</motion.div>
            <motion.div className="launch-subtitle" initial={{ opacity: 0, letterSpacing: '.5em' }} animate={{ opacity: 1, letterSpacing: '.32em' }} transition={{ delay: 0.5, duration: 0.6 }}>A clearer view of your money</motion.div>
            <svg className="launch-chart" viewBox="0 0 640 150" fill="none" aria-hidden="true">
              <path d="M4 126 68 112 112 120 165 82 216 94 269 67 323 78 374 42 423 58 475 29 526 40 581 10 636 18" pathLength="1" stroke="#d8b456" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 126 68 112 112 120 165 82 216 94 269 67 323 78 374 42 423 58 475 29 526 40 581 10 636 18V150H4Z" fill="url(#launch-fill)" opacity=".22" />
              <defs><linearGradient id="launch-fill" x1="320" y1="10" x2="320" y2="150" gradientUnits="userSpaceOnUse"><stop stopColor="#d8b456" /><stop offset="1" stopColor="#d8b456" stopOpacity="0" /></linearGradient></defs>
            </svg>
            <button type="button" className="launch-enter" onClick={() => setVisible(false)}>Enter FinSense</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
