/*
 * Cart tool executor — the same tool implementations exposed to
 * external AI agents at POST /api/cart/tools are reused by the chat
 * route when DeepSeek returns native tool_calls.
 *
 * Public contract:
 *   executeTool(name, args, sessionId) → { ok, data, message, code? }
 *
 * Tool surface (also exposed to the LLM as native function-calling
 * definitions — see deepseek.service.js → buildTools()):
 *   - add_to_cart     args: { productId, qty }
 *   - remove_from_cart args: { productId, qty? }   (omit qty for full remove)
 *   - get_cart        args: {}
 *   - recommend       args: { query?, category?, minPrice?, maxPrice?, limit? }
 */

import { getProductIndex } from '../db/productStore.js'
import { getCart, totalOf, publicView } from '../db/cartStore.js'

export async function executeTool(name, args = {}, sessionId) {
  switch (name) {
    case 'add_to_cart':      return toolAddToCart(args, sessionId)
    case 'remove_from_cart': return toolRemoveFromCart(args, sessionId)
    case 'get_cart':         return toolGetCart(args, sessionId)
    case 'recommend':        return await toolRecommend(args, sessionId)
    default:
      return { ok: false, code: 'UNKNOWN_TOOL', message: `Unknown tool "${name}"` }
  }
}

async function toolAddToCart(args, sessionId) {
  const idx = await getProductIndex()
  const id = String(args?.productId || '').trim()
  if (!id) return { ok: false, code: 'MISSING_PRODUCT_ID', message: 'productId is required' }
  const product = idx.get(id)
  if (!product) return { ok: false, code: 'UNKNOWN_PRODUCT', message: `No product with id "${id}"` }
  if (product.isOutOfStock || (Number(product.stockQuantity) || 0) <= 0) {
    return { ok: false, code: 'OUT_OF_STOCK', message: `${product.name} is out of stock` }
  }
  const qty = Math.max(1, Math.min(99, Number(args?.qty) || 1))

  const cart = getCart(sessionId)
  const existing = cart.items.find((i) => i.id === id)
  if (existing) {
    existing.qty = (Number(existing.qty) || 0) + qty
  } else {
    cart.items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      image: product.image,
      category: product.category,
      qty,
    })
  }
  cart.updatedAt = Date.now()
  return {
    ok: true,
    data: {
      product: { id: product.id, name: product.name },
      addedQty: qty,
      cart: publicView(cart, product.currency),
    },
    message: `Added ${qty} × ${product.name} to the cart`,
  }
}

function toolRemoveFromCart(args, sessionId) {
  const cart = getCart(sessionId)
  const id = String(args?.productId || '').trim()
  if (!id) return { ok: false, code: 'MISSING_PRODUCT_ID', message: 'productId is required' }
  const before = cart.items.find((i) => i.id === id)
  if (!before) return { ok: false, code: 'NOT_IN_CART', message: `${id} is not in the cart` }

  if (args?.qty == null) {
    cart.items = cart.items.filter((i) => i.id !== id)
    cart.updatedAt = Date.now()
    return {
      ok: true,
      data: { removed: { id, name: before.name, qty: before.qty }, cart: publicView(cart, before.currency) },
      message: `Removed ${before.name} from the cart`,
    }
  }
  const target = Math.max(0, Number(args.qty))
  if (target === 0 || target >= before.qty) {
    cart.items = cart.items.filter((i) => i.id !== id)
    cart.updatedAt = Date.now()
    return {
      ok: true,
      data: { removed: { id, name: before.name, qty: before.qty }, cart: publicView(cart, before.currency) },
      message: `Removed ${before.name} from the cart`,
    }
  }
  before.qty = before.qty - target
  cart.updatedAt = Date.now()
  return {
    ok: true,
    data: { product: { id, name: before.name }, removedQty: target, cart: publicView(cart, before.currency) },
    message: `Removed ${target} × ${before.name} from the cart`,
  }
}

function toolGetCart(_args, sessionId) {
  const cart = getCart(sessionId)
  return { ok: true, data: publicView(cart), message: `Cart has ${cart.items.length} item type(s)` }
}

async function toolRecommend(args, _sessionId) {
  const idx = await getProductIndex()
  const all = [...idx.values()]
  const q = String(args?.query || '').toLowerCase().trim()
  const cat = String(args?.category || '').toLowerCase().trim()
  const max = args?.maxPrice != null ? Number(args.maxPrice) : null
  const min = args?.minPrice != null ? Number(args.minPrice) : null
  const limit = Math.max(1, Math.min(10, Number(args?.limit) || 5))

  let candidates = all.filter((p) => !p.isOutOfStock && (Number(p.stockQuantity) || 0) > 0)
  if (cat) candidates = candidates.filter((p) => (p.category || '').toLowerCase().includes(cat))
  if (max != null) candidates = candidates.filter((p) => Number(p.price) <= max)
  if (min != null) candidates = candidates.filter((p) => Number(p.price) >= min)
  if (q) {
    candidates = candidates.filter((p) => {
      const hay = `${p.name} ${p.description} ${p.coreProperties?.color || ''} ${p.coreProperties?.material || ''} ${p.category || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }
  candidates.sort((a, b) => (b.isOnPromotion ? 1 : 0) - (a.isOnPromotion ? 1 : 0))

  return {
    ok: true,
    data: { products: candidates.slice(0, limit).map((p) => ({
      id: p.id, name: p.name, price: p.price, currency: p.currency,
      image: p.image, category: p.category, isOnPromotion: !!p.isOnPromotion,
    })) },
    message: `Found ${candidates.length} matching product(s)`,
  }
}