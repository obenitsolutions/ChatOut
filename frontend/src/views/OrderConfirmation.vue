<script setup>
/*
 * OrderConfirmation — shown after successful order placement.
 * Displays order reference, items, and next steps.
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useCartStore } from '../stores/cartStore.js'
import TestModeNotice from '../components/ui/TestModeNotice.vue'

const route = useRoute()
const cart = useCartStore()

const reference = ref(route.params.reference || 'CHATOUT-0001')
const orderDate = ref(new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }))

/* Real order fields (populated when a live order is fetched) */
const isRealOrder = ref(false)
const status = ref('Confirmed')
const items = ref([])
const total = ref(null)
const currency = ref('NGN')
const paidAt = ref(null)

/* Whether the order is a confirmed, paid success. */
const isPaid = computed(() => String(status.value).toLowerCase() === 'paid')
const heading = computed(() => (isRealOrder.value && isPaid.value ? 'Payment successful!' : 'Order Confirmed!'))
const subheading = computed(() =>
  isRealOrder.value && isPaid.value
    ? 'Your payment was successful and your order is confirmed. We\'ll process it right away.'
    : 'Your order has been placed successfully. We\'ll process it right away.'
)

function formatPrice(amount, curr = 'NGN') {
  const value = Number(amount) || 0
  return `${curr} ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

onMounted(async () => {
  const ref_ = route.params.reference
  /* Keep the static mock for the demo reference or when no reference. */
  if (!ref_ || ref_ === 'CHATOUT-0001') return

  try {
    const response = await axios.get(`/api/checkout/order/${encodeURIComponent(ref_)}`)
    const data = response.data || {}
    if (data.ok && data.order) {
      const order = data.order
      isRealOrder.value = true
      reference.value = order.reference || ref_
      status.value = order.status || 'Confirmed'
      items.value = Array.isArray(order.items) ? order.items : []
      total.value = order.total != null ? order.total : null
      currency.value = order.currency || 'NGN'
      paidAt.value = order.paid_at || null
      if (order.paid_at) {
        orderDate.value = new Date(order.paid_at).toLocaleDateString('en-NG', {
          year: 'numeric', month: 'long', day: 'numeric',
        })
      }
      /* Clear the cart once on a paid order. */
      if (String(order.status).toLowerCase() === 'paid') {
        cart.clear()
      }
    }
  } catch {
    /* Fetch failed — keep the existing static mock so nothing breaks. */
  }
})
</script>

<template>
  <div class="checkout container" style="padding-block: var(--space-9);">
    <div style="max-width: 560px; margin: 0 auto; text-align: center;">
      <!-- Success checkmark -->
      <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(46,212,168,0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-5);">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>

      <h1 style="font-size: var(--text-h2); margin-bottom: var(--space-2);">{{ heading }}</h1>
      <p style="color: var(--text-muted); margin-bottom: var(--space-4);">
        {{ subheading }}
      </p>

      <div style="display: flex; justify-content: center; margin-bottom: var(--space-6);">
        <TestModeNotice variant="pill" />
      </div>

      <!-- Order details card -->
      <div class="glass-strong" style="padding: var(--space-6); text-align: left; margin-bottom: var(--space-6);">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
          <div>
            <span style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-eyebrow);">Order Number</span>
            <p style="font-weight: 700; font-size: var(--text-md);">#{{ reference }}</p>
          </div>
          <div>
            <span style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-eyebrow);">Date</span>
            <p style="font-weight: 700; font-size: var(--text-md);">{{ orderDate }}</p>
          </div>
          <div>
            <span style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-eyebrow);">Status</span>
            <p style="font-weight: 700; color: var(--accent-secondary);">{{ isRealOrder ? (isPaid ? 'Paid' : status) : 'Confirmed' }}</p>
          </div>
          <div>
            <span style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-eyebrow);">Payment</span>
            <p style="font-weight: 700;">Nomba Checkout</p>
          </div>
        </div>

        <!-- Real order line items -->
        <template v-if="isRealOrder && items.length">
          <div style="height: 1px; background: var(--surface-line-strong, rgba(0,0,0,0.08)); margin: var(--space-5) 0;"></div>
          <div v-for="(li, idx) in items" :key="li.id ?? idx" style="display: flex; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2);">
            <span style="color: var(--text-muted);">{{ li.name || li.id }} <template v-if="li.qty">× {{ li.qty }}</template></span>
            <span style="font-weight: 600;" v-if="li.price != null">{{ formatPrice((Number(li.price) || 0) * (Number(li.qty) || 1), currency) }}</span>
          </div>
          <div v-if="total != null" style="display: flex; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-3); font-weight: 700;">
            <span>Total</span>
            <span>{{ formatPrice(total, currency) }}</span>
          </div>
        </template>
      </div>

      <!-- CTA -->
      <router-link to="/" class="btn btn-primary btn-lg" style="margin-bottom: var(--space-2);">
        Continue Shopping
      </router-link>
    </div>
  </div>
</template>
