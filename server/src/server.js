import './config.js'
import { createApp } from './app.js'
const PORT = Number(process.env.PORT) || 5000
createApp().listen(PORT, () => console.log(`📈 Behavioral Finance API running on http://localhost:${PORT}  (try /api/health)`))
