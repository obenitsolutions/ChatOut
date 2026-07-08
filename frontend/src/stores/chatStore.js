/*
 * Chat store — manages the conversational AI chat state.
 * Handles messages, session tracking, and the pluggable AI gateway
 * interface.
 *
 * ACTION EXECUTION:
 *   The AI gateway (POST /api/chat) can return `actions[]` such as
 *   { type: 'add_to_cart', productId: 'NG-ANK-001', qty: 1 }.
 *   The chat store applies those actions to the local cart store
 *   so the user immediately sees the change without page reload.
 *
 *   For "recommend" actions, the store just renders product
 *   chips inside the assistant bubble.
 *
 * ARCHITECTURE NOTES (from ChatOut Ideation):
 *   - The AI pipeline is PRIVATE (not in this public repo).
 *   - This store provides the PUBLIC interface — it sends messages
 *     to the backend endpoint `/api/chat` and expects structured
 *     responses (reply + suggestions + actions).
 *   - The private backend handles anonymization → AI call →
 *     de-anonymization; this store is model-agnostic.
 */

import { defineStore } from 'pinia'
import axios from 'axios'
import { useCartStore } from './cartStore.js'

const SESSION_KEY = 'chatout.session.v1'

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [],
    sessionId: '',
    isProcessing: false,
    isOpen: false,
    _hydrated: false,
  }),

  getters: {
    recentMessages: (state) => state.messages.slice(-50),
    hasMessages: (state) => state.messages.length > 0,
  },

  actions: {
    hydrate() {
      if (this._hydrated) return
      this._hydrated = true

      if (typeof window !== 'undefined') {
        try {
          const stored = window.localStorage.getItem(SESSION_KEY)
          if (stored) {
            const data = JSON.parse(stored)
            this.sessionId = data.sessionId || this._generateId()
          } else {
            this.sessionId = this._generateId()
            this._saveSession()
          }
        } catch {
          this.sessionId = this._generateId()
        }
      } else {
        this.sessionId = this._generateId()
      }

      if (this.messages.length === 0) {
        this.messages.push({
          id: this._generateId(),
          role: 'assistant',
          content: "Welcome to ChatOut! I'm your shopping assistant. I can recommend products, add or remove items from your cart, or just chat about the shop. How can I help you today?",
          timestamp: Date.now(),
        })
      }
    },

    async sendMessage(content, context = {}) {
      if (!content || !content.trim()) return
      const cart = useCartStore()

      const userMsg = {
        id: this._generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      }
      this.messages.push(userMsg)
      this.isProcessing = true

      try {
        const response = await axios.post('/api/chat', {
          sessionId: this.sessionId,
          message: userMsg.content,
          context: {
            ...context,
            messages: this.messages.slice(-20),
          },
        })

        const data = response.data || {}
        const actions = Array.isArray(data.actions) ? data.actions : []

        /* Apply non-recommend actions immediately to the local cart.
           Recommendations are rendered as product chips in the bubble
           (the user clicks "Add" themselves — they are not auto-added). */
        const applied = []
        for (const a of actions) {
          if (a.type === 'add_to_cart' && a.productId) {
            const product = this._resolveProduct(a.productId, context)
            if (product) {
              cart.add({ ...product, qty: Math.max(1, Number(a.qty) || 1) })
              applied.push({ type: 'add_to_cart', productId: a.productId, name: product.name, qty: a.qty })
            }
          } else if (a.type === 'remove_from_cart' && a.productId) {
            const product = this._resolveProduct(a.productId, context)
            const qty = Math.max(0, Number(a.qty) || 0)
            if (qty <= 0) cart.remove(a.productId)
            else cart.updateQty(a.productId, Math.max(0, (cart.items.find((i) => i.id === a.productId)?.qty || 0) - qty))
            applied.push({ type: 'remove_from_cart', productId: a.productId, name: product?.name, qty })
          }
        }

        /* Keep only "recommend" actions for the bubble render */
        const recommendations = actions.filter((a) => a.type === 'recommend')

        this.messages.push({
          id: this._generateId(),
          role: 'assistant',
          content: data.reply || "I'm not sure about that. Could you rephrase?",
          timestamp: Date.now(),
          suggestions: data.suggestions || [],
          recommendations,
          appliedActions: applied,
          confirm: data.confirm || null,
          isError: false,
        })
      } catch (err) {
        this.messages.push({
          id: this._generateId(),
          role: 'assistant',
          content: "Sorry, I'm having trouble connecting right now. Please try again.",
          timestamp: Date.now(),
          isError: true,
        })
        console.error('ChatOut AI error:', err)
      } finally {
        this.isProcessing = false
      }
    },

    /* Resolve a product reference (used to enrich action context
       when the local cart store only knows the productId). */
    _resolveProduct(productId, context) {
      const list = (context && context.products) || []
      return list.find((p) => p.id === productId) || null
    },

    /* Apply a recommendation's "Add" button (called from the chat bubble UI). */
    addRecommendation(product) {
      if (!product) return
      const cart = useCartStore()
      cart.add({ ...product, qty: 1 })
    },

    toggle() { this.isOpen = !this.isOpen },
    open() { this.isOpen = true },
    close() { this.isOpen = false },

    clearMessages() {
      this.messages = [{
        id: this._generateId(),
        role: 'assistant',
        content: 'Chat cleared. How can I help you?',
        timestamp: Date.now(),
      }]
    },

    _generateId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
    },
    _saveSession() {
      if (typeof window === 'undefined') return
      try {
        window.localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ sessionId: this.sessionId })
        )
      } catch { /* ignore */ }
    },
  },
})
