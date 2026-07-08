/*
 * Interactions database — `backend/data/interactions.sqlite`.
 *
 * One row per exchange (user message + final assistant reply + the
 * ground-truth catalog XML the model saw at the time). Modeled after
 * salescatalog's INTERACTION_DATASET_IMPLEMENTATION.md blueprint,
 * adapted for our single-shop ChatOut architecture (no `tenant_id`,
 * we use `shop_id` instead).
 *
 * - Schema is created on first use (idempotent).
 * - Writes are fire-and-forget (the chat route calls .catch() on the
 *   returned promise so a DB failure never blocks the response).
 * - All PII has already been anonymized before this layer sees the
 *   user message (handled in chat.routes.js).
 */

import Database from 'sqlite3'
import { v4 as uuid } from 'uuid'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { logger } from '../logging/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DB_DIR = join(__dirname, '..', '..', 'data')
const DB_PATH = join(DB_DIR, 'interactions.sqlite')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS interactions (
  id                TEXT PRIMARY KEY,
  shop_id           TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  user_message      TEXT NOT NULL,
  assistant_reply   TEXT NOT NULL,
  tool_calls_json   TEXT,
  cart_state_json   TEXT,
  catalog_xml       TEXT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  total_tokens      INTEGER,
  cache_hit_tokens    INTEGER,
  cache_miss_tokens   INTEGER,
  model_used        TEXT,
  response_time_ms  INTEGER,
  grounding_verified INTEGER DEFAULT 0,
  grounding_passed  INTEGER,
  grounding_severity TEXT,
  grounding_issues_json TEXT,
  was_regenerated   INTEGER DEFAULT 0,
  prompt_version    TEXT,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interactions_shop    ON interactions(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_grounding ON interactions(grounding_passed, created_at DESC);
`

/* Idempotent migrations for older DBs (added in v7.x). */
const MIGRATIONS = [
  `ALTER TABLE interactions ADD COLUMN grounding_verified INTEGER DEFAULT 0`,
  `ALTER TABLE interactions ADD COLUMN grounding_passed INTEGER`,
  `ALTER TABLE interactions ADD COLUMN grounding_severity TEXT`,
  `ALTER TABLE interactions ADD COLUMN grounding_issues_json TEXT`,
  `ALTER TABLE interactions ADD COLUMN was_regenerated INTEGER DEFAULT 0`,
  `ALTER TABLE interactions ADD COLUMN prompt_version TEXT`,
]

let db = null

function getDb() {
  if (db) return db
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true })
  db = new Database.Database(DB_PATH)
  db.exec(SCHEMA, (err) => {
    if (err) logger.error('[interactions] schema bootstrap failed:', err.message)
    else logger.info(`[interactions] db ready: ${DB_PATH}`)
  })
  /* Apply idempotent column migrations (older DBs created before v7.x). */
  for (const sql of MIGRATIONS) {
    db.exec(sql, (err) => {
      /* Ignore "duplicate column name" — that's exactly what we want for idempotency. */
      if (err && !/duplicate column name/i.test(err.message)) {
        logger.warn(`[interactions] migration warning: ${err.message}`)
      }
    })
  }
  return db
}

/**
 * Persist one interaction. Fire-and-forget; never throws.
 */
export function saveInteraction(data) {
  return new Promise((resolve, reject) => {
    try {
      const handle = getDb()
      const row = {
        id:                data.id || uuid(),
        shop_id:           String(data.shopId || 'demo-shop-001'),
        session_id:        String(data.sessionId || 'anon'),
        user_message:      String(data.userMessage || ''),
        assistant_reply:   String(data.assistantReply || ''),
        tool_calls_json:   data.toolCalls ? JSON.stringify(data.toolCalls) : null,
        cart_state_json:   data.cartState ? JSON.stringify(data.cartState) : null,
        catalog_xml:       data.catalogXml ? String(data.catalogXml) : null,
        prompt_tokens:     Number(data.promptTokens) || 0,
        completion_tokens: Number(data.completionTokens) || 0,
        total_tokens:      Number(data.totalTokens) || 0,
        cache_hit_tokens:    Number(data.cacheHitTokens) || 0,
        cache_miss_tokens:   Number(data.cacheMissTokens) || 0,
        model_used:        String(data.modelUsed || 'deepseek-v4-flash'),
        response_time_ms:  Number(data.responseTimeMs) || 0,
        grounding_verified:    data.groundingVerified ? 1 : 0,
        grounding_passed:      data.groundingPassed == null ? null : (data.groundingPassed ? 1 : 0),
        grounding_severity:    data.groundingSeverity || null,
        grounding_issues_json: data.groundingIssues ? JSON.stringify(data.groundingIssues) : null,
        was_regenerated:       data.wasRegenerated ? 1 : 0,
        prompt_version:        data.promptVersion || null,
      }

      handle.run(
        `INSERT INTO interactions (
          id, shop_id, session_id, user_message, assistant_reply,
          tool_calls_json, cart_state_json, catalog_xml,
          prompt_tokens, completion_tokens, total_tokens,
          cache_hit_tokens, cache_miss_tokens, model_used, response_time_ms,
          grounding_verified, grounding_passed, grounding_severity,
          grounding_issues_json, was_regenerated, prompt_version
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          row.id, row.shop_id, row.session_id, row.user_message, row.assistant_reply,
          row.tool_calls_json, row.cart_state_json, row.catalog_xml,
          row.prompt_tokens, row.completion_tokens, row.total_tokens,
          row.cache_hit_tokens, row.cache_miss_tokens, row.model_used, row.response_time_ms,
          row.grounding_verified, row.grounding_passed, row.grounding_severity,
          row.grounding_issues_json, row.was_regenerated, row.prompt_version,
        ],
        function (err) {
          if (err) {
            logger.error('[interactions] insert failed:', err.message, '| row keys:', Object.keys(row).join(','))
            reject(err)
          } else {
            resolve(row.id)
          }
        }
      )
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Read back paginated interactions for the admin endpoint.
 */
export function getInteractions({ shopId, sessionId, limit = 50, offset = 0 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const handle = getDb()
      const where = []
      const args = []
      /* Defence-in-depth: even though we pass user input via ? placeholders,
         coerce to plain strings and cap length to thwart accidental SQL
         injection from upstream bugs (e.g. a future refactor that forgets
         to use the placeholder). 256 chars is far more than any legitimate
         shop id or session id. */
      const cleanShop = typeof shopId === 'string' ? shopId.slice(0, 256) : null
      const cleanSession = typeof sessionId === 'string' ? sessionId.slice(0, 256) : null
      if (cleanShop)    { where.push('shop_id = ?');    args.push(cleanShop) }
      if (cleanSession) { where.push('session_id = ?'); args.push(cleanSession) }
      const sql = `SELECT id, shop_id, session_id, user_message, assistant_reply,
                          tool_calls_json, cart_state_json, model_used,
                          prompt_tokens, completion_tokens, total_tokens,
                          cache_hit_tokens, cache_miss_tokens, response_time_ms,
                          created_at
                   FROM interactions
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY created_at DESC
                   LIMIT ? OFFSET ?`
      args.push(Math.min(500, Math.max(1, Number(limit) || 50)))
      args.push(Math.max(0, Number(offset) || 0))
      handle.all(sql, args, (err, rows) => {
        if (err) reject(err)
        else resolve(rows.map((r) => ({
          ...r,
          tool_calls: r.tool_calls_json ? safeParse(r.tool_calls_json) : null,
          cart_state: r.cart_state_json ? safeParse(r.cart_state_json) : null,
        })))
      })
    } catch (e) {
      reject(e)
    }
  })
}

export function getInteractionsCount({ shopId, sessionId } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const handle = getDb()
      const where = []
      const args = []
      const cleanShop = typeof shopId === 'string' ? shopId.slice(0, 256) : null
      const cleanSession = typeof sessionId === 'string' ? sessionId.slice(0, 256) : null
      if (cleanShop)    { where.push('shop_id = ?');    args.push(cleanShop) }
      if (cleanSession) { where.push('session_id = ?'); args.push(cleanSession) }
      const sql = `SELECT COUNT(*) as n FROM interactions ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`
      handle.get(sql, args, (err, row) => {
        if (err) reject(err)
        else resolve(row?.n || 0)
      })
    } catch (e) {
      reject(e)
    }
  })
}

export function getInteractionsCountSince(sinceMs) {
  return new Promise((resolve, reject) => {
    try {
      const handle = getDb()
      const iso = new Date(sinceMs).toISOString().slice(0, 19).replace('T', ' ')
      handle.get(
        `SELECT COUNT(*) as n FROM interactions WHERE created_at >= ?`,
        [iso],
        (err, row) => err ? reject(err) : resolve(row?.n || 0)
      )
    } catch (e) { reject(e) }
  })
}

export function getInteractionById(id) {
  return new Promise((resolve, reject) => {
    try {
      const handle = getDb()
      /* UUID v4 guard — defence-in-depth even though the query is parameterized. */
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return resolve(null)
      }
      handle.get(
        `SELECT * FROM interactions WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) return reject(err)
          if (!row) return resolve(null)
          resolve({
            ...row,
            tool_calls: row.tool_calls_json ? safeParse(row.tool_calls_json) : null,
            cart_state: row.cart_state_json ? safeParse(row.cart_state_json) : null,
          })
        }
      )
    } catch (e) { reject(e) }
  })
}

function safeParse(s) {
  try { return JSON.parse(s) } catch { return null }
}

export function interactionsDbPath() { return DB_PATH }