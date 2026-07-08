<script setup>
/*
 * ChatOut app shell — renders background, header, router-view, and the
 * chat window overlay. This is the top-level layout for the checkout.
 */
import { ref, onMounted } from 'vue'
import { useShopStore } from '../../stores/shopStore.js'
import { useCartStore } from '../../stores/cartStore.js'
import ChatOutHeader from './ChatOutHeader.vue'
import CartDrawer from '../cart/CartDrawer.vue'
import ChatWindow from '../chat/ChatWindow.vue'

const shop = useShopStore()
const cart = useCartStore()
const chatOpen = ref(false)

function toggleChat() {
  chatOpen.value = !chatOpen.value
}

onMounted(() => {
  shop.init()
  cart.hydrate()
})
</script>

<template>
  <div class="chatout-bg" aria-hidden="true"></div>

  <div class="app-shell">
    <ChatOutHeader
      @open-cart="cart.openDrawer()"
      @toggle-chat="toggleChat"
      :chat-open="chatOpen"
      :shop="shop.shop"
    />

    <main class="main-content">
      <router-view :key="$route.fullPath" />
    </main>

    <!-- Slide-out cart drawer -->
    <CartDrawer />

    <!-- Floating chat window -->
    <ChatWindow :open="chatOpen" @open="chatOpen = true" @close="chatOpen = false" />
  </div>
</template>
