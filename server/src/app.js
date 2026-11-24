import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'
import { logger, security, rateLimit, notFound, errorHandler } from './middleware/index.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors())
  app.use(security)
  app.use(logger)
  app.use(express.json({ limit: '100kb' }))
  app.use('/api', rateLimit({ max: 600 }), routes)
  app.use(notFound)
  app.use(errorHandler)
  return app
}
