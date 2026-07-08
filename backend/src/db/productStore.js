/*
 * Product catalog index — used by cart tools to resolve product IDs to
 * full product records (name, price, image, category, etc.) when the
 * AI model calls add_to_cart or recommend.
 *
 * Lazily loads from the frontend's bundled JSON so the demo is
 * self-sufficient. In production this would query the host app's
 * product feed.
 */

let productIndex = null
let productList = null

export async function getProductIndex() {
  if (productIndex) return productIndex
  try {
    const mod = await import('../../../frontend/src/data/products.json', { with: { type: 'json' } })
    const products = mod.default || mod
    productList = products
    productIndex = new Map(products.map((p) => [p.id, p]))
    return productIndex
  } catch (e) {
    productList = []
    productIndex = new Map()
    return productIndex
  }
}

export async function getProductList() {
  if (productList) return productList
  await getProductIndex()
  return productList
}