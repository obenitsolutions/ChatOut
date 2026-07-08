<script setup>
/*
 * ChatOut header — two-row compact layout.
 *
 *   Row 1 (brand row): ChatOut wordmark + actions (chat / cart / theme)
 *   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ thin divider ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
 *   Row 2 (meta row):  shop meta name + description
 *
 * Header background is full-width (not constrained to container) so the
 * gradient/glass extends edge-to-edge. Inner content is constrained by
 * `.header__brand-row` and `.header__meta` to the container max-width.
 *
 * Theme is synced to whatever the inline boot script in index.html set.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useCartStore } from '../../stores/cartStore.js'
import Icon from '../ui/Icon.vue'

const cart = useCartStore()
const emit = defineEmits(['open-cart', 'toggle-chat'])
const props = defineProps({
  chatOpen: { type: Boolean, default: false },
  shop: {
    type: Object,
    default: () => ({
      businessName: '',
      description: '',
      currency: '',
    }),
  },
})

const theme = ref(
  typeof document !== 'undefined'
    ? (document.documentElement.getAttribute('data-theme') || 'dark')
    : 'dark'
)

let mediaQuery = null
function onSystemThemeChange(e) {
  try {
    if (!localStorage.getItem('chatout.theme')) {
      const next = e.matches ? 'light' : 'dark'
      theme.value = next
      document.documentElement.setAttribute('data-theme', next)
      const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      if (meta) meta.setAttribute('content', next === 'light' ? '#F5F4F0' : '#0A0E27')
    }
  } catch { /* ignore */ }
}

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    mediaQuery.addEventListener?.('change', onSystemThemeChange)
  }
})
onUnmounted(() => {
  mediaQuery?.removeEventListener?.('change', onSystemThemeChange)
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme.value)
    try { localStorage.setItem('chatout.theme', theme.value) } catch { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
    if (meta) meta.setAttribute('content', theme.value === 'light' ? '#F5F4F0' : '#0A0E27')
  }
}
</script>

<template>
  <header class="header" role="banner">
    <!-- ─── ROW 1: Brand + actions ─── -->
    <div class="header__brand-row">
      <router-link to="/" class="header__brand" aria-label="ChatOut home">
        <img
          src="/logo_with_text.png"
          alt="ChatOut"
          class="header__logo header__logo--text"
          @error="$event.target.src = '/logo.png'"
        />
      </router-link>

      <div class="header__actions">
        <button
          class="btn btn-ghost btn-sm"
          @click="emit('toggle-chat')"
          :aria-label="props.chatOpen ? 'Close chat' : 'Open chat assistant'"
        >
          <Icon name="robot" :size="18" />
          <span class="header__btn-label">AI Assistant</span>
        </button>

        <button class="header__cart-btn" @click="emit('open-cart')" aria-label="Open cart">
          <Icon name="cart" :size="22" />
          <span v-if="cart.count" class="header__cart-badge">{{ cart.count }}</span>
        </button>

        <button
          class="header__theme-btn"
          @click="toggleTheme"
          :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <svg v-if="theme === 'dark'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- ─── Thin divider ─── -->
    <div class="header__divider" aria-hidden="true"></div>

    <!-- ─── ROW 2: Shop meta ─── -->
    <div class="header__meta">
      <div class="header__meta-left">
        <div class="header__meta-icon" aria-hidden="true">
          <Icon name="cart" :size="14" />
        </div>
        <div class="header__meta-text">
          <span class="header__meta-name">{{ shop.businessName || 'African Heritage Fashion' }}</span>
        </div>
      </div>

      <div class="header__meta-right">
        <span class="header__meta-pill" v-if="shop.currency">{{ shop.currency }} · {{ cart.count }} in cart</span>
      </div>
    </div>
  </header>
</template>
