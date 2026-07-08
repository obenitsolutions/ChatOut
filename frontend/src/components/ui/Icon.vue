<script setup>
/*
 * Tiny icon library. Centralized here so the same glyph looks
 * identical wherever it's used (header toggle, chat header,
 * chat FAB, message avatars).
 */
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
})
</script>

<template>
  <!-- Sparkle (decorative) -->
  <svg v-if="name === 'sparkle'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9.937 15.5A2 2 0 008 17.063l-6.135 1.812a.5.5 0 000 .95L8 21.437A2 2 0 009.937 23l1.812 6.135a.5.5 0 00.95 0L14.563 23A2 2 0 0016 21.437l6.135-1.812a.5.5 0 000-.95L16 17.063A2 2 0 0014.563 15.5l-1.812-6.135a.5.5 0 00-.95 0z"/>
  </svg>

  <!--
    Chat/AI Assistant icon — proper friendly robot head.
    Square head, two antenna dots, glowing rectangular visor (eyes),
    and a small mouth grille. The visor strokes use `currentColor`
    so it inherits the parent's accent.
  -->
  <svg v-else-if="name === 'robot'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <!-- antennae -->
    <line x1="9"  y1="3.5" x2="9"  y2="6" />
    <line x1="15" y1="3.5" x2="15" y2="6" />
    <circle cx="9"  cy="3" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="3" r="1.1" fill="currentColor" stroke="none" />
    <!-- head -->
    <rect x="4" y="6" width="16" height="13" rx="3" />
    <!-- ear knobs -->
    <rect x="2.5" y="10" width="1.6" height="4" rx="0.8" fill="currentColor" stroke="none" />
    <rect x="19.9" y="10" width="1.6" height="4" rx="0.8" fill="currentColor" stroke="none" />
    <!-- visor (eyes) -->
    <rect x="6.5" y="9" width="11" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.18" />
    <circle cx="9.2"  cy="11" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="11" r="1.1" fill="currentColor" stroke="none" />
    <!-- mouth -->
    <line x1="9.5" y1="16.2" x2="14.5" y2="16.2" />
    <!-- neck -->
    <line x1="10" y1="19.2" x2="14" y2="19.2" />
    <line x1="11.4" y1="19.2" x2="11.4" y2="20.6" />
    <line x1="12.6" y1="19.2" x2="12.6" y2="20.6" />
  </svg>

  <svg v-else-if="name === 'cart'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>

  <svg v-else-if="name === 'plus'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14"/>
  </svg>

  <svg v-else-if="name === 'send'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
  </svg>

  <svg v-else-if="name === 'chat'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>

  <!-- Filter / sliders (horizontal) — used by the filter button + dialog -->
  <svg v-else-if="name === 'sliders'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="4"  y1="6"  x2="14" y2="6" />
    <line x1="18" y1="6"  x2="20" y2="6" />
    <circle cx="16" cy="6" r="2" fill="currentColor" stroke="none" />
    <line x1="4"  y1="12" x2="8"  y2="12" />
    <line x1="12" y1="12" x2="20" y2="12" />
    <circle cx="10" cy="12" r="2" fill="currentColor" stroke="none" />
    <line x1="4"  y1="18" x2="16" y2="18" />
    <line x1="20" y1="18" x2="20" y2="18" />
    <circle cx="18" cy="18" r="2" fill="currentColor" stroke="none" />
  </svg>

  <!-- Close (X) -->
  <svg v-else-if="name === 'close'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>

  <!-- Check -->
  <svg v-else-if="name === 'check'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>

  <!-- Reset / undo -->
  <svg v-else-if="name === 'reset'" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
</template>
