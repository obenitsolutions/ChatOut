/*
 * Admin / inspection endpoints — read-only views into the interactions
 * database. Useful for debugging, evaluating the assistant, and
 * exporting training data later.
 *
 * PROTECTED by ADMIN_API_KEY (bearer token) — see middleware/adminAuth.js.
 * Set ADMIN_API_KEY in backend/.env to enable; if unset, admin routes
 * refuse all traffic (fail-closed).
 */

import { Router } from 'express'
import {
  getInteractions,
  getInteractionsCount,
  getInteractionsCountSince,
  getInteractionById,
  interactionsDbPath,
} from '../db/interactions.js'

const router = Router()

/* GET /api/admin/interactions?limit=50&offset=0&shopId=...&sessionId=... */
router.get('/interactions', async (req, res) => {
  try {
    const { shopId, sessionId } = req.query
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50))
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const rows = await getInteractions({ shopId, sessionId, limit, offset })
    const total = await getInteractionsCount({ shopId, sessionId })
    res.json({ ok: true, total, limit, offset, count: rows.length, rows, dbPath: interactionsDbPath() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/* GET /api/admin/interactions/:id — single exchange with the full
   ground-truth catalog XML that was sent to the model. */
router.get('/interactions/:id', async (req, res) => {
  try {
    const row = await getInteractionById(req.params.id)
    if (!row) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, row })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/* GET /api/admin/stats — quick aggregate counters. */
router.get('/stats', async (req, res) => {
  try {
    const total = await getInteractionsCount()
    const since24h = await getInteractionsCountSince(Date.now() - 24 * 3600_000)
    res.json({ ok: true, total, last24h: since24h, dbPath: interactionsDbPath() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router