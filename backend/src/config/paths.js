/*
 * Central configuration — paths, ports, environment.
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* Load .env if present */
dotenv.config({ path: join(dirname(dirname(__dirname)), '.env') })

export const ROOT_DIR = dirname(dirname(__dirname))

/*
 * Two candidate paths for serving the frontend (primalmedivice pattern):
 *   PUBLIC_DIR    → backend/public/ (production flat structure)
 *   FRONTEND_DIST → frontend/dist/   (dev build output)
 * The first one containing index.html wins at startup.
 */
export const PUBLIC_DIR = join(ROOT_DIR, 'public')
export const FRONTEND_DIST = join(ROOT_DIR, '..', 'frontend', 'dist')

export const PORT = parseInt(process.env.PORT || '3021', 10)
export const NODE_ENV = process.env.NODE_ENV || 'development'
export const DATA_DIR = join(ROOT_DIR, 'data')
export const LOGS_DIR = join(ROOT_DIR, 'logs')
export const DB_PATH = join(DATA_DIR, 'chatout.db')

/* AI Gateway config — PRIVATE. Set these env vars for your AI model. */
export const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || null
export const AI_API_KEY = process.env.AI_API_KEY || null

/* Nomba payment-gateway config.
 * NOTE: NOMBA_PRIVATE_KEY is the OAuth client_secret (client_credentials flow),
 * NOT a raw signing key. The Nomba service reads it as the client secret. */
export const NOMBA_CLIENT_ID = process.env.NOMBA_CLIENT_ID || null
export const NOMBA_PRIVATE_KEY = process.env.NOMBA_PRIVATE_KEY || null
export const NOMBA_CLIENT_SECRET = process.env.NOMBA_CLIENT_SECRET || process.env.NOMBA_PRIVATE_KEY || null
export const NOMBA_ACCOUNT_ID = process.env.NOMBA_ACCOUNT_ID || null
export const NOMBA_SUB_ACCOUNT_ID = process.env.NOMBA_SUB_ACCOUNT_ID || null
export const NOMBA_WEBHOOK_SECRET = process.env.NOMBA_WEBHOOK_SECRET || null
export const NOMBA_BASE_URL = process.env.NOMBA_BASE_URL || 'https://sandbox.nomba.com'

/* Flutterwave KYC config (account-name resolution; read-only, live key ok). */
export const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || null
export const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY || null
export const FLW_BASE_URL = process.env.FLW_BASE_URL || 'https://api.flutterwave.com'

/* Partner (server-to-server) auth for host app -> ChatOut. */
export const PARTNER_API_KEY = process.env.PARTNER_API_KEY || null

/* Merchant registry labels — genericised so the public code is host-agnostic.
 * The reference deployment sets these in .env; defaults are generic. */
export const MERCHANT_PROVIDER = process.env.MERCHANT_PROVIDER || 'host'
export const MERCHANT_REF_PREFIX = process.env.MERCHANT_REF_PREFIX || 'merchant'

/* Where ChatOut pulls dynamic catalog from (host protocol endpoint). */
export const CATALOG_PROVIDER_URL = process.env.CATALOG_PROVIDER_URL || null

/* Public base URL used to build chatoutUrl + Nomba callbackUrl. */
export const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://chatout.obenitsolutions.com'
