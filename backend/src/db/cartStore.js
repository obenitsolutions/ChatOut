/*
 * In-memory cart store, keyed by sessionId.
 *
 * Shared between the public cart-tool API (/api/cart/tools) and the chat
 * route (/api/chat) so the model can see — and mutate — the same cart the
 * frontend polls via /api/cart/state.
 *
 * In a multi-process deployment this would back onto Redis; for the
 * single-process ChatOut demo we keep it in-memory. The frontend mirrors
 * its own cart in localStorage so user-side persistence is independent.
 */

const carts = new Map()   // sessionId -> { items: [{ id, name, price, qty, ... }], updatedAt }

const HISTORY_LIMIT = 50

export function getCart(sessionId) {
  const id = sessionId || 'anon'
  if (!carts.has(id)) carts.set(id, { items: [], updatedAt: Date.now() })
  return carts.get(id)
}

export function totalOf(items) {
  return items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0)
}

export function publicView(cart, currency = 'NGN') {
  const sub = totalOf(cart.items)
  return {
    items: cart.items.map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      price: i.price,
      currency: i.currency || currency,
      image: i.image,
      category: i.category,
    })),
    subtotal: sub,
    currency,
    count: cart.items.reduce((s, i) => s + (Number(i.qty) || 0), 0),
  }
}

/* Convert the cart into the XML block the model sees inside the
   system prompt. Pure function — no side effects. */
export function cartToXml(cart, currency = 'NGN') {
  if (!cart || !cart.items.length) return '<cart_state>empty</cart_state>'
  const items = cart.items
    .map((i) =>
      `  <item id="${i.id}" qty="${i.qty}" price="${i.price}" currency="${i.currency || currency}" name="${String(i.name || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}"/>`
    )
    .join('\n')
  const sub = totalOf(cart.items)
  return `<cart_state>
${items}
  <subtotal currency="${currency}">${sub}</subtotal>
  <count>${cart.items.reduce((s, i) => s + (Number(i.qty) || 0), 0)}</count>
</cart_state>`
}

/* Replace the items of a session's cart (used by /api/cart/sync). */
export function setCartItems(sessionId, items) {
  const cart = getCart(sessionId)
  cart.items = (items || [])
    .filter((i) => i && i.id != null && Number(i.qty) > 0)
    .slice(-HISTORY_LIMIT)
    .map((i) => ({
      id: i.id,
      name: i.name,
      price: Number(i.price) || 0,
      currency: i.currency || 'NGN',
      image: i.image,
      category: i.category,
      qty: Math.max(1, Math.min(99, Number(i.qty) || 1)),
    }))
  cart.updatedAt = Date.now()
  return cart
}