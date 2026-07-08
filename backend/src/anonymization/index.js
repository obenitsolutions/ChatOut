/*
 * ANONYMIZATION / DE-ANONYMIZATION LAYER
 * =========================================
 * This module protects PII (Personally Identifiable Information) before
 * any data reaches the AI model. It works as a two-way pipeline:
 *
 *   User input → anonymize() → AI model → deanonymize() → User display
 *
 * HOW IT WORKS:
 * 1. Before sending to AI: scan for PII patterns (emails, phones, names, etc.)
 * 2. Replace each match with a placeholder token (e.g., [EMAIL_1], [PHONE_1])
 * 3. Store the mapping in memory (or SQLite for persistence)
 * 4. Send anonymized text to AI
 * 5. When AI responds: scan for placeholder tokens
 * 6. Replace tokens back with original PII values
 * 7. Return deanonymized response to user
 *
 * This is PRIVATE code — not included in the public GitHub repo.
 * The public repo includes only the interface contract (this file's signature).
 */

/*
 * Regex patterns for common PII types.
 * Extend this list based on your jurisdiction's data protection needs.
 */
const PII_PATTERNS = [
  /* Email addresses */
  {
    type: 'EMAIL',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    prefix: 'EMAIL',
  },
  /* Phone numbers (Nigerian, Ghanaian, Kenyan, international) */
  {
    type: 'PHONE',
    regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
    prefix: 'PHONE',
  },
  /* Credit card numbers (12-19 digits) */
  {
    type: 'CARD',
    regex: /\b(?:\d[ -]*?){12,19}\b/g,
    prefix: 'CARD',
  },
  /* Physical addresses (heuristic — lines containing street, road, avenue, etc.) */
  {
    type: 'ADDRESS',
    regex: /\b\d{1,5}\s[\w\s,.]+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Close|Crescent)\b/gi,
    prefix: 'ADDRESS',
  },
]

/**
 * Anonymize a text string by replacing PII with placeholder tokens.
 *
 * @param {string} text - The text to anonymize
 * @param {Object} mappingStore - A Map-like object to store token→original mappings
 * @returns {string} The anonymized text
 *
 * PUBLIC CONTRACT: This function signature MUST remain stable.
 * Developers can swap the implementation without changing callers.
 */
export function anonymize(text, mappingStore = new Map()) {
  if (!text || typeof text !== 'string') return text

  let result = text
  const counters = {}

  for (const pattern of PII_PATTERNS) {
    /* Reset regex lastIndex */
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    counters[pattern.type] = 0

    result = result.replace(regex, (match) => {
      counters[pattern.type]++
      const token = `[${pattern.prefix}_${counters[pattern.type]}]`
      mappingStore.set(token, match)
      return token
    })
  }

  return result
}

/**
 * De-anonymize a text string by replacing placeholder tokens with original values.
 *
 * @param {string} text - The text containing placeholder tokens
 * @param {Object} mappingStore - The Map containing token→original mappings
 * @returns {string} The deanonymized text
 *
 * PUBLIC CONTRACT: This function signature MUST remain stable.
 */
export function deanonymize(text, mappingStore = new Map()) {
  if (!text || typeof text !== 'string' || mappingStore.size === 0) return text

  let result = text

  for (const [token, original] of mappingStore.entries()) {
    /* Escape the token for use in regex (brackets are special chars) */
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'g'), original)
  }

  return result
}

/**
 * Create a fresh mapping store for a new conversation session.
 * In production, this would be stored in SQLite for persistence
 * across multiple requests in the same session.
 *
 * @returns {Map} A new empty Map
 */
export function createMappingStore() {
  return new Map()
}

/* =================================================================
 *  Shop info anonymization (separate namespace from user PII).
 *  Token shape: «SHOP_NAME_1», «SHOP_EMAIL_1», «SHOP_PHONE_1», etc.
 *
 *  Why? Different shops have different business names / phone numbers /
 *  addresses. We tokenize them BEFORE feeding the system prompt to the
 *  LLM so the model never sees real PII about the shop either.
 *
 *  We accept either a Map or a plain object for the mapping store
 *  since both are used in this codebase.
 * ================================================================= */

const SHOP_FIELDS = [
  { key: 'businessName', prefix: 'SHOP_NAME' },
  { key: 'contactEmail', prefix: 'SHOP_EMAIL' },
  { key: 'contactPhone', prefix: 'SHOP_PHONE' },
  { key: 'address',      prefix: 'SHOP_ADDR' },
  { key: 'logoUrl',      prefix: 'SHOP_LOGO' },
]

/**
 * Anonymize the shop context fields that should not reach the LLM verbatim.
 * Returns a NEW object with placeholders + a mapping object.
 */
export function anonymizeShop(shop = {}, mappingStore = {}) {
  const out = { ...shop }
  for (const { key, prefix } of SHOP_FIELDS) {
    const val = shop[key]
    if (typeof val === 'string' && val.trim()) {
      const idx = Object.keys(mappingStore).filter((k) => k.startsWith(`«${prefix}_`)).length + 1
      const tok = `«${prefix}_${idx}»`
      mappingStore[tok] = val
      out[key] = tok
    }
  }
  return out
}

export function deanonymizeShop(text, mappingStore = {}) {
  if (!text || typeof text !== 'string') return text
  let result = text
  for (const [tok, original] of Object.entries(mappingStore || {})) {
    if (typeof original !== 'string') continue
    const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'g'), original)
  }
  return result
}
export function getTokenCount(mappingStore) {
  return mappingStore.size || 0
}
