/*
 * Cart store — manages the shopping cart state.
 * Persisted to localStorage so cart survives iframe reloads.
 * Public API: add, remove, updateQty, clear, openDrawer/closeDrawer
 */

import { defineStore } from 'pinia'

const STORAGE_KEY = 'chatout.cart.v1'

/**
 * Format a price in the shop's currency.
 * @param {number} amount - Price value
 * @param {string} currency - Currency code (e.g., 'NGN')
 * @returns {string} Formatted price string
 */
function formatPrice(amount, currency = 'NGN') {
  const value = Number(amount) || 0
  const formatted = value.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${currency} ${formatted}`
}

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: [],
    drawerOpen: false,
    _hydrated: false,
  }),

  getters: {
    /** Total unique items count */
    count: (state) => state.items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0),

    /** Subtotal in numeric form */
    subtotal: (state) =>
      state.items.reduce(
        (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 0),
        0
      ),

    /** Formatted subtotal string */
    subtotalFormatted() {
      const currency = this.items[0]?.currency || 'NGN'
      return formatPrice(this.subtotal, currency)
    },

    /** Whether the cart is empty */
    isEmpty: (state) => state.items.length === 0,
  },

  actions: {
    /** Restore cart from localStorage */
    hydrate() {
      if (this._hydrated) return
      this._hydrated = true
      if (typeof window === 'undefined') return
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (parsed && Array.isArray(parsed.items)) {
          this.items = parsed.items.filter(
            (i) => i && i.id != null && Number(i.qty) > 0
          )
        }
      } catch {
        this.items = []
      }
    },

    /** Save cart to localStorage */
    persist() {
      if (typeof window === 'undefined') return
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ v: 1, items: this.items, t: Date.now() })
        )
      } catch {
        /* quota or privacy mode — silently ignore */
      }
    },

    /**
     * Add an item to the cart.
     * If the same product is already in the cart, increments quantity.
     * @param {Object} item - Product with id, name, price, image, currency, etc.
     */
    add(item) {
      if (!item || item.id == null) return
      const qty = Math.max(1, Number(item.qty) || 1)
      const existing = this.items.find((i) => i.id === item.id)
      if (existing) {
        existing.qty = (Number(existing.qty) || 0) + qty
      } else {
        this.items.push({
          id: item.id,
          name: item.name || '',
          price: Number(item.price) || 0,
          originalPrice: item.originalPrice || null,
          image: item.image || '',
          currency: item.currency || 'NGN',
          category: item.category || '',
          qty,
        })
      }
      this.drawerOpen = true
      this.persist()
    },

    /** Update quantity of an item. Removes item if qty <= 0. */
    updateQty(id, qty) {
      const n = Number(qty)
      const item = this.items.find((i) => i.id === id)
      if (!item) return
      if (!n || n <= 0) {
        this.remove(id)
        return
      }
      item.qty = n
      this.persist()
    },

    /** Remove an item from the cart by ID */
    remove(id) {
      this.items = this.items.filter((i) => i.id !== id)
      this.persist()
    },

    /** Clear the entire cart */
    clear() {
      this.items = []
      this.persist()
    },

    openDrawer() {
      this.drawerOpen = true
    },
    closeDrawer() {
      this.drawerOpen = false
    },
    toggleDrawer() {
      this.drawerOpen = !this.drawerOpen
    },
  },
})
