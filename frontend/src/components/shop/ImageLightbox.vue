<script setup>
/*
 * ImageLightbox — full-screen image viewer. Renders a single image
 * at its natural aspect ratio on a dark backdrop. Close by clicking
 * the backdrop, pressing Escape, or the close button.
 */
import { onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

function close() { emit('close') }

function onKeydown(e) {
  if (props.open && e.key === 'Escape') close()
}

watch(() => props.open, (v) => {
  if (v) document.body.style.overflow = 'hidden'
  else document.body.style.overflow = ''
})

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="lb-fade">
      <div
        v-if="props.open && props.src"
        class="lb-backdrop"
        @click.self="close"
        role="dialog"
        aria-modal="true"
        :aria-label="`Image: ${props.alt}`"
      >
        <button class="lb-close" @click="close" aria-label="Close image">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <img :src="props.src" :alt="props.alt" class="lb-image" />
      </div>
    </Transition>
  </Teleport>
</template>
