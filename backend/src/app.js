/*
 * Express application setup.
 * Configures middleware, routes, error handling, and static file serving.
 *
 * Static file serving follows the primalmedivice.com proven pattern:
 * 1. Check two candidate paths for index.html (public/ first, then frontend/dist/)
 * 2. Mount express.static() on whichever path has index.html
 * 3. GET-only SPA fallback sends index.html for non-file, non-API routes
 * 4. POST/PUT/DELETE to unknown paths get JSON 404
 */

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { join } from 'path'
import { existsSync } from 'fs'
import { ROOT_DIR, NODE_ENV, PUBLIC_DIR, FRONTEND_DIST } from './config/paths.js'
import { logger } from './logging/logger.js'
import chatRoutes from './routes/chat.routes.js'
import shopRoutes from './routes/shop.routes.js'
import cartRoutes from './routes/cart.routes.js'
import adminRoutes from './routes/admin.routes.js'
import nombaWebhookRoutes from './routes/nomba-webhook.routes.js'
import banksRoutes from './routes/banks.routes.js'
import merchantsRoutes from './routes/merchants.routes.js'
import storefrontRoutes from './routes/storefront.routes.js'
import checkoutRoutes from './routes/checkout.routes.js'
import { adminAuth } from './middleware/adminAuth.js'

export function createApp() {
  const app = express()

  /* ---- Security ---- */
  app.use(helmet({
    contentSecurityPolicy: false, /* Allow iframe embedding */
  }))
  app.use(cors())

  /* ---- Body parsing ---- */
  app.use(express.json({ limit: '1mb' }))

  /* ---- Request logging ---- */
  app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - start
      if (req.path.startsWith('/api/')) {
        logger.debug(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`)
      }
    })
    next()
  })

  /* ---- API routes (must be registered BEFORE static middleware) ---- */
  app.use('/api/chat', chatRoutes)
  app.use('/api/shop', shopRoutes)
  app.use('/api/cart', cartRoutes)
  app.use('/api/webhook/nomba', nombaWebhookRoutes)
  app.use('/api/banks', banksRoutes)
  app.use('/api/merchants', merchantsRoutes)
  app.use('/api/storefront', storefrontRoutes)
  app.use('/api/checkout', checkoutRoutes)
  app.use('/api/admin', adminAuth, adminRoutes)

  /* ---- Health check ---- */
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, uptime: process.uptime(), env: NODE_ENV })
  })

  /* ---- Static files — resolve best frontend path ---- */
  const candidatePaths = [PUBLIC_DIR, FRONTEND_DIST]
  const frontendStaticPath = candidatePaths.find(
    (candidate) => existsSync(join(candidate, 'index.html'))
  )

  if (frontendStaticPath) {
    /* Serve static assets (JS, CSS, images, fonts) from the resolved path */
    app.use(express.static(frontendStaticPath, { maxAge: '1h' }))

    /* SPA fallback — GET requests for non-file paths → index.html.
       Uses app.get() with regex so only GET is caught; POST/PUT/DELETE to
       unknown paths fall through to the JSON 404 below. */
    app.get(/.*/, (req, res) => {
      res.sendFile(join(frontendStaticPath, 'index.html'))
    })
  } else {
    /* No built frontend found — return a helpful message in dev */
    app.get('/', (req, res) => {
      res.status(200).send('ChatOut backend is running. Frontend not built yet.')
    })
  }

  /* 404 fallback — only reached if no static path OR non-GET on unknown path */
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.status(404).json({ error: 'Not found' })
  })

  /* ---- Error handling ---- */
  app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err.message)
    res.status(err.status || 500).json({
      error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
    })
  })

  return app
}
