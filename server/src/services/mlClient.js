const BASE = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000'
const TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 2500)

async function request(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE}${path}`, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.detail || body.error || `ML service returned ${response.status}`)
    return body
  } finally { clearTimeout(timer) }
}

export async function mlHealth() {
  try { return await request('/ml/health') } catch (error) { return { status: 'unavailable', service: 'fastapi-ml', error: error.name === 'AbortError' ? 'timeout' : error.message } }
}

export async function mlRequest(path, body) {
  try { return await request(path, { method: 'POST', body: JSON.stringify(body || {}) }) }
  catch (error) { return { status: 'unavailable', modelAvailable: false, error: error.name === 'AbortError' ? 'ML service timeout' : error.message, predictionTimestamp: new Date().toISOString() } }
}

export async function mlGet(path) {
  try { return await request(path) }
  catch (error) { return { status: 'unavailable', modelAvailable: false, error: error.name === 'AbortError' ? 'ML service timeout' : error.message, predictionTimestamp: new Date().toISOString() } }
}
