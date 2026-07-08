/*
 * Partner authentication middleware — bearer-token guard for server-to-server
 * host-app -> ChatOut traffic (/api/merchants/*).
 *
 * PARTNER_API_KEY must be set in backend/.env. If unset, partner routes
 * refuse all traffic (fail-closed). Tokens are accepted via:
 *   - Authorization: Bearer <key>
 *   - X-Partner-Key: <key>
 *
 * Returns JSON 401/503 (never an HTML page) so API consumers get a
 * predictable error format. Uses crypto.timingSafeEqual for constant-time
 * comparison to thwart timing attacks.
 */

import crypto from 'crypto'
import { PARTNER_API_KEY } from '../config/paths.js'
import { logger } from '../logging/logger.js'

export function partnerAuth(req, res, next) {
  const expected = PARTNER_API_KEY
  if (!expected) {
    logger.warn('[partner] PARTNER_API_KEY not set — refusing partner request')
    return res.status(503).json({ ok: false, error: 'partner endpoints disabled (PARTNER_API_KEY not configured)' })
  }

  const auth = String(req.get('authorization') || '')
  const headerKey = String(req.get('x-partner-key') || '')
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const provided = bearer || headerKey

  if (!provided || !safeEqual(provided, expected)) {
    logger.warn(`[partner] rejected request from ${req.ip} to ${req.originalUrl}`)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  next()
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
