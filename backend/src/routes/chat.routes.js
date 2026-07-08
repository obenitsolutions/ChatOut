/*
 * Chat routes — the DeepSeek V4 Flash gateway.
 *
 * PUBLIC CONTRACT (do NOT change without bumping the public plugin):
 *   POST /api/chat  →  { sessionId, message, context }
 *   Returns          { reply, actions, cart, usage, grounding, sessionId, model, elapsedMs }
 *
 * Uses DeepSeek V4 Flash exclusively. Per-shop prefix caching via the
 * stable system prompt prefix (catalog XML + shop info + PROMPT_VERSION).
 *
 * PRIVACY layers:
 *   1. userMessage PII → tokens
 *   2. shop fields (businessName, contactEmail, contactPhone, address) → tokens
 *
 * TOOL CALLING:
 *   DeepSeek returns native `tool_calls` (add_to_cart / remove_from_cart /
 *   get_cart / recommend). We execute in-process via cartTools.js,
 *   loop up to MAX_TOOL_ROUNDS times, return the final visible reply
 *   plus the list of executed `actions[]` so the frontend can apply
 *   them locally.
 *
 * GROUNDING VERIFICATION:
 *   After the tool loop completes, we make a SECOND near-deterministic
 *   DeepSeek call that checks the reply against the catalog XML +
 *   cart_state. If severity === 'high', we regenerate once with a
 *   chain-of-thought correction prompt at temp 0.1. Fail-OPEN — a
 *   verification failure NEVER blocks the user.
 *
 * INTERACTIONS DB:
 *   Every exchange is saved (fire-and-forget) to
 *   backend/data/interactions.sqlite, including the grounding
 *   verification result.
 *
 * NO regex-based intent matching. The model decides everything.
 */

import { Router } from 'express'
import {
  anonymize,
  deanonymize,
  createMappingStore,
  anonymizeShop,
  deanonymizeShop,
} from '../anonymization/index.js'
import { logger } from '../logging/logger.js'
import { rateLimit } from '../middleware/rateLimit.js'
import {
  callDeepSeek,
  buildMessages,
  shopCacheKey,
  DEEPSEEK_MODEL,
  buildCatalogXml,
  PROMPT_VERSION,
} from '../services/deepseek.service.js'
import { verifyAndCorrect } from '../services/grounding.service.js'
import { saveInteraction, getInteractions, getInteractionsCount } from '../db/interactions.js'
import { getCart, publicView } from '../db/cartStore.js'

const router = Router()

const catalogByShop = new Map()

function productsForShop(shopId, ctxProducts) {
  const key = shopCacheKey(shopId)
  if (ctxProducts && Array.isArray(ctxProducts) && ctxProducts.length) {
    catalogByShop.set(key, ctxProducts)
    return ctxProducts
  }
  if (catalogByShop.has(key)) return catalogByShop.get(key)
  return []
}

let bundledProducts = null
async function loadBundledProducts() {
  if (bundledProducts) return bundledProducts
  try {
    const mod = await import('../../../frontend/src/data/products.json', { with: { type: 'json' } })
    bundledProducts = mod.default || mod
    return bundledProducts
  } catch (e) {
    logger.warn('Bundled products unavailable:', e.message)
    bundledProducts = []
    return bundledProducts
  }
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return []
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
}

function toolCallsToActions(toolCalls = []) {
  const out = []
  for (const tc of toolCalls) {
    if (!tc.ok) continue
    if (tc.name === 'add_to_cart') {
      out.push({
        type: 'add_to_cart',
        productId: tc.args?.productId,
        qty: Number(tc.args?.qty) || 1,
        name: tc.data?.product?.name || null,
      })
    } else if (tc.name === 'remove_from_cart') {
      out.push({
        type: 'remove_from_cart',
        productId: tc.args?.productId,
        qty: tc.args?.qty ? Number(tc.args.qty) : null,
        name: tc.data?.removed?.name || tc.data?.product?.name || null,
      })
    } else if (tc.name === 'recommend') {
      for (const p of (tc.data?.products || [])) {
        out.push({ type: 'recommend', productId: p.id, name: p.name, price: p.price, currency: p.currency, image: p.image, isOnPromotion: p.isOnPromotion })
      }
    }
  }
  return out
}

router.post('/', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const startedAt = Date.now()
  const { sessionId, message, context } = req.body || {}

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }
  if (message.length > 1500) {
    return res.status(400).json({ error: 'message too long (max 1500 chars)' })
  }

  const incomingShop = context?.shop || {}
  const shopId = incomingShop.shopId || incomingShop.businessName || 'demo-shop-001'

  let products = productsForShop(shopId, context?.products)
  if (!products.length) {
    products = await loadBundledProducts()
    catalogByShop.set(shopCacheKey(shopId), products)
  }

  const userPiiMap = createMappingStore()
  const safeMessage = anonymize(message, userPiiMap)
  const userPiiCount = userPiiMap.size
  if (userPiiCount > 0) logger.debug(`Anonymized ${userPiiCount} user-PII token(s) for session ${sessionId || 'unknown'}`)

  const shopAnonMap = {}
  const tokenizedShop = anonymizeShop(incomingShop, shopAnonMap)
  const shopNameForDisplay = incomingShop.businessName || 'the shop'
  const contactEmailForDisplay = incomingShop.contactEmail || ''

  const cart = getCart(sessionId || 'anon')
  const catalogXml = buildCatalogXml(products)
  const cartXml = publicView(cart)

  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      return res.json({
        reply: `*(Demo mode — no DeepSeek key configured.)*\n\nI can see the catalog has **${products.length}** product(s) and your cart has **${cart.items.length}** item(s). Once the key is wired up I'll answer your questions live.`,
        actions: [],
        usage: { total: 0, cacheHit: 0, cacheMiss: 0 },
        sessionId: sessionId || null,
        model: 'demo',
        elapsedMs: Date.now() - startedAt,
        promptVersion: PROMPT_VERSION,
      })
    }

    const messages = buildMessages({
      shopName: shopNameForDisplay,
      currency: tokenizedShop.currency || incomingShop.currency || 'NGN',
      contactEmail: contactEmailForDisplay,
      contactPhone: tokenizedShop.contactPhone || '',
      address: tokenizedShop.address || '',
      contactDisplay: contactEmailForDisplay,
      products,
      history: normalizeHistory(context?.messages),
      userMessage: safeMessage,
      shopAnonMap,
      cart,
    })

    const out = await callDeepSeek({ messages, sessionId: sessionId || 'anon' })

    let reply = out.reply
    if (userPiiCount > 0) reply = deanonymize(reply, userPiiMap)
    if (Object.keys(shopAnonMap).length > 0) reply = deanonymizeShop(reply, shopAnonMap)

    /* ---- Grounding verification (pass 2) ---- */
    const grounding = await verifyAndCorrect({
      reply,
      catalogXml,
      cartXml: JSON.stringify(cartXml),
      userMessage: safeMessage,
    })
    reply = grounding.reply

    const actions = toolCallsToActions(out.toolCalls || [])
    const finalCart = getCart(sessionId || 'anon')
    const elapsedMs = Date.now() - startedAt

    logger.info(
      `[chat] model=${out.model} rounds=${out.rounds} ` +
      `cache_hit=${out.usage.cacheHit} cache_miss=${out.usage.cacheMiss} ` +
      `prompt=${out.usage.prompt} completion=${out.usage.completion} total=${out.usage.total} ` +
      `ground=${grounding.verified ? (grounding.passed ? 'pass' : `fail:${grounding.severity}`) : 'skip'} ` +
      `regen=${grounding.wasRegenerated} ` +
      `elapsed=${elapsedMs}ms shop=${shopCacheKey(shopId)} ` +
      `user_pii_tokens=${userPiiCount} shop_anon_tokens=${Object.keys(shopAnonMap).length} ` +
      `tools=${(out.toolCalls || []).map((t) => t.name).join(',') || 'none'} ` +
      `pv=${PROMPT_VERSION}`
    )

    saveInteraction({
      shopId,
      sessionId: sessionId || 'anon',
      userMessage: safeMessage,
      assistantReply: reply,
      toolCalls: out.toolCalls || [],
      cartState: publicView(finalCart),
      catalogXml,
      promptTokens: out.usage.prompt,
      completionTokens: out.usage.completion,
      totalTokens: out.usage.total,
      cacheHitTokens: out.usage.cacheHit,
      cacheMissTokens: out.usage.cacheMiss,
      modelUsed: out.model,
      responseTimeMs: elapsedMs,
      groundingVerified: grounding.verified,
      groundingPassed: grounding.passed,
      groundingSeverity: grounding.severity,
      groundingIssues: grounding.issues,
      wasRegenerated: grounding.wasRegenerated,
      promptVersion: PROMPT_VERSION,
    }).catch((err) => logger.error('[interactions] save failed:', err.message))

    res.json({
      reply,
      actions,
      cart: publicView(finalCart),
      usage: out.usage,
      grounding: {
        verified: grounding.verified,
        passed: grounding.passed,
        severity: grounding.severity,
        issues: grounding.issues,
        wasRegenerated: grounding.wasRegenerated,
      },
      sessionId: sessionId || null,
      model: out.model,
      rounds: out.rounds,
      promptVersion: PROMPT_VERSION,
      elapsedMs,
    })
  } catch (err) {
    logger.error('DeepSeek chat failed:', err?.message || '(no message)', '\n', err?.stack || '')
    const friendly =
      err?.name === 'AbortError'
        ? "The AI service took too long to respond. Please try again."
        : "I'm having trouble reaching the shopping assistant right now. Please try again in a moment."
    res.status(200).json({
      reply: friendly,
      sessionId: sessionId || null,
    })
  }
})

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    model: DEEPSEEK_MODEL,
    promptVersion: PROMPT_VERSION,
    hasKey: !!process.env.DEEPSEEK_API_KEY,
    cachedShops: catalogByShop.size,
  })
})

export default router