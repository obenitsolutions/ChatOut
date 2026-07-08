<script setup>
/*
 * ChatWindow — the ChatGPT-style floating chat interface.
 * Renders user / assistant bubbles, typing indicator, recommendation
 * chips (with Add button), and the input row. Talks to POST /api/chat.
 */
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import { useChatStore } from '../../stores/chatStore.js'
import { useShopStore } from '../../stores/shopStore.js'
import { useCartStore } from '../../stores/cartStore.js'
import Icon from '../ui/Icon.vue'
import { renderMarkdown } from '../../utils/markdown.js'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'close'])

const chat = useChatStore()
const shop = useShopStore()
const cart = useCartStore()

onMounted(() => {
  chat.hydrate()
  shop.init()
})

const inputText = ref('')
const messagesEl = ref(null)

watch(() => chat.messages.length, async () => {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
})
watch(() => props.open, async (val) => {
  if (val) {
    chat.isOpen = true
    await nextTick()
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  } else {
    chat.isOpen = false
  }
})

const suggestedPrompts = [
  'What products are on sale?',
  'Show me clothing under ₦20,000',
  'What bags do you have?',
  'Recommend something for a gift',
  'What\'s in my cart?',
]

function buildContext() {
  return {
    shopId: shop.shop.shopId,
    products: shop.products,
    cart: cart.items,
  }
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || chat.isProcessing) return
  inputText.value = ''
  await chat.sendMessage(text, buildContext())
}

function sendSuggestion(text) {
  if (chat.isProcessing) return
  chat.sendMessage(text, buildContext())
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function addRecommendation(product) {
  chat.addRecommendation(product)
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatPrice(amount, currency = 'NGN') {
  const v = Number(amount) || 0
  return `${currency} ${v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function renderMd(text) {
  return renderMarkdown(text)
}
</script>

<template>
  <button
    v-if="!props.open"
    class="chat-fab"
    @click="emit('open')"
    aria-label="Open chat assistant"
  >
    <Icon name="robot" :size="28" />
  </button>

  <Transition name="chat-panel">
    <div v-if="props.open" class="chat-panel" role="dialog" aria-label="Chat assistant">
      <div class="chat-header">
        <div class="chat-header__left">
          <div class="chat-header__avatar">
            <Icon name="robot" :size="20" />
          </div>
          <div>
            <h3 class="chat-header__title">ChatOut Assistant</h3>
            <span class="chat-header__status">
              <span class="chat-header__status-dot"></span>
              Online
            </span>
          </div>
        </div>
        <div class="chat-header__actions">
          <button class="chat-header__btn" @click="chat.clearMessages()" title="Clear chat" aria-label="Clear chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
          <button class="chat-header__btn" @click="emit('close')" title="Close chat" aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div ref="messagesEl" class="chat-messages">
        <div v-if="!chat.hasMessages" class="chat-messages__empty">
          <div class="chat-messages__empty-icon">
            <Icon name="robot" :size="32" />
          </div>
          <h3>How can I help?</h3>
          <p>Ask me about products, prices, stock, or your cart.</p>
          <div class="chat-suggestions">
            <button
              v-for="s in suggestedPrompts"
              :key="s"
              class="chat-suggestion-chip"
              @click="sendSuggestion(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <template v-for="msg in chat.messages" :key="msg.id">
          <div
            class="chat-msg"
            :class="{
              'chat-msg--user': msg.role === 'user',
              'chat-msg--assistant': msg.role === 'assistant',
              'chat-msg--error': msg.isError,
            }"
          >
            <div class="chat-msg__avatar">
              <template v-if="msg.role === 'user'">
                <svg class="chat-msg__avatar-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-3.6 0-10 1.8-10 5.4V21h20v-1.6c0-3.6-6.4-5.4-10-5.4Z"/>
                </svg>
              </template>
              <template v-else>
                <Icon name="robot" :size="16" />
              </template>
            </div>
            <div class="chat-msg__body">
              <div v-if="msg.role === 'user'" class="chat-msg__bubble">{{ msg.content }}</div>
              <div v-else class="chat-msg__bubble chat-md">
                <template v-for="(blk, bi) in renderMd(msg.content)" :key="bi">
                  <h3 v-if="blk.type === 'heading' && blk.level <= 2" class="chat-md__h2" v-html="blk.html"></h3>
                  <h4 v-else-if="blk.type === 'heading' && blk.level === 3" class="chat-md__h3" v-html="blk.html"></h4>
                  <h5 v-else-if="blk.type === 'heading'" class="chat-md__h4" v-html="blk.html"></h5>
                  <ul v-else-if="blk.type === 'ul'" class="chat-md__ul">
                    <li v-for="(it, ii) in blk.items" :key="ii" v-html="it"></li>
                  </ul>
                  <ol v-else-if="blk.type === 'ol'" class="chat-md__ol">
                    <li v-for="(it, ii) in blk.items" :key="ii" v-html="it"></li>
                  </ol>
                  <p v-else-if="blk.type === 'p'" class="chat-md__p" v-html="blk.html"></p>
                </template>
              </div>

              <!-- Applied actions (auto-confirmed cart mutations) -->
              <div v-if="msg.appliedActions && msg.appliedActions.length" class="chat-msg__chips">
                <span
                  v-for="(a, i) in msg.appliedActions"
                  :key="i"
                  class="chat-msg__chip chat-msg__chip--ok"
                >
                  <svg v-if="a.type === 'add_to_cart'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  {{ a.type === 'add_to_cart' ? 'Added' : 'Removed' }} {{ a.name }} × {{ a.qty }}
                </span>
              </div>

              <!-- Recommendation cards -->
              <div v-if="msg.recommendations && msg.recommendations.length" class="chat-recs">
                <article
                  v-for="r in msg.recommendations"
                  :key="r.productId"
                  class="chat-rec"
                >
                  <img :src="r.image" :alt="r.name" class="chat-rec__img" loading="lazy" />
                  <div class="chat-rec__info">
                    <span class="chat-rec__name">{{ r.name }}</span>
                    <span class="chat-rec__price">
                      {{ formatPrice(r.price, r.currency) }}
                      <span v-if="r.isOnPromotion" class="chat-rec__sale">Sale</span>
                    </span>
                  </div>
                  <button
                    class="chat-rec__add"
                    @click="addRecommendation(r)"
                    aria-label="Add to cart"
                    title="Add to cart"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </button>
                </article>
              </div>

              <!-- Suggestion chips -->
              <div v-if="msg.suggestions && msg.suggestions.length" class="chat-msg__chips">
                <button
                  v-for="s in msg.suggestions"
                  :key="s"
                  class="chat-msg__chip"
                  @click="sendSuggestion(s)"
                >
                  {{ s }}
                </button>
              </div>

              <div class="chat-msg__time">{{ formatTime(msg.timestamp) }}</div>
            </div>
          </div>
        </template>

        <div v-if="chat.isProcessing" class="chat-msg chat-msg--assistant">
          <div class="chat-msg__avatar">
            <Icon name="robot" :size="16" />
          </div>
          <div class="chat-msg__bubble">
            <div class="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>

      <div class="chat-input-wrap">
        <div class="chat-input-row">
          <textarea
            v-model="inputText"
            class="chat-input"
            placeholder="Ask about products..."
            rows="1"
            @keydown="onKeydown"
            :disabled="chat.isProcessing"
            aria-label="Chat message input"
          ></textarea>
          <button
            class="chat-send-btn"
            @click="sendMessage"
            :disabled="!inputText.trim() || chat.isProcessing"
            aria-label="Send message"
          >
            <Icon name="send" :size="16" />
          </button>
        </div>
      </div>

      <div class="chat-disclaimer">
        ChatOut may display inaccurate info. Your privacy is protected.
      </div>
    </div>
  </Transition>
</template>
