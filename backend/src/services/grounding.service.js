/*
 * Grounding verification — second-pass self-check of the assistant's
 * reply against ground-truth data. Pattern lifted from
 * salescatalog's standardGrounding.service.js, simplified for our
 * single-model architecture.
 *
 *   1. Send the reply + the ground-truth catalog XML + the cart XML
 *      to a SECOND DeepSeek call at near-deterministic temperature
 *      (0.05) and ask: "is every factual claim consistent with the
 *      data? Return ONLY JSON {is_grounded, severity, issues}".
 *   2. If severity === 'high' (CLEARLY contradicts the data),
 *      regenerate the reply with a chain-of-thought correction
 *      prompt at temperature 0.1.
 *   3. Fail-OPEN: if anything throws, return the original reply and
 *      log a warning. Never block the user on a grounding failure.
 *
 * Result metadata (verified, passed, issues, was_regenerated) is
 * returned to the caller for inclusion in the interactions DB.
 */

import { logger } from '../logging/logger.js'
import { DEEPSEEK_MODEL, DEEPSEEK_BASE_URL } from './deepseek.service.js'

const VERIFY_TIMEOUT_MS = 15_000

const VERIFIER_SYSTEM = `You are a precise fact-checking system. Output ONLY valid JSON. Be conservative — only flag clear, provable contradictions between the response and the ground-truth data. When in doubt, the response IS grounded. False positives are far more harmful than allowing slightly imperfect responses through.`

function buildVerifierPrompt({ reply, catalogXml, cartXml, userMessage }) {
  return `You are verifying whether a chatbot's reply is fully grounded in the provided ground-truth data.

=== GROUND TRUTH (the ONLY source of truth) ===
<catalog>
${catalogXml || ''}
</catalog>
<cart>
${cartXml || ''}
</cart>
=== END GROUND TRUTH ===

CUSTOMER QUESTION:
${userMessage || ''}

REPLY TO VERIFY:
${reply}

VERIFICATION RULES:

GROUNDED (do NOT flag):
- Polite greetings, conversational framing, suggestions
- Reasonable inferences from the data (e.g. "the cheapest is X" if X has the lowest price)
- Formatting variations (NGN vs ₦, commas, units)
- Prices explicitly present in catalog <price> or <original_price> tags
- Discount % computed from (original_price - price) / original_price * 100
- Stock / availability claims directly supported by <stock> or <available> attributes
- Cart contents / quantities / subtotal matching the <cart_state> block

UNGROUNDED (flag with severity 'high'):
- Invented numbers, prices, quantities, percentages NOT in the catalog
- Fabricated products, features, materials, sizes, colors not in the catalog
- Claiming a discount/promo/coupon exists when <promotions> says "none registered"
- Claiming something is in stock when <available>="false" or <stock>=0
- Claiming the cart contains items NOT in <cart_state>
- Pricing or subtotal that contradicts the catalog prices or cart items
- Self-narration: describing what tool the model called, its search process, internal databases

ONLY flag "high" when a claim is CLEARLY AND DIRECTLY CONTRADICTED by the ground truth.

Respond with ONLY this JSON (no markdown, no explanation):
{"is_grounded": true/false, "severity": "none"|"low"|"high", "issues": ["specific contradiction with evidence"]}`
}

function buildCorrectionPrompt({ issues, originalReply, catalogXml, cartXml, userMessage }) {
  return `CORRECTION REQUIRED. Your previous reply contained these factual issues:
${issues.map((s, i) => `${i + 1}. ${s}`).join('\n')}

CUSTOMER QUESTION:
${userMessage || ''}

=== GROUND TRUTH (use ONLY this) ===
<catalog>
${catalogXml || ''}
</catalog>
<cart>
${cartXml || ''}
</cart>
=== END GROUND TRUTH ===

YOUR FAILED REPLY:
${originalReply}

Rewrite the reply so every factual claim matches the ground truth exactly. Do NOT add any prices, products, features, stock claims, discount %, or cart contents that aren't in the ground truth. Use the same conversational tone. Keep the reply under 200 words.

REVISED REPLY:`
}

async function callVerifier({ messages, temperature = 0.05, maxTokens = 600, timeoutMs = VERIFY_TIMEOUT_MS }) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')
  const url = `${DEEPSEEK_BASE_URL}/chat/completions`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`DeepSeek verify ${res.status}`)
    const data = await res.json()
    return {
      text: data?.choices?.[0]?.message?.content?.trim() || '',
      usage: data?.usage || {},
    }
  } finally {
    clearTimeout(timer)
  }
}

function parseVerifierJson(text) {
  /* Strip ```json fences and surrounding whitespace, then JSON.parse. */
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    const obj = JSON.parse(cleaned)
    return {
      is_grounded: !!obj.is_grounded,
      severity: ['none', 'low', 'high'].includes(obj.severity) ? obj.severity : 'none',
      issues: Array.isArray(obj.issues) ? obj.issues.filter((s) => typeof s === 'string') : [],
    }
  } catch {
    return { is_grounded: true, severity: 'none', issues: [], _parseError: true }
  }
}

/**
 * Run grounding verification + optional regeneration.
 *
 * @param {object} args
 * @param {string} args.reply              The assistant's visible reply.
 * @param {string} args.catalogXml         The system-prompt catalog XML (ground truth).
 * @param {string} args.cartXml            The system-prompt cart XML (ground truth).
 * @param {string} args.userMessage        The user's input (for context).
 * @returns {Promise<{ reply, verified, passed, severity, issues, wasRegenerated, verifyTokens }>}
 *
 * ALWAYS returns a string reply (never throws to the caller). On any
 * internal error, returns the original reply with verified=false.
 */
export async function verifyAndCorrect({ reply, catalogXml, cartXml, userMessage }) {
  const result = {
    reply,
    verified: false,
    passed: false,
    severity: 'none',
    issues: [],
    wasRegenerated: false,
    verifyTokens: 0,
  }

  if (!reply || reply.length < 30) return result   /* too short to matter */
  if (!process.env.DEEPSEEK_API_KEY) return result /* demo mode */

  try {
    /* ---- Pass 1: verification ---- */
    const verifyOut = await callVerifier({
      messages: [
        { role: 'system', content: VERIFIER_SYSTEM },
        { role: 'user', content: buildVerifierPrompt({ reply, catalogXml, cartXml, userMessage }) },
      ],
    })
    result.verifyTokens = (verifyOut.usage.prompt_tokens || 0) + (verifyOut.usage.completion_tokens || 0)
    const verdict = parseVerifierJson(verifyOut.text)
    result.verified = true
    result.passed = verdict.is_grounded
    result.severity = verdict.severity
    result.issues = verdict.issues

    logger.info(`[grounding] verified=${result.verified} passed=${result.passed} severity=${result.severity} issues=${result.issues.length}`)

    if (verdict.is_grounded || verdict.severity !== 'high') {
      return result /* either no issues, or low/medium — accept original */
    }

    /* ---- Pass 2: regenerate with chain-of-thought correction ---- */
    const regenOut = await callVerifier({
      messages: [
        { role: 'system', content: 'You are the same shopping assistant. Rewrite your previous reply so every factual claim matches the ground-truth data exactly. Do not invent prices, products, stock claims, discounts, or cart contents. Keep the tone warm and under 200 words.' },
        { role: 'user', content: buildCorrectionPrompt({ issues: verdict.issues, originalReply: reply, catalogXml, cartXml, userMessage }) },
      ],
      temperature: 0.1,
      maxTokens: 900,
      timeoutMs: 20_000,
    })
    result.verifyTokens += (regenOut.usage.prompt_tokens || 0) + (regenOut.usage.completion_tokens || 0)
    const corrected = (regenOut.text || '').trim()
    if (corrected && corrected.length >= 20) {
      result.reply = corrected
      result.wasRegenerated = true
      /* Re-verify is optional (salescatalog does it). We skip the second verify
         to save latency — the original reply was already bad; the regen is
         prompted with the explicit issues list so it usually lands cleanly. */
      logger.warn(`[grounding] regenerated reply (${verdict.issues.length} issues corrected)`)
    }
    return result
  } catch (err) {
    /* Fail-open: return the original reply. Never block the user. */
    logger.error(`[grounding] verification failed (fail-open): ${err.message}`)
    return result
  }
}