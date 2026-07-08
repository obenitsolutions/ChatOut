/*
 * Migration 002 — Nomba webhook event persistence.
 *
 * Creates `nomba_webhooks` table (separate sqlite file
 * data/nomba_webhooks.sqlite) for idempotent storage of every webhook
 * Nomba delivers to /api/webhook/nomba. UNIQUE(request_id) guarantees
 * duplicate deliveries (Nomba retries up to 5 times) are absorbed.
 *
 * Run with:
 *   node migrations/002_nomba_webhooks.js
 */

import sqlite3 from 'sqlite3'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'nomba_webhooks.sqlite')

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open webhook DB:', err.message)
    process.exit(1)
  }
})

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err)
      resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

async function migrate() {
  console.log('Running migration 002_nomba_webhooks...')
  console.log(`DB: ${DB_PATH}`)

  await run('PRAGMA journal_mode = WAL')

  await run(`
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
  console.log('  ✔ nomba_webhooks table')

  await run(
    'CREATE INDEX IF NOT EXISTS idx_nomba_webhooks_event_type ON nomba_webhooks(event_type)',
  )
  await run(
    'CREATE INDEX IF NOT EXISTS idx_nomba_webhooks_received_at ON nomba_webhooks(received_at)',
  )
  await run(
    'CREATE INDEX IF NOT EXISTS idx_nomba_webhooks_transaction_id ON nomba_webhooks(transaction_id)',
  )
  console.log('  ✔ indexes')

  await run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  await run(
    'INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)',
    ['002_nomba_webhooks'],
  )
  console.log('  ✔ schema_migrations row inserted')

  console.log('Migration 002_nomba_webhooks complete.')
}

migrate()
  .then(() => db.close())
  .catch((err) => {
    console.error('Migration failed:', err)
    db.close()
    process.exit(1)
  })