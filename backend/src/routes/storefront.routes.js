/*
 * Storefront routes — public catalog read.
 * Mounted by the orchestrator at /api/storefront.
 *
 *   GET /:slug  ->  { ok:true, shop, products }
 */

import { Router } from 'express'
import { getCatalog } from '../services/catalog.provider.js'

const router = Router()

router.get('/:slug', async (req, res) => {
  try {
    const data = await getCatalog(req.params.slug)
    res.json({ ok: true, ...data })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

export default router
