/*
 * Initial database migration.
 * Creates tables for session tracking and anonymization mappings.
 */

import { run } from '../src/db/client.js'

async function migrate() {
  console.log('Running migration 001_initial...')

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active TEXT NOT NULL DEFAULT (datetime('now')),
      shop_id TEXT,
      metadata TEXT /* JSON */
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS anonymization_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      token TEXT NOT NULL,
      original_value TEXT NOT NULL,
      pii_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_mappings_session
    ON anonymization_mappings(session_id)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      items TEXT NOT NULL, /* JSON array */
      total_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'NGN',
      customer TEXT, /* JSON — anonymized */
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  console.log('Migration 001_initial complete.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
