<script setup>
/*
 * FilterDialog — a modal (centered on desktop, bottom-sheet on mobile) that
 * holds every non-text filter the shop supports:
 *
 *   1. Availability  — All / In stock / Out of stock
 *   2. Category       — chips, single-select
 *   3. Price range    — dual-thumb slider + min/max numeric inputs
 *   4. Sort           — chips, single-select
 *
 * State is held LOCALLY until the user hits "Show N results" — that way we
 * don't refetch / flicker with every keystroke. Esc and the backdrop close
 * the dialog. The Reset button clears filters without closing.
 *
 * Communicates with the parent via v-model:open and @apply(payload).
 */
import { ref, computed, watch } from 'vue'
import { useShopStore } from '../../stores/shopStore.js'
import Icon from '../ui/Icon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  shop: { type: Object, required: true },
})
const emit = defineEmits(['close', 'apply'])

const shopStore = useShopStore()

/* Local working copy so we only commit on Apply */
const local = ref({
  availability: 'all',
  category: '',
  minPrice: null,
  maxPrice: null,
  sort: 'featured',
})

function loadFromStore() {
  local.value.availability = shopStore.filters.inStockOnly
    ? 'in'
    : (shopStore.filters.outOfStockOnly ? 'out' : 'all')
  local.value.category = shopStore.filters.category || ''
  local.value.minPrice = shopStore.filters.minPrice
  local.value.maxPrice = shopStore.filters.maxPrice
  local.value.sort = shopStore.filters.sort || 'featured'
}

watch(() => props.open, (v) => { if (v) loadFromStore() }, { immediate: true })

const priceBounds = computed(() => {
  if (!shopStore.products.length) return { min: 0, max: 100000 }
  let mn = Infinity, mx = 0
  for (const p of shopStore.products) {
    const v = Number(p.price) || 0
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const pad = Math.ceil((mx - mn) * 0.05)
  return { min: Math.max(0, Math.floor(mn - pad)), max: Math.ceil(mx + pad) }
})

const minVal = computed({
  get: () => (local.value.minPrice == null ? priceBounds.value.min : Number(local.value.minPrice)),
  set: (v) => (local.value.minPrice = v == null || v === '' ? null : Math.min(Number(v), maxVal.value)),
})
const maxVal = computed({
  get: () => (local.value.maxPrice == null ? priceBounds.value.max : Number(local.value.maxPrice)),
  set: (v) => (local.value.maxPrice = v == null || v === '' ? null : Math.max(Number(v), minVal.value)),
})

const sliderFill = computed(() => {
  const { min, max } = priceBounds.value
  if (max <= min) return { leftPct: 0, rightPct: 0 }
  const lo = ((minVal.value - min) / (max - min)) * 100
  const hi = ((maxVal.value - min) / (max - min)) * 100
  return {
    leftPct: Math.max(0, Math.min(100, lo)),
    rightPct: Math.max(0, Math.min(100, 100 - hi)),
  }
})

const categories = computed(() => {
  const cats = new Set(shopStore.products.map((p) => p.category).filter(Boolean))
  return ['All', ...Array.from(cats).sort()]
})

const SORT_OPTIONS = [
  { value: 'featured',   label: 'Featured' },
  { value: 'price-asc',  label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'name',       label: 'A–Z' },
  { value: 'newest',     label: 'Newest' },
]

const AVAIL_OPTIONS = [
  { value: 'all', label: 'All products' },
  { value: 'in',  label: 'In stock only' },
  { value: 'out', label: 'Out of stock' },
]

function formatMoney(v) {
  const n = Number(v) || 0
  return n.toLocaleString('en-NG', { maximumFractionDigits: 0 })
}

const activeCount = computed(() => {
  let n = 0
  if (local.value.availability !== 'all') n++
  if (local.value.category && local.value.category !== 'All') n++
  if (local.value.minPrice != null && local.value.minPrice !== priceBounds.value.min) n++
  if (local.value.maxPrice != null && local.value.maxPrice !== priceBounds.value.max) n++
  if (local.value.sort !== 'featured') n++
  return n
})

const previewCount = computed(() => {
  /* Light preview — same filter logic as shopStore.filteredProducts.
     We re-implement here so the user gets an instant "Show N results"
     without committing. */
  let results = [...shopStore.products]
  if (local.value.availability === 'in')  results = results.filter((p) => !p.isOutOfStock && p.stockQuantity > 0)
  if (local.value.availability === 'out') results = results.filter((p) => p.isOutOfStock || p.stockQuantity <= 0)
  if (local.value.category && local.value.category !== 'All') {
    results = results.filter((p) => p.category === local.value.category)
  }
  const min = local.value.minPrice == null ? -Infinity : Number(local.value.minPrice)
  const max = local.value.maxPrice == null ? Infinity : Number(local.value.maxPrice)
  results = results.filter((p) => Number(p.price) >= min && Number(p.price) <= max)
  return results.length
})

function apply() {
  shopStore.setFilter('inStockOnly', local.value.availability === 'in')
  shopStore.setFilter('outOfStockOnly', local.value.availability === 'out')
  shopStore.setFilter('category', local.value.category && local.value.category !== 'All' ? local.value.category : '')
  shopStore.setFilter('minPrice', local.value.minPrice)
  shopStore.setFilter('maxPrice', local.value.maxPrice)
  shopStore.setFilter('sort', local.value.sort)
  emit('apply')
  emit('close')
}

function reset() {
  local.value = {
    availability: 'all',
    category: '',
    minPrice: null,
    maxPrice: null,
    sort: 'featured',
  }
}

function onBackdrop(e) {
  if (e.target === e.currentTarget) emit('close')
}
function onKeydown(e) {
  if (props.open && e.key === 'Escape') emit('close')
}
import { onMounted, onUnmounted } from 'vue'
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="fd-fade">
      <div
        v-if="props.open"
        class="fd-backdrop"
        @click.self="emit('close')"
        role="dialog"
        aria-modal="true"
        aria-label="Filter products"
      >
        <div class="fd-modal">
          <!-- Header -->
          <div class="fd-head">
            <h3 class="fd-title">Filters</h3>
            <div class="fd-head-actions">
              <button
                v-if="activeCount > 0"
                type="button"
                class="fd-head-btn"
                @click="reset"
                aria-label="Clear filters"
              >
                <Icon name="reset" :size="14" />
                Reset
              </button>
              <button
                type="button"
                class="fd-close"
                @click="emit('close')"
                aria-label="Close filters"
              >
                <Icon name="close" :size="18" />
              </button>
            </div>
          </div>

          <div class="fd-body">
            <!-- Availability -->
            <section class="fd-section">
              <h4 class="fd-section-title">Availability</h4>
              <div class="fd-chips">
                <button
                  v-for="o in AVAIL_OPTIONS"
                  :key="o.value"
                  type="button"
                  class="fd-chip"
                  :class="{ 'is-active': local.availability === o.value }"
                  @click="local.availability = o.value"
                >
                  <Icon v-if="local.availability === o.value" name="check" :size="12" />
                  {{ o.label }}
                </button>
              </div>
            </section>

            <!-- Category -->
            <section class="fd-section">
              <h4 class="fd-section-title">Category</h4>
              <div class="fd-chips">
                <button
                  v-for="cat in categories"
                  :key="cat"
                  type="button"
                  class="fd-chip"
                  :class="{ 'is-active': (local.category === cat) || (cat === 'All' && !local.category) }"
                  @click="local.category = (cat === 'All' ? '' : cat)"
                >
                  <Icon v-if="(local.category === cat) || (cat === 'All' && !local.category)" name="check" :size="12" />
                  {{ cat }}
                </button>
              </div>
            </section>

            <!-- Price range -->
            <section class="fd-section">
              <h4 class="fd-section-title">Price</h4>
              <div class="fd-price-row">
                <span class="fd-price-label">Min</span>
                <input
                  type="number"
                  class="fd-price-input"
                  :min="priceBounds.min"
                  :max="maxVal"
                  step="500"
                  v-model.lazy="minVal"
                  aria-label="Minimum price"
                />
                <span class="fd-price-sep">—</span>
                <span class="fd-price-label">Max</span>
                <input
                  type="number"
                  class="fd-price-input"
                  :min="minVal"
                  :max="priceBounds.max"
                  step="500"
                  v-model.lazy="maxVal"
                  aria-label="Maximum price"
                />
                <span class="fd-price-currency">{{ shop.currency || 'NGN' }}</span>
              </div>

              <div class="fd-slider">
                <div class="fd-slider__track"></div>
                <div
                  class="fd-slider__fill"
                  :style="{ left: sliderFill.leftPct + '%', right: sliderFill.rightPct + '%' }"
                ></div>
                <input
                  type="range"
                  :min="priceBounds.min" :max="priceBounds.max" step="500"
                  :value="minVal"
                  @input="(e) => (local.minPrice = Number(e.target.value))"
                  aria-label="Minimum price slider"
                />
                <input
                  type="range"
                  :min="priceBounds.min" :max="priceBounds.max" step="500"
                  :value="maxVal"
                  @input="(e) => (local.maxPrice = Number(e.target.value))"
                  aria-label="Maximum price slider"
                />
              </div>

              <div class="fd-price-hint">
                NGN {{ formatMoney(minVal) }} — NGN {{ formatMoney(maxVal) }}
              </div>
            </section>

            <!-- Sort -->
            <section class="fd-section">
              <h4 class="fd-section-title">Sort by</h4>
              <div class="fd-chips">
                <button
                  v-for="o in SORT_OPTIONS"
                  :key="o.value"
                  type="button"
                  class="fd-chip"
                  :class="{ 'is-active': local.sort === o.value }"
                  @click="local.sort = o.value"
                >
                  <Icon v-if="local.sort === o.value" name="check" :size="12" />
                  {{ o.label }}
                </button>
              </div>
            </section>
          </div>

          <div class="fd-foot">
            <button type="button" class="fd-apply" @click="apply">
              <Icon name="check" :size="16" />
              Show {{ previewCount }} result{{ previewCount === 1 ? '' : 's' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
