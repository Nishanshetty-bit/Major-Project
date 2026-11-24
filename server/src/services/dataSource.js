import fs from 'node:fs'
import path from 'node:path'

const processedDir = process.env.MARKET_DATA_DIR || path.resolve(process.cwd(), '..', 'ml', 'data', 'processed')
const realMarketFile = path.join(processedDir, 'market.json')

let cached = null

function loadRealMarket() {
  if (cached !== null) return cached
  if (!fs.existsSync(realMarketFile)) {
    cached = { available: false, reason: 'Processed market data is not available. Run the ML dataset preparation commands.' }
    return cached
  }
  try {
    const value = JSON.parse(fs.readFileSync(realMarketFile, 'utf8'))
    cached = { available: Array.isArray(value.assets) && value.assets.length > 0, ...value }
  } catch (error) {
    cached = { available: false, reason: `Processed market data could not be read: ${error.message}` }
  }
  return cached
}

export function marketDataStatus() {
  const real = loadRealMarket()
  return real.available
    ? { mode: 'real', label: 'Real historical data', asOf: real.asOf || null, source: real.source || 'Hugging Face Indian market historical OHLCV' }
    : { mode: 'simulated', label: 'Simulated demonstration data', asOf: null, source: 'Built-in seeded demo universe', unavailableReason: real.reason }
}

export function realMarketData() { return loadRealMarket() }
