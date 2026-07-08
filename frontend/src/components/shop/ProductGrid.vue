<script setup>
/*
 * ProductGrid — displays the product catalog grid with:
 *   • Single-row toolbar (search left, sort+filter right on desktop)
 *   • Stackable toolbar (search row 1, sort+filter row 2 on mobile)
 *   • FilterDialog (bottom-sheet on mobile, centered modal on desktop)
 *   • Category tabs strip
 *   • Pagination (1 of N) — bottom
 *   • Product cards → opens ProductDetail modal
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useShopStore } from '../../stores/shopStore.js'
import ProductCard from './ProductCard.vue'
import ProductDetail from './ProductDetail.vue'
import FilterDialog from './FilterDialog.vue'
import Icon from '../ui/Icon.vue'

const shop = useShopStore()
onMounted(() => { shop.init() })

/* ---- Detail modal ---- */
const detailProduct = ref(null)
const detailOpen = ref(false)
function showDetail(p) { detailProduct.value = p; detailOpen.value = true }
function closeDetail() { detailOpen.value = false }

/* ---- Filter dialog ---- */
const filterOpen = ref(false)

/* ---- Category tabs auto-scroll ---- */
const tabsEl = ref(null)
function scrollTabIntoView(e) {
  const btn = e.target
  if (!btn || !tabsEl.value) return
  const container = tabsEl.value
  const left = btn.offsetLeft
  const w = btn.offsetWidth
  /* Scroll so the clicked tab is centered-ish, but don't overshoot */
  container.scrollTo({ left: left - container.clientWidth / 2 + w / 2, behavior: 'smooth' })
}

/* ---- Search ---- */
const searchInput = ref('')
let searchTimeout = null
function onSearch(e) {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    shop.setFilter('q', e.target.value)
    page.value = 1
  }, 300)
}

const priceBounds = computed(() => {
  if (!shop.products.length) return { min: 0, max: 100000 }
  let mn = Infinity, mx = 0
  for (const p of shop.products) {
    const v = Number(p.price) || 0
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  return { min: mn, max: mx }
})

const fmtMoney = (v) => Number(v || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })

const isPriceFiltered = computed(() =>
  shop.filters.minPrice != null || shop.filters.maxPrice != null
)
const activeBadge = computed(() => shop.activeFilterCount)

/* ---- Pagination ---- */
const PAGE_SIZE = 12
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(shop.filteredProducts.length / PAGE_SIZE)))
const paginatedProducts = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return shop.filteredProducts.slice(start, start + PAGE_SIZE)
})

/* Smart page-number window: shows first, last, current ± neighbours, ellipsis for gaps */
const pageNumbers = computed(() => {
  const tp = totalPages.value
  const cur = page.value
  if (tp <= 7) {
    /* Small set — show every page */
    return Array.from({ length: tp }, (_, i) => i + 1)
  }
  const pages = [1]
  if (cur > 3) pages.push('...')
  /* Neighbourhood around current */
  const start = Math.max(2, cur - 1)
  const end = Math.min(tp - 1, cur + 1)
  for (let n = start; n <= end; n++) pages.push(n)
  if (cur < tp - 2) pages.push('...')
  pages.push(tp)
  return pages
})

watch(() => shop.filteredProducts.length, () => { page.value = 1 })

function goToPage(n) {
  const next = Math.min(Math.max(1, n), totalPages.value)
  page.value = next
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    document.querySelector('.product-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
</script>

<template>
  <div class="checkout__main">
    <!-- Shop description — the company name + description are now in the
         header meta row (brand-row 1 / divider / meta-row 2). Here we just
         keep a single-line description as context, single-line above the
         category tabs. -->
    <p v-if="shop.shop.description" class="checkout__shop-line">
      {{ shop.shop.description }}
    </p>

    <!-- Category tabs strip -->
    <div ref="tabsEl" class="category-tabs" role="tablist" aria-label="Categories">
      <button
        v-for="cat in shop.categories"
        :key="cat"
        class="category-tab"
        :class="{ 'is-active': shop.filters.category === cat || (cat === 'All' && !shop.filters.category) }"
        role="tab"
        @click="(shop.setFilter('category', cat === 'All' ? '' : cat), (page = 1), scrollTabIntoView($event))"
      >
        {{ cat }}
      </button>
    </div>

    <!-- Single-row toolbar — search left | sort + filter right -->
    <div class="checkout__toolbar">
      <div class="checkout__search">
        <svg class="checkout__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          class="checkout__search-input"
          type="search"
          :value="searchInput"
          @input="onSearch"
          placeholder="Search products…"
          aria-label="Search products"
        />
      </div>

      <div class="checkout__toolbar-right">
        <select class="checkout__sort" v-model="shop.filters.sort" aria-label="Sort products" @change="page = 1">
          <option value="featured">Featured</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="name">Name: A–Z</option>
          <option value="newest">Newest</option>
        </select>

        <button
          type="button"
          class="checkout__filter-btn"
          :class="{ 'is-active': activeBadge > 0 }"
          @click="filterOpen = true"
          aria-label="Open filters"
          aria-haspopup="dialog"
        >
          <Icon name="sliders" :size="16" />
          <span class="checkout__filter-label">Filters</span>
          <span v-if="activeBadge > 0" class="checkout__filter-badge">{{ activeBadge }}</span>
        </button>
      </div>
    </div>

    <!-- Results count -->
    <p class="results-count">
      {{ shop.filteredProducts.length }} product{{ shop.filteredProducts.length !== 1 ? 's' : '' }}
      <span v-if="shop.filters.q">for "{{ shop.filters.q }}"</span>
      <span v-if="isPriceFiltered">
        · NGN {{ fmtMoney(shop.filters.minPrice ?? priceBounds.min) }} – NGN {{ fmtMoney(shop.filters.maxPrice ?? priceBounds.max) }}
      </span>
      <span v-if="totalPages > 1"> · page {{ page }} of {{ totalPages }}</span>
    </p>

    <!-- Product grid -->
    <div class="product-grid" v-if="paginatedProducts.length">
      <ProductCard
        v-for="product in paginatedProducts"
        :key="product.id"
        :product="product"
        :show-detail="showDetail"
      />
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <svg class="empty-state__icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
      <h2 class="empty-state__title">No products match</h2>
      <p class="empty-state__text">Try removing some filters, or clearing the search.</p>
      <button class="btn btn-outline" @click="(shop.clearFilters(), (page = 1))">Clear all filters</button>
    </div>

    <!-- Pager -->
    <nav v-if="totalPages > 1" class="pager" aria-label="Pagination">
      <button class="pager__btn" :disabled="page === 1" @click="goToPage(page - 1)" aria-label="Previous page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button
        v-for="n in pageNumbers"
        :key="n"
        class="pager__num"
        :class="{ 'is-active': n === page, 'pager__ellipsis': n === '...' }"
        @click="n !== '...' && goToPage(n)"
        :disabled="n === '...'"
        :aria-current="n === page ? 'page' : undefined"
      >
        {{ n }}
      </button>
      <button class="pager__btn" :disabled="page === totalPages" @click="goToPage(page + 1)" aria-label="Next page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </nav>
  </div>

  <!-- Product detail modal -->
  <ProductDetail :product="detailProduct" :open="detailOpen" @close="closeDetail" />

  <!-- Filter dialog -->
  <FilterDialog :open="filterOpen" :shop="shop.shop" @close="filterOpen = false" />
</template>
