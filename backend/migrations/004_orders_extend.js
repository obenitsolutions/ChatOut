/*
 * Migration 004 — extend orders table for storefront checkout + Nomba reconciliation.
 *
 * SQLite lacks `ADD COLUMN IF NOT EXISTS`, so each ALTER is wrapped in its own
 * try/catch that ignores "duplicate column name" errors. This makes the
 * migration idempotent and safe to re-run.
 */

import { run } from '../src/db/client.js'

async function addColumn(sql) {
  try {
    await run(sql)
  } catch (err) {
    if (/duplicate column name/i.test(err.message)) return
    throw err
  }
}

async function migrate() {
  console.log('Running migration 004_orders_extend...')

  await addColumn(`ALTER TABLE orders ADD COLUMN slug TEXT`)
  await addColumn(`ALTER TABLE orders ADD COLUMN nomba_order_reference TEXT`)
  await addColumn(`ALTER TABLE orders ADD COLUMN checkout_link TEXT`)
  await addColumn(`ALTER TABLE orders ADD COLUMN paid_at TEXT`)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_orders_nomba_ref
    ON orders(nomba_order_reference)
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_orders_slug
    ON orders(slug)
  `)

  console.log('Migration 004_orders_extend complete.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
