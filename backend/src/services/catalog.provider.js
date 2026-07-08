/*
 * Catalog provider — fetches per-shop catalog from the host protocol endpoint
 * (CATALOG_PROVIDER_URL) and caches it per-slug with a short TTL.
 *
 * Expected protocol shape (passed through, not transformed):
 *   {
 *     shop: { shopId, slug, businessName, description, currency, logoUrl,
 *             contactEmail, socials },
 *     products: [ { id, name, price, originalPrice, isOnPromotion,
 *                   promotionEndsAt, stockQuantity, isOutOfStock, image,
 *                   images, category, description, currency, coreProperties } ]
 *   }
 */

import { CATALOG_PROVIDER_URL } from '../config/paths.js'
import { logger } from '../logging/logger.js'

const CACHE_TTL_MS = 60_000
const FETCH_TIMEOUT_MS = 15_000

/* module-level per-slug cache: slug -> { expires, data } */
const cache = new Map()

/**
 * Fetch (and cache) a shop's catalog by slug.
 *
 * The base URL to hit is `overrideUrl || CATALOG_PROVIDER_URL`. This lets
 * per-merchant catalog sources (e.g. the bundled demo provider) coexist
 * with the global host provider without special-casing callers.
 *
 * @param {string} slug
 * @param {string|null} [overrideUrl=null] per-merchant provider base URL
 * @returns {Promise<{ shop: Object, products: Array }>}
 */
export async function getCatalog(slug, overrideUrl = null) {
  logger.info('[catalog] fetch', { slug })

  const baseUrl = overrideUrl || CATALOG_PROVIDER_URL
  if (!baseUrl) {
    throw new Error('CATALOG_PROVIDER_URL is not configured')
  }

  /* Cache key includes the resolved base URL so demo vs real never collide. */
  const cacheKey = `${baseUrl}::${slug}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }

  const url = `${baseUrl}?slug=${encodeURIComponent(slug)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
  } catch (err) {
    logger.error('Catalog provider fetch failed', { slug, error: err.message })
    throw new Error(`catalog fetch failed: ${err.message}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    logger.error('Catalog provider returned non-OK', {
      slug,
      status: res.status,
    })
    throw new Error(`catalog fetch failed: HTTP ${res.status}`)
  }

  let json
  try {
    json = await res.json()
  } catch (err) {
    logger.error('Catalog provider returned invalid JSON', {
      slug,
      error: err.message,
    })
    throw new Error(`catalog fetch failed: invalid JSON`)
  }

  const shop =
    json && typeof json.shop === 'object' && json.shop !== null ? json.shop : {}
  const products = Array.isArray(json?.products) ? json.products : []
  const data = { shop, products }

  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data })
  return data
}
