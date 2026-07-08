/*
 * Demo merchant seeder — upserts a demo merchant so checkout with
 * slug 'demo' works against Nomba test keys. Idempotent: safe to run
 * repeatedly (upsertMerchant is keyed on slug; the catalog_url UPDATE
 * is a no-op when already set).
 *
 * upsertMerchant() does NOT persist catalog_url, so after the upsert we
 * issue a direct UPDATE to point slug 'demo' at the bundled demo catalog
 * provider (DEMO_CATALOG_URL). checkout.routes.js reads merchant.catalog_url
 * and passes it to getCatalog() as the per-merchant override.
 */

import { upsertMerchant } from './merchants.js'
import { run } from './client.js'
import { logger } from '../logging/logger.js'

export async function seedDemoMerchant() {
  await upsertMerchant({
    slug: 'demo',
    businessId: 'demo',
    provider: 'demo',
    businessName: 'African Heritage Fashion (Demo)',
    accountRef: 'chatout-demo-acct-0001',
    virtualAccountNumber: null,
    virtualBankName: null,
    subAccountId: process.env.NOMBA_SUB_ACCOUNT_ID || null,
    verifiedName: 'ChatOut Demo',
    bankCode: null,
    bankAccountNumber: null,
    currency: 'NGN',
  })

  const catalogUrl =
    process.env.DEMO_CATALOG_URL || 'http://localhost:3021/api/demo/catalog'
  await run('UPDATE merchant_accounts SET catalog_url = ? WHERE slug = ?', [
    catalogUrl,
    'demo',
  ])

  logger.info('[seed] demo merchant ready', { slug: 'demo', catalogUrl })
}
