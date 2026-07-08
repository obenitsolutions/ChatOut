/*
 * Orders DB helper — thin CRUD layer over the orders table.
 * items/customer are stored as JSON strings and parsed back on read.
 */

import { run, get } from './client.js'

/**
 * Insert a new order (status 'pending').
 * @returns {Promise<{ lastID: number, changes: number }>}
 */
export async function createOrder({
  id,
  reference,
  slug,
  sessionId,
  items,
  totalMinor,
  currency,
  customer,
  nombaOrderReference,
  checkoutLink,
}) {
  return run(
    `INSERT INTO orders (
      id, reference, slug, session_id, status, items, total_minor,
      currency, customer, nomba_order_reference, checkout_link
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    [
      id,
      reference,
      slug ?? null,
      sessionId ?? null,
      JSON.stringify(items ?? []),
      totalMinor ?? 0,
      currency ?? 'NGN',
      JSON.stringify(customer ?? null),
      nombaOrderReference ?? null,
      checkoutLink ?? null,
    ],
  )
}

function parseOrder(row) {
  if (!row) return null
  let items = []
  let customer = null
  try {
    items = row.items ? JSON.parse(row.items) : []
  } catch {
    items = []
  }
  try {
    customer = row.customer ? JSON.parse(row.customer) : null
  } catch {
    customer = null
  }
  return { ...row, items, customer }
}

/**
 * Fetch an order by its reference. Parses items/customer JSON.
 * @returns {Promise<Object|null>}
 */
export async function getOrderByReference(reference) {
  const row = await get(`SELECT * FROM orders WHERE reference = ?`, [reference])
  return parseOrder(row)
}

/**
 * Fetch an order by its Nomba order reference. Parses items/customer JSON.
 * @returns {Promise<Object|null>}
 */
export async function getOrderByNombaRef(nombaOrderReference) {
  const row = await get(
    `SELECT * FROM orders WHERE nomba_order_reference = ?`,
    [nombaOrderReference],
  )
  return parseOrder(row)
}

/**
 * Mark an order paid by whichever identifier is provided.
 * @returns {Promise<number>} number of rows changed
 */
export async function markOrderPaid({
  reference = null,
  nombaOrderReference = null,
} = {}) {
  let column
  let value
  if (reference !== null) {
    column = 'reference'
    value = reference
  } else if (nombaOrderReference !== null) {
    column = 'nomba_order_reference'
    value = nombaOrderReference
  } else {
    return 0
  }

  const result = await run(
    `UPDATE orders
        SET status = 'paid',
            paid_at = datetime('now'),
            updated_at = datetime('now')
      WHERE ${column} = ?`,
    [value],
  )
  return result.changes
}
