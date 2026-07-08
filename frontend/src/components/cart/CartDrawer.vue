<script setup>
/*
 * CartDrawer — slide-out cart panel from the right.
 * Shows items, qty controls, subtotal, and a checkout CTA.
 */
import { computed } from 'vue'
import { useCartStore } from '../../stores/cartStore.js'

const cart = useCartStore()
cart.hydrate()

function formatPrice(amount, currency = 'NGN') {
  const value = Number(amount) || 0
  return `${currency} ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
</script>

<template>
  <!-- Backdrop -->
  <div
    class="cart-backdrop"
    :class="{ 'is-open': cart.drawerOpen }"
    @click="cart.closeDrawer()"
    aria-hidden="true"
  ></div>

  <!-- Drawer -->
  <aside
    class="cart-drawer"
    :class="{ 'is-open': cart.drawerOpen }"
    role="dialog"
    aria-label="Shopping cart"
    aria-modal="true"
  >
    <!-- Header -->
    <div class="cart-drawer__header">
      <h2 class="cart-drawer__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
        </svg>
        Your Cart
        <span v-if="cart.count" class="cart-drawer__count">({{ cart.count }})</span>
      </h2>
      <button class="cart-drawer__close" @click="cart.closeDrawer()" aria-label="Close cart">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="cart.isEmpty" class="cart-drawer__empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
      </svg>
      <h3>Your cart is empty</h3>
      <p>Browse the shop and add items to get started.</p>
    </div>

    <!-- Items -->
    <div v-else class="cart-drawer__items">
      <div
        v-for="item in cart.items"
        :key="item.id"
        class="cart-item"
      >
        <img
          :src="item.image"
          :alt="item.name"
          class="cart-item__image"
          loading="lazy"
          @error="$event.target.style.display = 'none'"
        />
        <div class="cart-item__info">
          <span class="cart-item__name">{{ item.name }}</span>
          <span class="cart-item__category">{{ item.category }}</span>
          <div class="cart-item__bottom">
            <span class="cart-item__price">{{ formatPrice(item.price * item.qty, item.currency) }}</span>
            <div class="qty-stepper">
              <button class="qty-stepper__btn" @click="cart.updateQty(item.id, item.qty - 1)" aria-label="Decrease quantity">−</button>
              <span class="qty-stepper__val">{{ item.qty }}</span>
              <button class="qty-stepper__btn" @click="cart.updateQty(item.id, item.qty + 1)" aria-label="Increase quantity">+</button>
            </div>
          </div>
        </div>
        <button
          class="cart-item__remove"
          @click="cart.remove(item.id)"
          aria-label="Remove from cart"
          style="align-self: flex-start; padding: 4px; color: var(--text-muted); border-radius: var(--radius-sm);"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="!cart.isEmpty" class="cart-drawer__footer">
      <div class="cart-drawer__total">
        <span class="cart-drawer__total-label">Subtotal</span>
        <span class="cart-drawer__total-value">{{ cart.subtotalFormatted }}</span>
      </div>
      <button class="btn btn-primary btn-lg btn-block" @click="cart.closeDrawer()">
        Continue to Checkout
      </button>
      <button class="btn btn-ghost btn-sm" @click="cart.clear()">
        Clear cart
      </button>
    </div>
  </aside>
</template>
