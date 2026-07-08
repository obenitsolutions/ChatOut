/**
 * Nomba payment-gateway service.
 *
 * Thin, well-tested wrapper around the Nomba REST API used by ChatOut
 * for collecting payments. All facts below were validated live against
 * the Nomba API and must not be changed casually:
 *
 *  1. Auth uses the OAuth `client_credentials` flow. The issued
 *     access_token is cached in module scope and proactively refreshed
 *     when it is within 5 minutes of `expiresAt`.
 *  2. Every authenticated call sends BOTH the `Authorization: Bearer`
 *     header AND the `accountId` header (NOMBA_ACCOUNT_ID).
 *  3. Success is signalled by `data.code === '00'`. Any other code (or a
 *     non-2xx HTTP status) is treated as a failure: we log it and throw.
 *
 * Networking mirrors src/services/deepseek.service.js — global `fetch`
 * (Node 20+) guarded by an AbortController timeout.
 *
 * Secrets are never hardcoded here; they come from ../config/paths.js,
 * which reads them from the environment.
 */

import {
  NOMBA_CLIENT_ID,
  NOMBA_CLIENT_SECRET,
  NOMBA_ACCOUNT_ID,
  NOMBA_BASE_URL,
} from '../config/paths.js'
import { logger } from '../logging/logger.js'

/* Request timeout, matching the deepseek.service.js AbortController style. */
export const NOMBA_TIMEOUT_MS = Number(process.env.NOMBA_TIMEOUT_MS || 20000)

/* Refresh the token when we are within this window of expiry (5 minutes). */
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000

/* ------------------------------------------------------------------
 * Module-scoped token cache.
 *   tokenCache.accessToken → the current bearer token (or null)
 *   tokenCache.expiresAtMs → epoch ms at which the token expires
 *   tokenCache.pending     → an in-flight getToken() promise so that
 *                            concurrent callers share one auth request
 * ------------------------------------------------------------------ */
const tokenCache = {
  accessToken: null,
  expiresAtMs: 0,
  pending: null,
}

/* ------------------------------------------------------------------
 * Low-level fetch helper — global fetch + AbortController timeout.
 * Returns the parsed JSON body. Throws on network error, timeout, or
 * non-2xx HTTP status (the caller still validates data.code === '00').
 * ------------------------------------------------------------------ */
async function nombaFetch(url, { method = 'POST', headers = {}, body = null } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), NOMBA_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })

    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* Non-JSON body — surfaced below as an error. */
      json = null
    }

    if (!res.ok) {
      logger.error(`[nomba] ${method} ${url} → HTTP ${res.status}: ${text.slice(0, 400)}`)
      throw new Error(`Nomba request failed with HTTP ${res.status}`)
    }

    if (!json) {
      logger.error(`[nomba] ${method} ${url} → non-JSON response: ${text.slice(0, 400)}`)
      throw new Error('Nomba returned a non-JSON response')
    }

    return json
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.error(`[nomba] ${method} ${url} timed out after ${NOMBA_TIMEOUT_MS}ms`)
      throw new Error(`Nomba request timed out after ${NOMBA_TIMEOUT_MS}ms`)
    }
    /* Re-throw HTTP/JSON errors raised above untouched; wrap the rest. */
    if (err instanceof Error && /^Nomba /.test(err.message)) throw err
    logger.error(`[nomba] ${method} ${url} network error: ${err.message}`)
    throw new Error(`Nomba network error: ${err.message}`)
  } finally {
    clearTimeout(timer)
  }
}

/* Standard authenticated headers used by every non-auth endpoint. */
function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    accountId: NOMBA_ACCOUNT_ID,
  }
}

/* Guard: fail fast (and clearly) when required credentials are missing. */
function assertCredentials() {
  if (!NOMBA_CLIENT_ID || !NOMBA_CLIENT_SECRET || !NOMBA_ACCOUNT_ID) {
    throw new Error(
      'Nomba credentials are not configured (NOMBA_CLIENT_ID / NOMBA_CLIENT_SECRET / NOMBA_ACCOUNT_ID)'
    )
  }
}

/* ------------------------------------------------------------------
 * getToken — issue (or reuse) an OAuth access token.
 *
 * Returns the access_token string. The token is cached in module scope
 * and refreshed when within 5 minutes of `expiresAt`. Concurrent calls
 * share a single in-flight auth request via tokenCache.pending.
 * ------------------------------------------------------------------ */
export async function getToken() {
  const now = Date.now()

  /* Fast path: cached token still comfortably valid. */
  if (tokenCache.accessToken && now < tokenCache.expiresAtMs - TOKEN_REFRESH_SKEW_MS) {
    return tokenCache.accessToken
  }

  /* Collapse concurrent refreshes into one network request. */
  if (tokenCache.pending) return tokenCache.pending

  tokenCache.pending = (async () => {
    assertCredentials()

    const url = `${NOMBA_BASE_URL}/v1/auth/token/issue`
    const json = await nombaFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accountId: NOMBA_ACCOUNT_ID,
      },
      body: {
        grant_type: 'client_credentials',
        client_id: NOMBA_CLIENT_ID,
        client_secret: NOMBA_CLIENT_SECRET,
      },
    })

    if (json.code !== '00' || !json.data?.access_token) {
      logger.error(`[nomba] token issue failed: ${JSON.stringify(json).slice(0, 400)}`)
      throw new Error(`Nomba token issue failed (code=${json.code ?? 'unknown'})`)
    }

    const { access_token: accessToken, expiresAt } = json.data

    /* expiresAt may be an ISO string or epoch value; fall back to a
       conservative 55-minute lifetime when it cannot be parsed. */
    let expiresAtMs = Date.parse(expiresAt)
    if (Number.isNaN(expiresAtMs)) {
      const numeric = Number(expiresAt)
      expiresAtMs = Number.isFinite(numeric) && numeric > 0
        ? (numeric < 1e12 ? numeric * 1000 : numeric)
        : Date.now() + 55 * 60 * 1000
    }

    tokenCache.accessToken = accessToken
    tokenCache.expiresAtMs = expiresAtMs
    logger.info('[nomba] issued new access token')
    return accessToken
  })()

  try {
    return await tokenCache.pending
  } catch (err) {
    /* Never leave a poisoned cache behind on failure. */
    tokenCache.accessToken = null
    tokenCache.expiresAtMs = 0
    throw err
  } finally {
    tokenCache.pending = null
  }
}

/* ------------------------------------------------------------------
 * createVirtualAccount — provision a reserved virtual bank account.
 *
 * @param {object}  opts
 * @param {string}  opts.accountRef    unique reference, 16-64 chars
 * @param {string}  opts.accountName   account holder name to display
 * @param {string} [opts.currency='NGN']
 * @returns {Promise<object>} the response `data` object:
 *   { bankAccountNumber, bankAccountName, bankName, accountRef,
 *     accountHolderId, currency, expired }
 * Throws on non-'00' response code.
 * ------------------------------------------------------------------ */
export async function createVirtualAccount({ accountRef, accountName, currency = 'NGN' }) {
  if (!accountRef || accountRef.length < 16 || accountRef.length > 64) {
    throw new Error('createVirtualAccount: accountRef must be 16-64 characters')
  }
  if (!accountName) {
    throw new Error('createVirtualAccount: accountName is required')
  }

  const token = await getToken()
  const url = `${NOMBA_BASE_URL}/v1/accounts/virtual`

  const json = await nombaFetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: { accountRef, accountName, currency },
  })

  if (json.code !== '00') {
    logger.error(`[nomba] createVirtualAccount failed: ${JSON.stringify(json).slice(0, 400)}`)
    throw new Error(`Nomba createVirtualAccount failed (code=${json.code ?? 'unknown'})`)
  }

  return json.data
}

/* ------------------------------------------------------------------
 * createCheckoutOrder — create a hosted-checkout order and get its link.
 *
 * @param {object}  opts
 * @param {string}  opts.amount                 amount as a STRING, e.g. '5000.00'
 * @param {string} [opts.currency='NGN']
 * @param {string}  opts.customerEmail
 * @param {string}  opts.callbackUrl
 * @param {string}  opts.orderReference
 * @param {string} [opts.accountId=null]        only sent when provided
 * @param {object} [opts.orderMetaData=null]    only sent when provided
 * @param {*}      [opts.allowedPaymentMethods=null] only sent when provided
 * @returns {Promise<{checkoutLink: string, orderReference: string}>}
 * Throws on non-'00' response code.
 * ------------------------------------------------------------------ */
export async function createCheckoutOrder({
  amount,
  currency = 'NGN',
  customerEmail,
  callbackUrl,
  orderReference,
  accountId = null,
  orderMetaData = null,
  allowedPaymentMethods = null,
}) {
  if (typeof amount !== 'string') {
    throw new Error("createCheckoutOrder: amount must be a STRING like '5000.00'")
  }
  if (!customerEmail) throw new Error('createCheckoutOrder: customerEmail is required')
  if (!callbackUrl) throw new Error('createCheckoutOrder: callbackUrl is required')
  if (!orderReference) throw new Error('createCheckoutOrder: orderReference is required')

  const token = await getToken()
  const url = `${NOMBA_BASE_URL}/v1/checkout/order`

  /* Build the order object; only include optional fields when non-null. */
  const order = {
    amount,
    currency,
    customerEmail,
    callbackUrl,
    orderReference,
  }
  if (accountId != null) order.accountId = accountId
  if (orderMetaData != null) order.orderMetaData = orderMetaData
  if (allowedPaymentMethods != null) order.allowedPaymentMethods = allowedPaymentMethods

  const json = await nombaFetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: { order },
  })

  if (json.code !== '00') {
    logger.error(`[nomba] createCheckoutOrder failed: ${JSON.stringify(json).slice(0, 400)}`)
    throw new Error(`Nomba createCheckoutOrder failed (code=${json.code ?? 'unknown'})`)
  }

  return {
    checkoutLink: json.data?.checkoutLink,
    orderReference: json.data?.orderReference,
  }
}

/* ------------------------------------------------------------------
 * verifyTransaction — look up a transaction by its order reference.
 *
 * @param {string} orderReference
 * @returns {Promise<object>} the response `data` object.
 * Throws on non-'00' response code.
 * ------------------------------------------------------------------ */
export async function verifyTransaction(orderReference) {
  if (!orderReference) throw new Error('verifyTransaction: orderReference is required')

  const token = await getToken()
  const url = `${NOMBA_BASE_URL}/v1/transactions/accounts/single?orderReference=${encodeURIComponent(orderReference)}`

  const json = await nombaFetch(url, {
    method: 'GET',
    headers: authHeaders(token),
  })

  if (json.code !== '00') {
    logger.error(`[nomba] verifyTransaction failed: ${JSON.stringify(json).slice(0, 400)}`)
    throw new Error(`Nomba verifyTransaction failed (code=${json.code ?? 'unknown'})`)
  }

  return json.data
}
