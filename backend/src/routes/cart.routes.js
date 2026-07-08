/*
 * Cart Tool routes — the pluggable AI ↔ cart bridge.
 *
 * PUBLIC CONTRACT (exposed for AI agents to call):
 *   POST /api/cart/tools
 *     Body: { tool: 'add_to_cart' | 'remove_from_cart' | 'get_cart' | 'recommend',
 *             args: { productId?, qty?, query?, category?, maxPrice? },
 *             sessionId?: string }
 *     Returns: { ok: true, tool, data: <tool-specific>, message: string }
 *
 * AI agents (e.g. the private `ai-agent/` layer) call this endpoint
 * to mutate the shopping cart on behalf of the user during a
 * conversation. The frontend polls `/api/cart/state?sessionId=...`
 * to pick up the changes and update its Pinia cart store.
 *
 * In a real deployment with the private AI Agent running locally,
 * this layer would be replaced by a direct in-process call. Keeping
 * it as an HTTP endpoint makes the public/private boundary clean
 * and keeps the public ChatOut repo free of the private RAG stack.
 *
 * PRIVACY:
 *   - All requests pass through the anonymization layer before any
 *     product lookup. Customer names / emails / phones in the
 *     session are replaced with [PII_TOKEN_*] before they touch
 *     logs or external services.
 *   - We never echo PII back in responses.
 */

import { Router } from 'express'
import { logger } from '../logging/logger.js'
import { anonymize, deanonymize, createMappingStore, getTokenCount } from '../anonymization/index.js'
import { executeTool } from '../services/cartTools.js'
import { getCart, publicView, setCartItems } from '../db/cartStore.js'

const router = Router()

/* ------------------------------------------------------------------
 * POST /api/cart/tools
 * ------------------------------------------------------------------ */
router.post('/tools', async (req, res) => {
  try {
    const { tool, args, sessionId } = req.body || {}
    if (!tool || typeof tool !== 'string') {
      return res.status(400).json({ ok: false, error: 'tool is required' })
    }

    const mappingStore = createMappingStore()
    const safeArgs = { ...(args || {}) }
    if (typeof safeArgs.query === 'string') {
      safeArgs.query = anonymize(safeArgs.query, mappingStore)
    }
    const tokenCount = getTokenCount(mappingStore)
    if (tokenCount > 0) logger.debug(`Anonymized ${tokenCount} PII token(s) in cart-tool args`)

    const result = await executeTool(tool, safeArgs, sessionId)

    if (result?.data?.query && tokenCount > 0) {
      result.data.query = deanonymize(result.data.query, mappingStore)
    }

    res.json({ ...result, sessionId: sessionId || 'anon' })
  } catch (err) {
    logger.error('cart-tool error:', err.message)
    res.status(500).json({ ok: false, error: 'cart tool failed', message: err.message })
  }
})

/* ------------------------------------------------------------------
 * GET /api/cart/state?sessionId=...
 * ------------------------------------------------------------------ */
router.get('/state', (req, res) => {
  const sessionId = String(req.query.sessionId || 'anon')
  const cart = getCart(sessionId)
  res.json({ ok: true, data: publicView(cart), sessionId })
})

/* ------------------------------------------------------------------
 * POST /api/cart/sync
 * ------------------------------------------------------------------ */
router.post('/sync', (req, res) => {
  const { sessionId, items } = req.body || {}
  if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: 'items[] required' })
  const cart = setCartItems(sessionId || 'anon', items)
  res.json({ ok: true, data: publicView(cart), sessionId: sessionId || 'anon' })
})

/* ------------------------------------------------------------------
 * GET /api/cart/spec
 * ------------------------------------------------------------------ */
router.get('/spec', (_req, res) => {
  res.json({
    ok: true,
    tools: [
      { name: 'add_to_cart',      description: "Add a product to the user's shopping cart.",
        args: { productId: 'string (required, e.g. NG-ANK-001)', qty: 'number (1-99, default 1)' },
        returns: 'product, addedQty, cart' },
      { name: 'remove_from_cart', description: 'Remove a product (or some of its quantity) from the cart.',
        args: { productId: 'string (required)', qty: 'number (optional; omit for full remove)' },
        returns: 'removed, cart' },
      { name: 'get_cart',         description: 'Read the current state of the user\'s cart.',
        args: {}, returns: 'cart' },
      { name: 'recommend',        description: 'Recommend products that match a free-text query and optional filters.',
        args: { query: 'string', category: 'string', minPrice: 'number', maxPrice: 'number', limit: 'number' },
        returns: 'products[]' },
    ],
  })
})

export default router