/*
 * Storefront routes — public catalog read.
 * Mounted by the orchestrator at /api/storefront.
 *
 *   GET /:slug  ->  { ok:true, shop, products }
 *
 * Resolution mirrors checkout.routes.js: if the slug is a registered merchant
 * with a per-merchant `catalog_url`, that override is used; otherwise the
 * global CATALOG_PROVIDER_URL is used. This keeps ChatOut host-agnostic —
 * the demo merchant points at ChatOut's own /api/demo/catalog, while real
 * merchants use the configured global provider.
 */

import { Router } from 'express'
import { getCatalog } from '../services/catalog.provider.js'
import { getMerchantBySlug } from '../db/merchants.js'
import { logger } from '../logging/logger.js'

const router = Router()

router.get('/:slug', async (req, res) => {
  const { slug } = req.params
  try {
    const merchant = await getMerchantBySlug(slug)
    const overrideUrl = merchant?.catalog_url || null
    logger.info('[storefront] fetch', { slug, hasOverride: !!overrideUrl })
    const data = await getCatalog(slug, overrideUrl)
    res.json({ ok: true, ...data })
  } catch (err) {
    logger.error('[storefront] fetch failed', { slug, error: err.message })
    res.status(502).json({ ok: false, error: err.message })
  }
})

export default router
