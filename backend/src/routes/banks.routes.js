/*
 * Banks routes — exposes the Nigerian bank list for account resolution.
 * Mounted elsewhere at /api/banks. Never crashes: errors return ok:false.
 */

import { Router } from 'express'
import { listBanks } from '../services/flutterwave.service.js'
import { logger } from '../logging/logger.js'

const router = Router()

/**
 * GET /
 * Returns { ok:true, banks } from the Flutterwave service.
 * On failure returns 200 { ok:false, banks:[], error } instead of crashing.
 */
router.get('/', async (req, res) => {
  try {
    const banks = await listBanks()
    res.json({ ok: true, banks })
  } catch (err) {
    logger.error('Failed to list banks', { error: err.message })
    res.json({ ok: false, banks: [], error: err.message })
  }
})

export default router
