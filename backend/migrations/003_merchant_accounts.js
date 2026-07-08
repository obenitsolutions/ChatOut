/*
 * Merchant accounts migration.
 * Creates the registry of host-app merchant virtual accounts.
 */

import { run } from '../src/db/client.js'

async function migrate() {
  console.log('Running migration 003_merchant_accounts...')

  await run(`
    CREATE TABLE IF NOT EXISTS merchant_accounts (
      slug TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'host',
      business_name TEXT,
      account_ref TEXT NOT NULL,
      virtual_account_number TEXT,
      virtual_bank_name TEXT,
      sub_account_id TEXT,
      verified_name TEXT,
      bank_code TEXT,
      bank_account_number TEXT,
      currency TEXT NOT NULL DEFAULT 'NGN',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_merchant_accounts_business
    ON merchant_accounts(business_id)
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_merchant_accounts_ref
    ON merchant_accounts(account_ref)
  `)

  console.log('Migration 003_merchant_accounts complete.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
