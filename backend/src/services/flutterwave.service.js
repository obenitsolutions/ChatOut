/*
 * Flutterwave service — read-only KYC helpers.
 *   - resolveAccount: resolve a bank account number to its account name.
 *   - listBanks: list Nigerian banks (cached ~1h in module scope).
 *   - matchAccountName: tolerant name comparison for KYC verification.
 */

import { FLW_SECRET_KEY, FLW_BASE_URL } from '../config/paths.js'
import { logger } from '../logging/logger.js'

const REQUEST_TIMEOUT_MS = 15000
const BANKS_CACHE_TTL_MS = 60 * 60 * 1000

let banksCache = null
let banksCacheAt = 0

async function flwFetch(path, { method = 'GET', headers = {}, body } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${FLW_BASE_URL}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    })
    const json = await res.json().catch(() => null)
    return { res, json }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve a bank account number to its registered account name.
 * @param {{ accountNumber: string, bankCode: string }} params
 * @returns {Promise<{ accountNumber: string, accountName: string }>}
 * @throws {Error} if Flutterwave does not return status 'success'.
 */
export async function resolveAccount({ accountNumber, bankCode }) {
  const { res, json } = await flwFetch('/v3/accounts/resolve', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FLW_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account_number: accountNumber,
      account_bank: bankCode,
    }),
  })

  if (!json || json.status !== 'success' || !json.data) {
    const message = (json && json.message) || `HTTP ${res.status}`
    logger.warn('Flutterwave resolveAccount failed', {
      accountNumber,
      bankCode,
      status: res.status,
      message,
    })
    throw new Error(`Account resolution failed: ${message}`)
  }

  return {
    accountNumber: json.data.account_number,
    accountName: json.data.account_name,
  }
}

/**
 * List Nigerian banks. Result is cached in module scope for ~1h.
 * @returns {Promise<Array<{ code: string, name: string }>>}
 */
export async function listBanks() {
  const now = Date.now()
  if (banksCache && now - banksCacheAt < BANKS_CACHE_TTL_MS) {
    return banksCache
  }

  const { res, json } = await flwFetch('/v3/banks/NG', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${FLW_SECRET_KEY}`,
    },
  })

  if (!json || json.status !== 'success' || !Array.isArray(json.data)) {
    const message = (json && json.message) || `HTTP ${res.status}`
    logger.warn('Flutterwave listBanks failed', {
      status: res.status,
      message,
    })
    throw new Error(`Failed to list banks: ${message}`)
  }

  banksCache = json.data.map((bank) => ({ code: bank.code, name: bank.name }))
  banksCacheAt = now
  return banksCache
}

function normalize(s) {
  const cleaned = String(s == null ? '' : s)
    .toUpperCase()
    .split('')
    .map((ch) => {
      if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === ' ') {
        return ch
      }
      return ' '
    })
    .join('')

  return cleaned
    .split(' ')
    .filter((token) => token.length > 0)
}

/**
 * Tolerant account-name match.
 * A real test showed the bank returns "OBEN EMMANUEL MBU" when the user typed
 * "OBEN EMMANUEL", so strict equality is wrong.
 *
 * Returns true if either token set is a subset of the other, or the two sets
 * share at least 2 tokens.
 * @param {string} nameA
 * @param {string} nameB
 * @returns {boolean}
 */
export function matchAccountName(nameA, nameB) {
  const tokensA = normalize(nameA)
  const tokensB = normalize(nameB)

  if (tokensA.length === 0 || tokensB.length === 0) {
    return false
  }

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)

  let intersectionSize = 0
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionSize++
    }
  }

  const aSubsetOfB = intersectionSize === setA.size
  const bSubsetOfA = intersectionSize === setB.size

  return aSubsetOfB || bSubsetOfA || intersectionSize >= 2
}
