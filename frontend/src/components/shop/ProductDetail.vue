<script setup>
/*
 * ProductDetail — full detail modal/lightbox.
 * - Desktop: image on the left, info panel on the right
 * - Mobile:  stacked vertically
 * - The image itself is clickable to open the ImageLightbox for zoom
 *
 * Emits:
 *   - close(): user dismissed
 *   - add-to-cart(payload): user added to cart from the detail view
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useCartStore } from '../../stores/cartStore.js'
import ImageLightbox from './ImageLightbox.vue'

const props = defineProps({
  product: { type: Object, default: null },
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'add-to-cart'])

const cart = useCartStore()
const qty = ref(1)
const lightboxOpen = ref(false)

const isPromo = computed(() => !!(props.product && props.product.isOnPromotion && props.product.originalPrice))
const oos = computed(() => !!(props.product && (props.product.isOutOfStock || props.product.stockQuantity <= 0)))

function formatPrice(amount, currency = 'NGN') {
  const value = Number(amount) || 0
  return `${currency} ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function close() {
  emit('close')
}

function addToCart() {
  if (!props.product || oos.value) return
  const n = Math.max(1, Number(qty.value) || 1)
  cart.add({ ...props.product, qty: n })
  emit('add-to-cart', { product: props.product, qty: n })
}

function bumpQty(delta) {
  qty.value = Math.max(1, (Number(qty.value) || 1) + delta)
}

function onKeydown(e) {
  if (!props.open) return
  if (e.key === 'Escape') {
    if (lightboxOpen.value) { lightboxOpen.value = false; return }
    close()
  }
}

watch(() => props.open, (v) => {
  if (v) {
    qty.value = 1
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="pd-fade">
      <div
        v-if="props.open && props.product"
        class="pd-backdrop"
        @click.self="close"
        role="dialog"
        aria-modal="true"
        :aria-label="`Details for ${props.product.name}`"
      >
        <div class="pd-modal" @click.stop>
          <button class="pd-close" @click="close" aria-label="Close product details">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          <div class="pd-grid">
            <!-- Left: image (clickable for full-screen lightbox) -->
            <button
              class="pd-image-wrap"
              @click="lightboxOpen = true"
              aria-label="Zoom image"
              type="button"
            >
              <img
                :src="props.product.image"
                :alt="props.product.name"
                class="pd-image"
                @error="$event.target.parentElement.style.background = 'var(--surface-2)'"
              />
              <span v-if="isPromo" class="pd-badge pd-badge--promo">Sale</span>
              <span v-if="oos" class="pd-badge pd-badge--oos">Out of stock</span>
              <span class="pd-zoom-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
                Click to zoom
              </span>
            </button>

            <!-- Right: info panel -->
            <div class="pd-info">
              <span class="pd-eyebrow">{{ props.product.category }}</span>
              <h2 class="pd-name">{{ props.product.name }}</h2>

              <div class="pd-price-block">
                <span v-if="isPromo" class="pd-original">
                  {{ formatPrice(props.product.originalPrice, props.product.currency) }}
                </span>
                <span class="pd-price">
                  {{ formatPrice(props.product.price, props.product.currency) }}
                </span>
              </div>

              <p class="pd-description">{{ props.product.description }}</p>

              <!-- Core properties (color / size / material) -->
              <dl v-if="props.product.coreProperties" class="pd-props">
                <template v-for="(v, k) in props.product.coreProperties" :key="k">
                  <div class="pd-prop">
                    <dt>{{ k }}</dt>
                    <dd>{{ v }}</dd>
                  </div>
                </template>
              </dl>

              <!-- Stock indicator -->
              <p v-if="!oos && props.product.stockQuantity <= 5" class="pd-stock pd-stock--low">
                Only {{ props.product.stockQuantity }} left in stock
              </p>
              <p v-else-if="!oos" class="pd-stock">In stock</p>
              <p v-else class="pd-stock pd-stock--oos">Currently out of stock</p>

              <!-- Add to cart (with qty stepper) -->
              <div v-if="!oos" class="pd-add">
                <div class="pd-qty">
                  <button type="button" @click="bumpQty(-1)" aria-label="Decrease quantity">−</button>
                  <span class="pd-qty__val">{{ qty }}</span>
                  <button type="button" @click="bumpQty(1)" aria-label="Increase quantity">+</button>
                </div>
                <button class="btn btn-primary pd-add__btn" @click="addToCart">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                  </svg>
                  Add to cart
                </button>
              </div>
              <button v-else class="btn btn-outline pd-add__btn" disabled>Out of stock</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Full-screen image lightbox -->
    <ImageLightbox
      :src="props.product?.image"
      :alt="props.product?.name"
      :open="lightboxOpen"
      @close="lightboxOpen = false"
    />
  </Teleport>
</template>
