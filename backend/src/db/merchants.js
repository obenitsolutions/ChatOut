/*
 * Merchant registry DB helper — persistence for merchant_accounts.
 * Backs the host-app -> ChatOut merchant onboarding flow.
 */

import { run, get } from './client.js'

/**
 * Insert or update a merchant account (keyed by slug).
 * @param {Object} m
 * @returns {Promise<Object|null>} the stored row
 */
export async function upsertMerchant(m) {
  await run(
    `
    INSERT INTO merchant_accounts (
      slug,
      business_id,
      provider,
      business_name,
      account_ref,
      virtual_account_number,
      virtual_bank_name,
      sub_account_id,
      verified_name,
      bank_code,
      bank_account_number,
      currency
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      business_id = excluded.business_id,
      provider = excluded.provider,
      business_name = excluded.business_name,
      account_ref = excluded.account_ref,
      virtual_account_number = excluded.virtual_account_number,
      virtual_bank_name = excluded.virtual_bank_name,
      sub_account_id = excluded.sub_account_id,
      verified_name = excluded.verified_name,
      bank_code = excluded.bank_code,
      bank_account_number = excluded.bank_account_number,
      currency = excluded.currency,
      updated_at = datetime('now')
    `,
    [
      m.slug,
      m.businessId,
      m.provider || 'host',
      m.businessName ?? null,
      m.accountRef,
      m.virtualAccountNumber ?? null,
      m.virtualBankName ?? null,
      m.subAccountId ?? null,
      m.verifiedName ?? null,
      m.bankCode ?? null,
      m.bankAccountNumber ?? null,
      m.currency || 'NGN',
    ]
  )

  return getMerchantBySlug(m.slug)
}

/**
 * Look up a merchant by slug.
 * @param {string} slug
 * @returns {Promise<Object|null>}
 */
export async function getMerchantBySlug(slug) {
  return get('SELECT * FROM merchant_accounts WHERE slug = ?', [slug])
}

/**
 * Look up a merchant by account reference.
 * @param {string} accountRef
 * @returns {Promise<Object|null>}
 */
export async function getMerchantByAccountRef(accountRef) {
  return get('SELECT * FROM merchant_accounts WHERE account_ref = ?', [accountRef])
}
