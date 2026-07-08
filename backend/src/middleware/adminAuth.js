/*
 * Admin authentication middleware — bearer-token guard for /api/admin/*.
 *
 * ADMIN_API_KEY must be set in backend/.env. If unset, admin routes
 * refuse all traffic (fail-closed). Tokens are accepted via:
 *   - Authorization: Bearer <key>
 *   - X-Admin-Key: <key>
 *
 * Returns JSON 401 (never an HTML login page) so API consumers get a
 * predictable error format.
 */

import { logger } from '../logging/logger.js'

export function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_API_KEY
  if (!expected) {
    logger.warn('[admin] ADMIN_API_KEY not set — refusing admin request')
    return res.status(503).json({ ok: false, error: 'admin endpoints disabled (ADMIN_API_KEY not configured)' })
  }

  const auth = String(req.get('authorization') || '')
  const headerKey = String(req.get('x-admin-key') || '')
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const provided = bearer || headerKey

  /* Constant-time comparison to thwart timing attacks. */
  if (!provided || !safeEqual(provided, expected)) {
    logger.warn(`[admin] rejected request from ${req.ip} to ${req.originalUrl}`)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  next()
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}