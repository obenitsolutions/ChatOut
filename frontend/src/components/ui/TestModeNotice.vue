<script setup>
/*
 * TestModeNotice — a small, polished inline notice shown on every money
 * surface to make it unmistakable that no real funds move. Uses the gold
 * accent tokens for a soft, tasteful "sandbox" tint.
 *
 * Props:
 *   variant  'banner' (default, full-width block) | 'pill' (compact inline)
 *   text     override the default message
 */
defineProps({
  variant: {
    type: String,
    default: 'banner',
    validator: (v) => ['banner', 'pill'].includes(v),
  },
  text: {
    type: String,
    default:
      'Test mode — no real money is charged. Payments use Nomba test keys (beta).',
  },
})
</script>

<template>
  <div
    class="test-mode-notice"
    :class="`test-mode-notice--${variant}`"
    role="note"
  >
    <span class="test-mode-notice__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </span>
    <span class="test-mode-notice__text">
      <strong class="test-mode-notice__badge">TEST MODE</strong>
      <span class="test-mode-notice__copy">{{ text }}</span>
    </span>
  </div>
</template>

<style scoped>
.test-mode-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--accent-gold-soft);
  border: 1px solid color-mix(in srgb, var(--accent-gold) 45%, transparent);
  color: var(--text-secondary);
  line-height: var(--leading-snug);
}

.test-mode-notice__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--accent-gold);
}

.test-mode-notice__text {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.test-mode-notice__badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--accent-gold);
  color: var(--text-on-accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  line-height: 1.6;
}

.test-mode-notice__copy {
  color: var(--text-secondary);
}

/* ---- Banner (default) — full-width block ---- */
.test-mode-notice--banner {
  padding: var(--space-3) var(--space-4);
  width: 100%;
}
.test-mode-notice--banner .test-mode-notice__icon {
  margin-top: 1px;
}
.test-mode-notice--banner .test-mode-notice__copy {
  font-size: var(--text-xs);
}

/* ---- Pill — compact single-line chip ---- */
.test-mode-notice--pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  width: auto;
}
.test-mode-notice--pill .test-mode-notice__text {
  flex-wrap: nowrap;
}
.test-mode-notice--pill .test-mode-notice__copy {
  font-size: var(--text-xs);
  white-space: nowrap;
}
</style>
