// Tiny persistent store (in-memory Map + JSON file) – swap for MongoDB/Postgres later without touching the routes.
import fs from 'node:fs'
import path from 'node:path'

const FILE = process.env.STORE_FILE === undefined ? path.resolve(process.cwd(), '.data', 'store.json') : process.env.STORE_FILE
const db = { profiles: {}, checks: {}, journal: {}, tests: [] }
if (FILE && fs.existsSync(FILE)) { try { Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))) } catch { /* corrupt file: start clean */ } }
let timer = null
function persist() {
  if (!FILE) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)) } catch (e) { console.warn('store: could not save', e.message) }
  }, 300)
  timer.unref?.()
}
export const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
export const saveProfile = (p) => { db.profiles[p.id] = p; persist(); return p }
export const getProfile = (id) => db.profiles[id] || null
export const saveCheck = (c) => { db.checks[c.id] = c; persist(); return c }
export const getCheck = (id) => db.checks[id] || null
export const addJournal = (profileId, e) => { (db.journal[profileId] ||= []).unshift(e); db.journal[profileId] = db.journal[profileId].slice(0, 100); persist() }
export const getJournal = (profileId) => db.journal[profileId] || []
export const counts = () => ({ profiles: Object.keys(db.profiles).length, checks: Object.keys(db.checks).length })
