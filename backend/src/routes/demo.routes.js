/*
 * Demo routes — simulates a host catalog provider (exactly like any host
 * app would serve) so ChatOut's demo checkout works end-to-end with Nomba
 * test keys. It serves ChatOut's OWN bundled demo catalog in the ChatOut
 * Catalog Protocol shape: { shop, products }.
 *
 * Mounted by the orchestrator at /api/demo, so the catalog endpoint is
 * GET /api/demo/catalog?slug=demo. Any slug returns the demo shop.
 */

import { Router } from 'express'
import { logger } from '../logging/logger.js'

const router = Router()

const DEMO_SHOP = {
  shopId: 'demo-shop-001',
  slug: 'demo',
  businessName: 'African Heritage Fashion',
  description: 'Demo storefront for testing ChatOut checkout with Nomba test keys.',
  currency: 'NGN',
  logoUrl: '/logo.png',
  contactEmail: 'hello@africanheritage.com',
  socials: {
    instagram: '@africanheritage',
    tiktok: '@africanheritage',
  },
}

/* Lazily import the bundled demo catalog. Prefer the backend-local copy
 * (shipped in production) and fall back to the frontend source in dev. */
let bundledProducts = null
async function loadBundledProducts() {
  if (bundledProducts) return bundledProducts
  try {
    const mod = await import('../data/products.json', { with: { type: 'json' } })
    bundledProducts = mod.default || mod
  } catch {
    const mod = await import('../../../frontend/src/data/products.json', { with: { type: 'json' } })
    bundledProducts = mod.default || mod
  }
  return bundledProducts
}

router.get('/catalog', async (req, res) => {
  const slug = req.query.slug || 'demo'
  try {
    logger.info('[demo] catalog request', { slug })
    const products = await loadBundledProducts()
    res.json({ shop: DEMO_SHOP, products })
  } catch (err) {
    logger.error('[demo] catalog failed', { slug, error: err.message })
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
