<script setup>
/*
 * CheckoutView — the main ChatOut checkout page.
 * Left: Shop banner, search, category tabs, product grid.
 * Right: Order summary sidebar (cart).
 * The AI chat window floats as an overlay.
 */
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useShopStore } from '../stores/shopStore.js'
import { useCartStore } from '../stores/cartStore.js'
import ProductGrid from '../components/shop/ProductGrid.vue'
import Icon from '../components/ui/Icon.vue'
import TestModeNotice from '../components/ui/TestModeNotice.vue'

const shop = useShopStore()
const cart = useCartStore()
const route = useRoute()

const checkingOut = ref(false)
const checkoutError = ref('')

onMounted(() => {
  /* If a storefront slug is present, load dynamic data; else demo. */
  if (route.params.slug) {
    shop.loadFromSlug(route.params.slug)
  } else {
    /* Default page behaves like a real hosted merchant: load the demo
       storefront so checkout works. loadFromSlug falls back to bundled
       demo data if the backend is momentarily unavailable. */
    shop.loadFromSlug('demo')
  }
  cart.hydrate()
})

/**
 * Start checkout: build the line items, request a checkout link from
 * the backend, then redirect the top window to the payment page.
 */
async function startCheckout() {
  if (cart.isEmpty) return
  checkoutError.value = ''
  checkingOut.value = true
  try {
    const items = cart.items.map((i) => ({ id: i.id, qty: i.qty }))
    const slug = route.params.slug || shop.shop.slug || 'demo'
    const response = await axios.post('/api/checkout', {
      slug,
      items,
      customerEmail: null,
    })
    const data = response.data || {}
    if (data.ok && data.checkoutLink) {
      try {
        window.top.location.href = data.checkoutLink
      } catch {
        /* Cross-origin — redirect our own window instead */
        window.location.href = data.checkoutLink
      }
    } else {
      checkoutError.value = 'Could not start checkout. Please try again.'
    }
  } catch (err) {
    checkoutError.value = err?.message || 'Could not start checkout. Please try again.'
  } finally {
    checkingOut.value = false
  }
}

/**
 * Format price in the shop's currency.
 */
function formatPrice(amount, currency = 'NGN') {
  const value = Number(amount) || 0
  return `${currency} ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
</script>

<template>
  <div class="checkout container">
    <div class="checkout__grid">
      <!-- Left column: Product catalog -->
      <ProductGrid />

        <!-- Right column: Order summary -->
        <aside class="checkout__side">
          <div class="order-summary">
            <h2 class="order-summary__title">Order Summary</h2>

            <!-- Empty cart -->
            <div v-if="cart.isEmpty" class="order-summary__empty">
              <svg class="order-summary__empty-illo" viewBox="0 0 160 120" width="160" height="120" aria-hidden="true">
                <defs>
                  <linearGradient id="bag-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="var(--accent-primary-soft)" />
                    <stop offset="100%" stop-color="var(--surface-glass)" />
                  </linearGradient>
                  <linearGradient id="bag-stroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="var(--accent-primary)" />
                    <stop offset="100%" stop-color="var(--accent-primary-hover)" />
                  </linearGradient>
                </defs>
                <!-- soft surface blob -->
                <ellipse cx="80" cy="100" rx="56" ry="6" fill="var(--surface-glass-strong)" />
                <rect x="28" y="32" width="104" height="64" rx="14" fill="url(#bag-bg)" stroke="url(#bag-stroke)" stroke-width="2" />
                <!-- handles -->
                <path d="M52 32 V24 a12 12 0 0 1 24 0 V32" fill="none" stroke="var(--accent-primary)" stroke-width="2.4" stroke-linecap="round" />
                <path d="M84 32 V24 a12 12 0 0 1 24 0 V32" fill="none" stroke="var(--accent-primary)" stroke-width="2.4" stroke-linecap="round" />
                <!-- divider -->
                <line x1="28" y1="46" x2="132" y2="46" stroke="var(--surface-line-strong)" stroke-width="1.2" />
                <!-- friendly face on the bag -->
                <circle cx="64" cy="68" r="3" fill="var(--accent-primary)" />
                <circle cx="96" cy="68" r="3" fill="var(--accent-primary)" />
                <path d="M70 78 q10 6 20 0" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" />
                <!-- floating sparkles -->
                <g fill="var(--accent-secondary)">
                  <circle cx="138" cy="24" r="2" />
                  <circle cx="146" cy="36" r="1.4" opacity="0.8" />
                  <circle cx="14"  cy="22" r="1.6" opacity="0.7" />
                </g>
              </svg>
              <p class="order-summary__empty-title">Your cart is empty</p>
              <p class="order-summary__empty-hint">Tap the orange <span class="order-summary__plus">+</span> on any product, or ask the AI assistant to add one for you.</p>
            </div>

          <!-- Cart items -->
          <template v-else>
            <div class="order-summary__items">
              <div
                v-for="item in cart.items"
                :key="item.id"
                class="order-summary__item"
              >
                <img
                  :src="item.image"
                  :alt="item.name"
                  class="order-summary__item-img"
                  loading="lazy"
                  @error="$event.target.style.display = 'none'"
                />
                <div class="order-summary__item-info">
                  <span class="order-summary__item-name">{{ item.name }}</span>
                  <span class="order-summary__item-meta">Qty: {{ item.qty }}</span>
                </div>
                <span class="order-summary__item-price">
                  {{ formatPrice(item.price * item.qty, item.currency) }}
                </span>
              </div>
            </div>

            <div class="order-summary__line"></div>

            <div class="order-summary__row">
              <span>Subtotal</span>
              <span>{{ cart.subtotalFormatted }}</span>
            </div>

            <div class="order-summary__line"></div>

            <div class="order-summary__total-row">
              <span>Total</span>
              <span class="order-summary__total-price">{{ cart.subtotalFormatted }}</span>
            </div>

            <TestModeNotice style="margin-top: var(--space-2);" />

            <button
              class="btn btn-primary btn-lg btn-block"
              style="margin-top: var(--space-2);"
              :disabled="checkingOut"
              @click="startCheckout"
            >
              {{ checkingOut ? 'Processing…' : 'Proceed to Pay' }}
            </button>

            <p
              v-if="checkoutError"
              style="font-size: var(--text-xs); color: var(--accent-danger, #e5484d); text-align: center; margin-top: var(--space-2);"
            >
              {{ checkoutError }}
            </p>

            <p style="font-size: var(--text-xs); color: var(--text-muted); text-align: center; margin-top: var(--space-2);">
              Secure payment powered by Nomba.
            </p>
          </template>
        </div>
      </aside>
    </div>

    <!-- How it works section -->
    <section class="section section--lg" style="margin-top: var(--space-8);">
      <div style="text-align: center; margin-bottom: var(--space-7);">
        <span class="eyebrow">How it works</span>
        <h2 style="font-size: var(--text-h2); margin-top: var(--space-2);">
          Chat your way through checkout
        </h2>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-5);">
        <!-- Step 1 -->
        <div class="glass" style="padding: var(--space-6); text-align: center;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--accent-primary-soft); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-4); color: var(--accent-primary);">
            <Icon name="robot" :size="26" />
          </div>
          <h3 style="font-size: var(--text-lg); margin-bottom: var(--space-2);">1. Ask the AI</h3>
          <p style="font-size: var(--text-sm); color: var(--text-muted);">Chat with our assistant. Ask about products, prices, or get recommendations.</p>
        </div>

        <!-- Step 2 -->
        <div class="glass" style="padding: var(--space-6); text-align: center;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--accent-gold-soft); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-4); color: var(--accent-gold);">
            <Icon name="cart" :size="26" />
          </div>
          <h3 style="font-size: var(--text-lg); margin-bottom: var(--space-2);">2. Add to Cart</h3>
          <p style="font-size: var(--text-sm); color: var(--text-muted);">Browse the catalog or let the AI add items for you. Review in real-time.</p>
        </div>

        <!-- Step 3 -->
        <div class="glass" style="padding: var(--space-6); text-align: center;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(46,212,168,0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-4); color: var(--accent-secondary);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h3 style="font-size: var(--text-lg); margin-bottom: var(--space-2);">3. Checkout</h3>
          <p style="font-size: var(--text-sm); color: var(--text-muted);">Complete your purchase securely. Payment via Nomba — fast and reliable.</p>
        </div>
      </div>
    </section>
  </div>
</template>
