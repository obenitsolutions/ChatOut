/*
 * Shop store — manages the product catalog and shop context.
 * Host apps send shop + product data via JSON payload. For demo,
 * we load from a bundled products.json and a default shop config.
 */

import { defineStore } from 'pinia'
import axios from 'axios'
import productsData from '../data/products.json'

/* Default shop context (simulates host app sending this data) */
const defaultShop = {
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
}

export const useShopStore = defineStore('shop', {
  state: () => ({
    /* Shop context (set by host app or defaults) */
    shop: { ...defaultShop },

    /* Product catalog */
    products: [],

    /* UI filters */
    filters: {
      q: '',
      category: '',
      minPrice: null,
      maxPrice: null,
      inStockOnly: false,
      outOfStockOnly: false,
      sort: 'featured',
    },

    loading: false,
    error: null,
  }),

  getters: {
    /** All unique categories from the product catalog */
    categories(state) {
      const cats = new Set(state.products.map((p) => p.category).filter(Boolean))
      return ['All', ...Array.from(cats).sort()]
    },

    /** Filtered and sorted products */
    filteredProducts(state) {
      let results = [...state.products]
      const f = state.filters

      if (f.q) {
        const q = f.q.toLowerCase()
        results = results.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            (p.coreProperties?.color || '').toLowerCase().includes(q) ||
            (p.coreProperties?.material || '').toLowerCase().includes(q)
        )
      }

      if (f.category && f.category !== 'All') {
        results = results.filter((p) => p.category === f.category)
      }

      if (f.minPrice != null) {
        results = results.filter((p) => p.price >= f.minPrice)
      }
      if (f.maxPrice != null) {
        results = results.filter((p) => p.price <= f.maxPrice)
      }

      if (f.inStockOnly) {
        results = results.filter((p) => !p.isOutOfStock && p.stockQuantity > 0)
      } else if (f.outOfStockOnly) {
        results = results.filter((p) => p.isOutOfStock || p.stockQuantity <= 0)
      }

      switch (f.sort) {
        case 'price-asc':  results.sort((a, b) => a.price - b.price); break
        case 'price-desc': results.sort((a, b) => b.price - a.price); break
        case 'name':       results.sort((a, b) => a.name.localeCompare(b.name)); break
        case 'newest':     results.reverse(); break
        default:
          /* 'featured' — promotions first */
          results.sort((a, b) => (b.isOnPromotion ? 1 : 0) - (a.isOnPromotion ? 1 : 0))
      }

      return results
    },

    /** Number of active filter chips (used to show dot on filter button) */
    activeFilterCount(state) {
      const f = state.filters
      let n = 0
      if (f.category && f.category !== 'All') n++
      if (f.minPrice != null || f.maxPrice != null) n++
      if (f.inStockOnly || f.outOfStockOnly) n++
      if (f.sort && f.sort !== 'featured') n++
      return n
    },

    productById: (state) => (id) => state.products.find((p) => p.id === id),
  },

  actions: {
    /**
     * Initialize the shop. In production, a host app calls this with
     * JSON payloads. For demo, we load the bundled products.json.
     */
    init(options = {}) {
      if (options.shop) {
        this.shop = { ...defaultShop, ...options.shop }
      }
      if (options.items && Array.isArray(options.items)) {
        this.products = options.items
      } else {
        /* Demo mode — load bundled data */
        this.products = productsData
      }
    },

    /**
     * Load shop + products for a given storefront slug from the backend.
     * On success, populates via init({ shop, items }). On failure, falls
     * back to bundled demo data so the page never breaks.
     * @param {string} slug - Storefront slug from the route.
     */
    async loadFromSlug(slug) {
      this.loading = true
      this.error = null
      try {
        const response = await axios.get(`/api/storefront/${encodeURIComponent(slug)}`)
        const data = response.data || {}
        if (data.ok) {
          this.init({ shop: data.shop, items: data.products })
          this.shop.slug = slug
        } else {
          throw new Error('Storefront not available')
        }
      } catch (err) {
        this.error = err?.message || 'Failed to load storefront'
        /* Fall back to bundled demo data */
        this.init()
      } finally {
        this.loading = false
      }
    },

    setFilter(key, value) {
      this.filters[key] = value
    },

    /**
     * Set the availability filter at one of three levels.
     *   'all' — both in- and out-of-stock (default)
     *   'in'  — in-stock only
     *   'out' — out-of-stock only
     * Setting either exclusivity also clears the other.
     */
    setAvailability(level) {
      this.filters.inStockOnly    = level === 'in'
      this.filters.outOfStockOnly = level === 'out'
    },

    clearFilters() {
      this.filters = {
        q: '',
        category: '',
        minPrice: null,
        maxPrice: null,
        inStockOnly: false,
        outOfStockOnly: false,
        sort: 'featured',
      }
    },
  },
})
