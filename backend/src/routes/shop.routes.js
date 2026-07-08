/*
 * Shop routes — serves the product catalog and shop context.
 * In production, the host app sends this data via JSON payload.
 * This endpoint provides a demo catalog for standalone testing.
 */

import { Router } from 'express'

const router = Router()

/**
 * GET /api/shop
 * Returns shop context for standalone/demo mode.
 */
router.get('/', (req, res) => {
  res.json({
    ok: true,
    data: {
      shopId: 'demo-shop-001',
      businessName: 'African Heritage Fashion',
      description: 'Authentic African fashion — clothing, footwear, and accessories handcrafted across the continent.',
      currency: 'NGN',
      supportedCurrencies: ['NGN', 'USD', 'GHS', 'KES'],
      contactEmail: 'hello@africanheritage.com',
      socials: {
        instagram: '@africanheritage',
        tiktok: '@africanheritage',
      },
      logoUrl: '/logo.png',
    },
  })
})

export default router
