# ChatOut Integration Guide

This guide explains how to run ChatOut and how to plug your own storefront and
payment credentials into it. ChatOut is designed to be dropped into any project:
you supply your product catalog through one endpoint and your own API keys
through environment variables, and ChatOut handles the conversational checkout.

Nothing in this repository contains live credentials. Every secret is read from
environment variables at runtime and is kept out of version control by
`.gitignore`.

---

## 1. What ChatOut is

ChatOut is a self-contained conversational checkout. It has:

- a Vue 3 frontend (product grid + AI chat + cart + checkout),
- a Node.js/Express backend (AI gateway, PII anonymization, Nomba payments,
  merchant onboarding, dynamic catalog fetching),
- a small SQLite database for merchants, orders, sessions, and interaction logs.

You integrate it by doing two things:

1. Expose your catalog through the **ChatOut Catalog Protocol** (section 5).
2. Register each merchant once so ChatOut knows where their money goes
   (section 6).

Then you share a link like `https://<your-chatout-host>/#/s/<merchant-slug>`
and customers can shop and pay.

---

## 2. Requirements

- Node.js >= 20
- npm >= 10
- A Nomba account (for payments) — https://dashboard.nomba.com
- A Flutterwave account (for read-only bank-account verification) —
  https://dashboard.flutterwave.com

The private AI implementation is **not** included in this repository (it is
gitignored as `ai-agent/`). ChatOut runs without it using a built-in
keyword-based demo responder, and you can connect any LLM through the pluggable
gateway (section 8).

---

## 3. Install and run (development)

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # then fill in your values (section 4)
npm run migrate               # creates the base SQLite tables
node migrations/003_merchant_accounts.js
node migrations/004_orders_extend.js
npm run dev                   # backend on http://localhost:3021

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # frontend on http://localhost:5180
```

The frontend dev server proxies `/api/*` to the backend on port 3021, so open
`http://localhost:5180` and everything works together.

For production, build the frontend (`npm run build` in `frontend/`) and serve it
with the backend (`npm start` in `backend/`). The backend serves the built
frontend as static files and falls back to `index.html` for SPA routes.

---

## 4. Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in the values. The
example file is committed with blank values; your real `.env` is gitignored.

| Variable | Purpose |
|---|---|
| `PORT` | Backend port (default 3021). |
| `NODE_ENV` | `development` or `production`. |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL` | Optional AI model. Leave blank to use the offline demo responder. |
| `AI_GATEWAY_URL` / `AI_API_KEY` | Optional external AI agent (see section 8). |
| `ADMIN_API_KEY` | Bearer token for `/api/admin/*`. Endpoints return 503 if unset. |
| `NOMBA_CLIENT_ID` | Nomba OAuth client id. |
| `NOMBA_PRIVATE_KEY` / `NOMBA_CLIENT_SECRET` | Nomba OAuth client secret. `NOMBA_PRIVATE_KEY` is the client secret; there is no raw-key signing. |
| `NOMBA_ACCOUNT_ID` | Your parent Nomba account id (sent as the `accountId` header). |
| `NOMBA_SUB_ACCOUNT_ID` | Sub-account to credit for hosted checkout (optional). |
| `NOMBA_WEBHOOK_SECRET` | Signing key configured in your Nomba dashboard webhook setup. |
| `NOMBA_BASE_URL` | `https://sandbox.nomba.com` (test) or `https://api.nomba.com` (live). |
| `FLW_SECRET_KEY` / `FLW_PUBLIC_KEY` | Flutterwave keys for account-name resolution. Resolution is read-only; no money moves. |
| `FLW_BASE_URL` | `https://api.flutterwave.com`. |
| `PARTNER_API_KEY` | Shared secret your backend uses to call `POST /api/merchants/register`. |
| `CATALOG_PROVIDER_URL` | Your catalog endpoint (section 5). ChatOut calls `${CATALOG_PROVIDER_URL}?slug=<slug>`. |
| `APP_PUBLIC_URL` | Public base URL used to build customer links and Nomba callback URLs. |

Notes:
- Sandbox credentials only work against `https://sandbox.nomba.com`, and live
  credentials only against `https://api.nomba.com`. Do not mix them.
- For a no-real-money demo, use sandbox keys with `NOMBA_BASE_URL` pointed at
  sandbox in every environment.

---

## 5. The ChatOut Catalog Protocol

ChatOut does not store your products. It fetches them on demand from an endpoint
you host. Set `CATALOG_PROVIDER_URL` to that endpoint. ChatOut requests:

```
GET ${CATALOG_PROVIDER_URL}?slug=<merchant-slug>
```

Your endpoint must return JSON in this exact shape:

```json
{
  "shop": {
    "shopId": "42",
    "slug": "demo-merchant",
    "businessName": "Demo Merchant",
    "description": "Short shop description",
    "currency": "NGN",
    "logoUrl": "https://your-host/logo.png",
    "contactEmail": "hello@example.com",
    "socials": { "instagram": "@demo", "whatsapp": "234..." }
  },
  "products": [
    {
      "id": "1001",
      "name": "Ankara Jumpsuit Green",
      "price": 18500.0,
      "originalPrice": 25000.0,
      "isOnPromotion": true,
      "promotionEndsAt": "2026-07-20T00:00:00Z",
      "stockQuantity": 45,
      "isOutOfStock": false,
      "image": "https://your-host/images/p1.jpg",
      "images": ["https://your-host/images/p1.jpg"],
      "category": "Clothing",
      "description": "Product description",
      "currency": "NGN",
      "coreProperties": { "color": "Green", "size": "M", "material": "Ankara" }
    }
  ]
}
```

Rules:
- `price` is the current sell price. When an item is on promotion, `price` is
  the discounted price and `originalPrice` is the pre-promotion price.
- `image` is the primary image; `images` is the full gallery.
- Do not include any payment routing data here. This payload is public.
- ChatOut caches each slug's catalog briefly (about 60 seconds).

That is the only endpoint you must build to display a storefront. Payments need
one more step (section 6).

---

## 6. Merchant onboarding (KYC + payment routing)

Before a merchant can take payments, register them once. This is a
server-to-server call from your backend, authenticated with `PARTNER_API_KEY`.
Never call it from the browser.

```
POST /api/merchants/register
Authorization: Bearer <PARTNER_API_KEY>
Content-Type: application/json

{
  "businessId": "42",
  "slug": "demo-merchant",
  "businessName": "Demo Merchant",
  "ownerName": "Jane Doe",
  "accountNumber": "0123456789",
  "bankCode": "058",
  "currency": "NGN"
}
```

What ChatOut does:
1. Resolves the bank account name via Flutterwave (read-only).
2. Matches the resolved name against `businessName`/`ownerName` using a tolerant
   comparison (token-subset or two-token overlap), so a bank appending a middle
   name still passes.
3. Provisions a Nomba virtual account for the merchant.
4. Stores the merchant's routing in ChatOut's own database, keyed by `slug`.

Success response:
```json
{
  "ok": true,
  "verified": true,
  "verifiedName": "JANE DOE",
  "accountRef": "yourapp-42-acct",
  "virtualAccountNumber": "5544072658",
  "bankName": "Nombank MFB",
  "chatoutUrl": "https://<your-chatout-host>/#/s/demo-merchant"
}
```

If the name does not match, ChatOut returns `422` with
`{ "ok": false, "verified": false, "reason": "name_mismatch", "verifiedName": "..." }`.

You can fetch the list of supported banks (for a dropdown) from:
```
GET /api/banks   →   { "ok": true, "banks": [ { "code": "058", "name": "GTBank" }, ... ] }
```

Store the returned `chatoutUrl` and show it to the merchant. That is the link
they share with customers.

---

## 7. The customer flow

1. Customer opens `https://<your-chatout-host>/#/s/<merchant-slug>`.
2. ChatOut loads that merchant's catalog via `GET /api/storefront/:slug`
   (which internally calls your Catalog Protocol endpoint).
3. Customer browses or chats, adds items to the cart, and clicks **Proceed to Pay**.
4. The frontend calls `POST /api/checkout`:
   ```json
   { "slug": "demo-merchant", "items": [ { "id": "1001", "qty": 2 } ], "customerEmail": "buyer@example.com" }
   ```
   ChatOut re-prices every item server-side against the live catalog (client
   prices are never trusted), creates a Nomba hosted-checkout order that credits
   the merchant, persists a pending order, and returns:
   ```json
   { "ok": true, "reference": "CHATOUT-XXXX", "checkoutLink": "https://checkout.nomba.com/..." }
   ```
5. The browser is redirected to `checkoutLink` (top window, so card/3DS pages
   are not framed).
6. The customer pays. Nomba redirects back to
   `${APP_PUBLIC_URL}/#/confirmation/<reference>`.
7. Nomba also sends a signed `payment_success` webhook to
   `POST /api/webhook/nomba`. ChatOut verifies the signature and marks the order
   paid.
8. The confirmation page reads the real order via
   `GET /api/checkout/order/:reference` and clears the cart.

Security: the browser only ever supplies a `slug`. All routing (which Nomba
account gets credited) is resolved server-side from the merchant registry, so a
customer cannot redirect funds by editing the URL, and cannot change prices by
tampering with the cart.

---

## 8. Pluggable AI gateway

The frontend talks to a single endpoint:

```
POST /api/chat
{ "sessionId": "...", "message": "...", "context": { "shop": {...}, "products": [...], "messages": [...] } }
```

The backend anonymizes PII in the message, calls the AI, de-anonymizes the
reply, and returns `{ reply, actions, cart, ... }`. You can supply the AI three ways:

1. **Offline demo** (default): if no AI keys are set, a keyword responder
   answers common product/cart questions. Good for local testing.
2. **Hosted LLM**: set `DEEPSEEK_API_KEY` (and optionally `DEEPSEEK_MODEL`,
   `DEEPSEEK_BASE_URL`). The backend calls the model with native function/tool
   calling for cart actions.
3. **Your own agent**: set `AI_GATEWAY_URL` and `AI_API_KEY` to point at an
   external service that follows the same request/response contract. The private
   RAG agent used in the reference deployment lives outside this repo (the
   `ai-agent/` folder is intentionally gitignored) so the public codebase stays
   model-agnostic.

The PII anonymization layer runs regardless of which AI you use, so the model
never sees real emails, phone numbers, cards, or addresses.

---

## 9. API surface (summary)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Liveness probe. |
| `POST /api/chat` | none (rate-limited) | Conversational assistant. |
| `GET /api/shop` | none | Demo shop context. |
| `GET /api/cart/state` etc. | none | Cart tool/state API. |
| `GET /api/banks` | none | Supported bank list for onboarding UI. |
| `POST /api/merchants/register` | `PARTNER_API_KEY` | KYC + virtual account + registry. |
| `GET /api/storefront/:slug` | none | Merchant catalog (via Catalog Protocol). |
| `POST /api/checkout` | none | Create a Nomba hosted-checkout order. |
| `GET /api/checkout/order/:reference` | none | Read an order's status. |
| `POST /api/webhook/nomba` | HMAC signature | Payment reconciliation. |
| `GET /api/admin/*` | `ADMIN_API_KEY` | Interaction logs and stats. |

---

## 10. Webhooks

Register your webhook URL in the Nomba dashboard, pointing at
`https://<your-chatout-host>/api/webhook/nomba`, and set the same signing key as
`NOMBA_WEBHOOK_SECRET`. ChatOut verifies the HMAC-SHA256 signature over Nomba's
documented field ordering, stores events idempotently, and always responds `200`
quickly so Nomba does not retry unnecessarily. On `payment_success` it reconciles
the matching order to `paid`.

---

## 11. Database

SQLite files live in `backend/data/` (gitignored). Tables:

- `merchant_accounts` — slug → routing (account ref, virtual account, verified
  name). Created by `migrations/003_merchant_accounts.js`.
- `orders` — checkout orders and their status. Base table from
  `migrations/001_initial.js`, extended by `migrations/004_orders_extend.js`.
- `sessions`, `anonymization_mappings` — session/PII scaffolding.
- `interactions.sqlite` — AI interaction logs (admin browsable).
- `nomba_webhooks.sqlite` — raw webhook events.

Run all migrations in order after `npm install` (see section 3).

---

## 12. Deployment notes

- ChatOut is a plain Node process. Run it behind any reverse proxy (Passenger,
  Nginx, PM2, a container platform, etc.).
- Build the frontend and let the backend serve it, or serve the built frontend
  from your CDN and point it at the backend API.
- Keep `.env` off the server's public web root. The repository does not include
  any deploy scripts specific to a particular host; wire ChatOut into your own
  pipeline.
- For a real-money launch, switch `NOMBA_BASE_URL` to `https://api.nomba.com`
  and use live Nomba credentials, and consider split payments to per-merchant
  sub-accounts for settlement.
