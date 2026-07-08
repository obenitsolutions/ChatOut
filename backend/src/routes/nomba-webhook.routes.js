/*
 * Nomba webhook receiver.
 *
 * POST /api/webhook/nomba
 *   - Verifies HMAC-SHA256 signature using NOMBA_WEBHOOK_SECRET.
 *   - Persists incoming events to data/nomba_webhooks.sqlite (idempotent).
 *   - Always responds 200 quickly so Nomba stops retrying.
 *
 * Signature input (per Nomba docs):
 *   `${event_type}:${requestId}:${merchant.userId}:${merchant.walletId}
 *    :${transaction.transactionId}:${transaction.type}:${transaction.time}
 *    :${transaction.responseCode}:${nombaTimestamp}`
 *
 * If `transaction.responseCode === "null"` (literal string), treat it as empty.
 * Header names are case-insensitive (we read lowercase).
 *
 * Supported events:
 *   payment_success  -> mark order PAID, fire post-payment actions
 *   payment_failed   -> mark order FAILED
 *   payment_reversal -> mark order REVERSED
 *   payout_success   -> record merchant debit
 *   payout_failed    -> log merchant debit failure
 *   payout_refund    -> record refund credit
 */

import { Router } from 'express'
import crypto from 'crypto'
import sqlite3 from 'sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { logger } from '../logging/logger.js'
import { DATA_DIR, NOMBA_WEBHOOK_SECRET } from '../config/paths.js'
import { markOrderPaid } from '../db/orders.js'

const router = Router()

/* ---------------------------------------------------------------------------
 * Dedicated sqlite connection for webhook events (separate file so it does
 * not contend with cart.db / chatout.db and so cleanup is trivial).
 * ------------------------------------------------------------------------- */
const HOOK_DB_PATH = join(DATA_DIR, 'nomba_webhooks.sqlite')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

const hookDb = new sqlite3.Database(HOOK_DB_PATH, (err) => {
  if (err) {
    logger.error('Nomba webhook DB connection failed:', err.message)
  } else {
    logger.info(`Nomba webhook DB: ${HOOK_DB_PATH}`)
  }
})

hookDb.serialize(() => {
  hookDb.run('PRAGMA journal_mode = WAL')
  hookDb.run(`
    CREATE TABLE IF NOT EXISTS nomba_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      request_id TEXT NOT NULL UNIQUE,
      signature TEXT,
      algorithm TEXT,
      version TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT,
      processing_status TEXT NOT NULL DEFAULT 'received',
      raw_payload TEXT NOT NULL,
      merchant_user_id TEXT,
      merchant_wallet_id TEXT,
      transaction_id TEXT,
      transaction_type TEXT,
      transaction_amount REAL,
      transaction_time TEXT,
      transaction_response_code TEXT,
      nomba_timestamp TEXT,
      customer_name TEXT,
      customer_account TEXT,
      notes TEXT
    )
  `)
  hookDb.run(
    'CREATE INDEX IF NOT EXISTS idx_nomba_webhooks_event_type ON nomba_webhooks(event_type)',
  )
  hookDb.run(
    'CREATE INDEX IF NOT EXISTS idx_nomba_webhooks_received_at ON nomba_webhooks(received_at)',
  )
  hookDb.run(
    'CREATE INDEX IF NOT EXISTS idx_nomba_webhooks_transaction_id ON nomba_webhooks(transaction_id)',
  )
})

/* Promise wrappers */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    hookDb.run(sql, params, function (err) {
      if (err) return reject(err)
      resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    hookDb.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows || [])
    })
  })
}

/* ---------------------------------------------------------------------------
 * Signature verification
 * ------------------------------------------------------------------------- */
function safe(v) {
  if (v === null || v === undefined) return ''
  return String(v)
}

function generateNombaSignature(payload, secret, nombaTimestamp) {
  const eventType = safe(payload?.event_type)
  const requestId = safe(payload?.requestId)
  const merchant = payload?.data?.merchant ?? {}
  const transaction = payload?.data?.transaction ?? {}

  const userId = safe(merchant.userId)
  const walletId = safe(merchant.walletId)
  const transactionId = safe(transaction.transactionId)
  const transactionType = safe(transaction.type)
  const transactionTime = safe(transaction.time)
  let responseCode = safe(transaction.responseCode)
  if (responseCode.toLowerCase() === 'null') responseCode = ''

  const hashingPayload = [
    eventType,
    requestId,
    userId,
    walletId,
    transactionId,
    transactionType,
    transactionTime,
    responseCode,
    nombaTimestamp,
  ].join(':')

  return crypto
    .createHmac('sha256', secret)
    .update(hashingPayload)
    .digest('base64')
}

function verifyNombaSignature(req) {
  const sigHeader =
    req.header('nomba-signature') ||
    req.header('nomba-sig-value') ||
    ''
  const algorithm = req.header('nomba-signature-algorithm') || ''
  const version = req.header('nomba-signature-version') || ''
  const nombaTimestamp = req.header('nomba-timestamp') || ''

  if (!NOMBA_WEBHOOK_SECRET) {
    return { ok: false, reason: 'NOMBA_WEBHOOK_SECRET not configured' }
  }
  if (!sigHeader) {
    return { ok: false, reason: 'missing nomba-signature header' }
  }
  if (algorithm && algorithm !== 'HmacSHA256') {
    return { ok: false, reason: `unsupported algorithm: ${algorithm}` }
  }

  const expected = generateNombaSignature(
    req.body,
    NOMBA_WEBHOOK_SECRET,
    nombaTimestamp,
  )

  const a = Buffer.from(sigHeader, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  const matches =
    a.length === b.length && crypto.timingSafeEqual(a, b)

  return {
    ok: matches,
    reason: matches ? '' : 'signature mismatch',
    signature: sigHeader,
    algorithm,
    version,
    nombaTimestamp,
  }
}

/* ---------------------------------------------------------------------------
 * Insert helper — UNIQUE(request_id) makes it idempotent.
 * ------------------------------------------------------------------------- */
async function persistWebhook({
  payload,
  signature,
  algorithm,
  version,
  nombaTimestamp,
}) {
  const eventType = safe(payload?.event_type)
  const requestId = safe(payload?.requestId)
  const merchant = payload?.data?.merchant ?? {}
  const transaction = payload?.data?.transaction ?? {}
  const customer = payload?.data?.customer ?? {}

  const transactionAmount =
    Number(transaction.transactionAmount) || null
  let responseCode = safe(transaction.responseCode)
  if (responseCode.toLowerCase() === 'null') responseCode = ''

  const result = await dbRun(
    `INSERT OR IGNORE INTO nomba_webhooks (
      event_type, request_id, signature, algorithm, version,
      nomba_timestamp, raw_payload,
      merchant_user_id, merchant_wallet_id,
      transaction_id, transaction_type, transaction_amount,
      transaction_time, transaction_response_code,
      customer_name, customer_account
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventType,
      requestId,
      signature,
      algorithm,
      version,
      nombaTimestamp,
      JSON.stringify(payload),
      safe(merchant.userId),
      safe(merchant.walletId),
      safe(transaction.transactionId),
      safe(transaction.type),
      transactionAmount,
      safe(transaction.time),
      responseCode,
      safe(customer.senderName || customer.recipientName),
      safe(customer.accountNumber),
    ],
  )

  return { inserted: result.changes === 1, requestId }
}

/* ---------------------------------------------------------------------------
 * Business logic per event_type — kept intentionally small for Phase 1.
 * ------------------------------------------------------------------------- */
function handleEvent(payload) {
  const eventType = safe(payload?.event_type)
  const transaction = payload?.data?.transaction ?? {}
  const merchant = payload?.data?.merchant ?? {}

  switch (eventType) {
    case 'payment_success': {
      logger.info('Nomba payment_success', {
        amount: transaction.transactionAmount,
        transactionId: transaction.transactionId,
        walletBalance: merchant.walletBalance,
      })
      /* Fire-and-forget order reconciliation — never throw, never block ACK.
       * Our CHATOUT- reference was passed to Nomba as orderReference, so try
       * matching on both the nomba_order_reference and our own reference. */
      const orderReference = payload?.data?.order?.orderReference
      // eslint-disable-next-line no-unused-vars
      const aliasAccountReference =
        payload?.data?.transaction?.aliasAccountReference
      if (orderReference) {
        markOrderPaid({ nombaOrderReference: orderReference }).catch(() => {})
        markOrderPaid({ reference: orderReference }).catch(() => {})
      }
      break
    }

    case 'payment_failed':
      logger.warn('Nomba payment_failed', {
        type: transaction.type,
        responseCode: transaction.responseCode,
        responseCodeMessage: transaction.responseCodeMessage,
      })
      break

    case 'payment_reversal':
      logger.warn('Nomba payment_reversal', {
        transactionId: transaction.transactionId,
      })
      break

    case 'payout_success':
      logger.info('Nomba payout_success', {
        amount: transaction.transactionAmount,
        merchantTxRef: transaction.merchantTxRef,
      })
      break

    case 'payout_failed':
      logger.warn('Nomba payout_failed', {
        type: transaction.type,
        responseCode: transaction.responseCode,
      })
      break

    case 'payout_refund':
      logger.info('Nomba payout_refund', {
        amount: transaction.transactionAmount,
      })
      break

    default:
      logger.info('Nomba webhook (unknown event_type)', { eventType })
  }
}

/* ---------------------------------------------------------------------------
 * Route — IMPORTANT: respond 200 FAST. Nomba retries on non-2xx with
 * exponential backoff (2m / 5m / 11m / 24m / 53m).
 * ------------------------------------------------------------------------- */
router.post('/', async (req, res) => {
  try {
    const verify = verifyNombaSignature(req)

    if (!verify.ok) {
      logger.warn('Nomba webhook signature rejected', {
        reason: verify.reason,
        eventType: req.body?.event_type,
        requestId: req.body?.requestId,
        ip: req.ip,
      })
      return res.status(200).json({
        ok: false,
        verified: false,
        reason: verify.reason,
      })
    }

    const persistResult = await persistWebhook({
      payload: req.body,
      signature: verify.signature,
      algorithm: verify.algorithm,
      version: verify.version,
      nombaTimestamp: verify.nombaTimestamp,
    })

    /* ACK IMMEDIATELY */
    res.status(200).json({
      ok: true,
      verified: true,
      duplicate: !persistResult.inserted,
      requestId: persistResult.requestId,
    })

    if (persistResult.inserted) {
      try {
        handleEvent(req.body)
        await dbRun(
          `UPDATE nomba_webhooks
             SET processed_at = datetime('now'),
                 processing_status = 'processed'
           WHERE request_id = ?`,
          [persistResult.requestId],
        )
      } catch (err) {
        logger.error('Nomba webhook side-effect failed', {
          requestId: persistResult.requestId,
          error: err.message,
        })
        await dbRun(
          `UPDATE nomba_webhooks
             SET processing_status = 'error',
                 notes = ?
           WHERE request_id = ?`,
          [err.message, persistResult.requestId],
        ).catch(() => {})
      }
    }
  } catch (err) {
    logger.error('Nomba webhook handler crashed', { error: err.message })
    res.status(200).json({ ok: false, error: 'internal' })
  }
})

/* ---------------------------------------------------------------------------
 * Admin helper — list recent webhooks for debugging.
 * ------------------------------------------------------------------------- */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const rows = await dbAll(
      `SELECT id, event_type, request_id, transaction_id, transaction_amount,
              transaction_type, transaction_response_code, processing_status,
              received_at, processed_at
         FROM nomba_webhooks
        ORDER BY received_at DESC
        LIMIT ?`,
      [limit],
    )
    res.json({ ok: true, count: rows.length, rows })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router