/*
 * Migration 005 — add catalog_url to merchant_accounts.
 *
 * Per-merchant catalog override. When set, checkout.routes.js fetches that
 * merchant's catalog from this URL instead of the global CATALOG_PROVIDER_URL.
 * This keeps ChatOut host-agnostic: the demo merchant points at ChatOut's own
 * /api/demo/catalog endpoint, while real merchants leave it null and use the
 * configured global provider.
 *
 * SQLite has no "ADD COLUMN IF NOT EXISTS", so the ALTER is wrapped in a
 * try/catch that ignores the "duplicate column name" error (idempotent).
 */

import { run } from '../src/db/client.js'

async function migrate() {
  console.log('Running migration 005_merchant_catalog_url...')

  try {
    await run('ALTER TABLE merchant_accounts ADD COLUMN catalog_url TEXT')
    console.log('  + added merchant_accounts.catalog_url')
  } catch (err) {
    if (/duplicate column name/i.test(err.message)) {
      console.log('  = merchant_accounts.catalog_url already exists, skipping')
    } else {
      throw err
    }
  }

  console.log('Migration 005_merchant_catalog_url complete.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
