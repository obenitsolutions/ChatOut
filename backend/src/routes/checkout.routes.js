/*
 * Checkout routes — server-side re-priced checkout via Nomba.
 * Mounted by the orchestrator at /api/checkout.
 *
 *   POST /                    -> create Nomba checkout order
 *   GET  /order/:reference    -> fetch order status
 */

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getCatalog } from '../services/catalog.provider.js'
import { getMerchantBySlug } from '../db/merchants.js'
import { createCheckoutOrder } from '../services/nomba.service.js'
import { createOrder } from '../db/orders.js'
import { getOrderByReference } from '../db/orders.js'
import { NOMBA_SUB_ACCOUNT_ID, APP_PUBLIC_URL } from '../config/paths.js'
import { logger } from '../logging/logger.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { slug, items, customerEmail } = req.body ?? {}

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ ok: false, error: 'slug_required' })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'items_required' })
    }

    const merchant = await getMerchantBySlug(slug)
    if (!merchant) {
      return res
        .status(404)
        .json({ ok: false, error: 'merchant_not_configured' })
    }

    const catalog = await getCatalog(slug)
    const productMap = new Map(
      (catalog.products || []).map((p) => [String(p.id), p]),
    )

    let total = 0
    const repricedItems = []
    for (const item of items) {
      const qty = Number(item?.qty)
      const product = productMap.get(String(item?.id))
      if (!product) {
        return res
          .status(400)
          .json({ ok: false, error: `unknown_product:${item?.id}` })
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return res
          .status(400)
          .json({ ok: false, error: `invalid_qty:${item?.id}` })
      }
      const price = Number(product.price) || 0
      const lineTotal = price * qty
      total += lineTotal
      repricedItems.push({
        id: product.id,
        name: product.name,
        price,
        qty,
        lineTotal,
      })
    }

    const reference = 'CHATOUT-' + Date.now().toString(36).toUpperCase()
    const id = randomUUID()
    const amount = total.toFixed(2)
    const callbackUrl = `${APP_PUBLIC_URL}/#/confirmation/${reference}`

    const nomba = await createCheckoutOrder({
      amount,
      currency: merchant.currency || 'NGN',
      customerEmail: customerEmail || 'buyer@chatout.app',
      callbackUrl,
      orderReference: reference,
      accountId: merchant.sub_account_id || NOMBA_SUB_ACCOUNT_ID || null,
      orderMetaData: {
        slug,
        businessId: String(merchant.business_id),
        chatoutOrderId: reference,
      },
    })

    await createOrder({
      id,
      reference,
      slug,
      sessionId: req.body.sessionId || null,
      items: repricedItems,
      totalMinor: Math.round(total * 100),
      currency: merchant.currency || 'NGN',
      customer: { email: customerEmail || null },
      nombaOrderReference: nomba.orderReference,
      checkoutLink: nomba.checkoutLink,
    })

    res.json({ ok: true, reference, checkoutLink: nomba.checkoutLink })
  } catch (err) {
    logger.error('Checkout failed', { error: err.message })
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/order/:reference', async (req, res) => {
  try {
    const order = await getOrderByReference(req.params.reference)
    if (!order) {
      return res.status(404).json({ ok: false, error: 'order_not_found' })
    }
    res.json({ ok: true, order })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
