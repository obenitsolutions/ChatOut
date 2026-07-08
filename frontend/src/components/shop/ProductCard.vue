<script setup>
/*
 * ProductCard — displays a single product in the grid.
 * Image, category eyebrow, name, price block (original price stacked on
 * top of current price when on promotion), and a quick-add button.
 */
import { useCartStore } from '../../stores/cartStore.js'

const props = defineProps({
  product: { type: Object, required: true },
  showDetail: { type: Function, default: null },
})

const cart = useCartStore()

function formatPrice(amount, currency = 'NGN') {
  const value = Number(amount) || 0
  return `${currency} ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function addToCart(e) {
  e.stopPropagation()
  if (props.product.isOutOfStock || props.product.stockQuantity <= 0) return
  cart.add({ ...props.product, qty: 1 })
}

function openDetail() {
  if (typeof props.showDetail === 'function') {
    props.showDetail(props.product)
  }
}
</script>

<template>
  <article
    class="product-card"
    :class="{ 'is-oos': product.isOutOfStock }"
    @click="openDetail"
    role="button"
    :aria-label="`View ${product.name}`"
    tabindex="0"
    @keydown.enter="openDetail"
    @keydown.space.prevent="openDetail"
  >
    <div class="product-card__image-wrap">
      <img
        :src="product.image"
        :alt="product.name"
        class="product-card__image"
        loading="lazy"
        @error="$event.target.parentElement.style.background = 'var(--surface-2)'"
      />

      <!-- Promotion badge -->
      <span v-if="product.isOnPromotion" class="product-card__badge product-card__badge--promo">
        Sale
      </span>

      <!-- Out of stock badge -->
      <span v-if="product.isOutOfStock || product.stockQuantity <= 0" class="product-card__badge product-card__badge--oos">
        Out of stock
      </span>

      <!-- Quick add button -->
      <button
        v-if="!product.isOutOfStock && product.stockQuantity > 0"
        class="product-card__quick-add"
        @click="addToCart"
        aria-label="Add to cart"
        title="Quick add to cart"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>

    <div class="product-card__info">
      <span class="product-card__category">{{ product.category }}</span>
      <h3 class="product-card__name">{{ product.name }}</h3>

      <!--
        Price block: when on promotion, the original (old) price sits
        ON TOP in a small muted font with strikethrough, and the
        current price sits BELOW in large bold coral. When not on
        promotion, just show the current price in large bold.
      -->
      <div class="product-card__price-block">
        <span
          v-if="product.isOnPromotion && product.originalPrice"
          class="product-card__original-price"
        >
          {{ formatPrice(product.originalPrice, product.currency) }}
        </span>
        <span class="product-card__price">
          {{ formatPrice(product.price, product.currency) }}
        </span>
      </div>

      <span
        v-if="!product.isOutOfStock && product.stockQuantity <= 5 && product.stockQuantity > 0"
        class="product-card__stock product-card__stock--low"
      >
        Only {{ product.stockQuantity }} left
      </span>
      <span v-else-if="!product.isOutOfStock" class="product-card__stock">
        In stock
      </span>
    </div>
  </article>
</template>
