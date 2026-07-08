# ChatOut

**Talk. Shop. Pay. Seamlessly.**

ChatOut is a privacy-first conversational checkout system. Instead of clicking through a traditional cart and payment form, users chat with an assistant that helps them discover products, manage their cart, and complete purchases. The checkout can be embedded into an existing shop via an iframe, or deployed as a standalone storefront reachable through a single link.

The project was built for the [DevCareer x Nomba Hackathon 2026](https://developer.nomba.com). A live demo is running at **[chatout.obenitsolutions.com](https://chatout.obenitsolutions.com)**.

Payments are powered by [Nomba](https://developer.nomba.com). A merchant onboards a bank account, ChatOut verifies it and provisions a Nomba virtual account, and customers pay through Nomba hosted checkout. See **[docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md)** for the full integration walkthrough.

---

## The problem

Online checkout has not changed much in twenty years. You fill out the same fields, click the same buttons, and hope nothing goes wrong. For merchants in emerging markets, the friction is worse: limited payment options, slow mobile connections, and customers who are not comfortable navigating multi-step forms.

At the same time, conversational AI is moving into every part of software. But dropping a large language model into a checkout flow means sending it names, phone numbers, email addresses, purchase histories, and payment details. That is a privacy risk most platforms cannot afford.

## What ChatOut does

ChatOut places a privacy layer between the user and the AI model. Before any message reaches the language model, personally identifiable information (PII) like emails, phone numbers, and addresses is detected and replaced with placeholder tokens. The anonymized message goes to the AI. The AI's response comes back, and the placeholders are swapped with the original values. The user sees a natural reply. The model never sees real personal data.

This de-anonymization pipeline is the core of the system. It means merchants can offer an AI shopping assistant without exposing their customers' data to a third-party model. The approach is lightweight: a regex-based scanner and an in-memory mapping store, with the option to persist mappings to SQLite for longer sessions.

On top of this privacy foundation, ChatOut provides:

- **JSON-driven integration.** A host app exposes its catalog through one endpoint (the ChatOut Catalog Protocol). ChatOut fetches shop details and products and operates on that data independently. No shared database, no tight coupling.
- **A product grid with search, filters, and categories.** Users can browse the catalog directly, not just through chat.
- **A real-time cart** that persists across page reloads and stays in sync with the chat assistant.
- **A pluggable AI gateway.** The frontend talks to a single `/api/chat` endpoint. Swap the model on the backend without touching the UI. The demo ships with a keyword-based response engine that works offline; connecting a real LLM is a matter of setting two environment variables.
- **Nomba payments, end to end.** Merchants onboard a bank account (verified by a read-only Flutterwave account-name lookup), ChatOut provisions a Nomba virtual account, and customers pay through Nomba hosted checkout. Orders are reconciled automatically from Nomba webhooks. Payment routing is resolved server-side from a slug, so a customer can never redirect funds by editing the URL.
- **Dark and light themes.** The dark theme is the default. The layout caps at 1200 pixels wide, designed for clean iframe embedding.

## Architecture

The system is a standard Vue 3 frontend with a Node.js backend, built to run independently of any host platform.

```
Host App  ──(1) Catalog Protocol JSON──►  ChatOut Backend (Express + SQLite)
                                               │
Customer ─► ChatOut Frontend (Vue 3 + Pinia) ──┤  /api/chat      → AI Gateway (pluggable)
              #/s/<merchant-slug>              │  /api/storefront → dynamic catalog fetch
                     │                         │  /api/checkout   → Nomba hosted checkout
                     ▼                         │  /api/merchants  → KYC + virtual account
              Product Grid + Chat UI           │  /api/webhook/nomba → payment reconciliation
                                               │  Anonymization layer (PII protection)
                                               ▼
                                        Nomba API  +  Flutterwave (KYC only)
```

The frontend uses hash-based routing, so it works inside iframes without the host app needing to configure URL rewrites. The backend serves the built frontend as static files and exposes the API endpoints listed in the integration guide.

## Current status

Implemented:

- 50-product demo catalog with real African fashion images
- Product grid with category tabs, search, sort, and pagination
- Product detail modal with image lightbox
- Slide-out cart drawer with quantity controls
- ChatGPT-style floating chat window with suggested prompts
- Intelligent keyword-based chat responses (offline demo mode)
- PII anonymization pipeline (email, phone, card, address detection)
- Pluggable AI gateway contract (`POST /api/chat`)
- **Nomba integration** — OAuth token flow, virtual account provisioning, hosted checkout order creation, and webhook-based order reconciliation
- **Merchant onboarding with KYC** — read-only Flutterwave bank-account name resolution with tolerant name matching
- **Dynamic multi-merchant storefronts** — `#/s/<slug>` loads any host merchant's catalog through the Catalog Protocol
- Dark/light theme toggle with localStorage persistence

Planned next:

- Live AI model connection (DeepSeek or equivalent) in the default deployment
- Multi-currency conversion
- Receipt generation
- Split payments to per-merchant sub-accounts (production settlement)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3.5 (Composition API), Vite 8, Pinia 3, Vue Router 5 |
| Styling | Vanilla CSS with design tokens (glass-morphism theme) |
| Backend | Node.js, Express 5, SQLite 3 |
| Payments | Nomba API (OAuth, virtual accounts, hosted checkout, webhooks) |
| KYC | Flutterwave account-name resolution (read-only) |
| AI gateway | Pluggable — demo mode uses keyword matching; swap to any LLM via env vars |
| Privacy | Custom PII anonymizer/de-anonymizer (regex-based, Map-backed) |
| Deployment | Node process behind any reverse proxy (Passenger, Nginx, PM2, etc.) |

## Author

**Emmanuel Oben** — [obenitsolutions.com](https://obenitsolutions.com)

Built as part of the ChatOut project for the Nomba Hackathon 2026. The system will be integrated into the [Sales Ledger](https://www.salesledger.app) platform as its native conversational checkout, while remaining publicly available for any developer to embed into their own application.

## License

MIT. See `LICENSE` for details. The full license file will be included when the complete source code is published after the hackathon judging period.

---

*Talk. Shop. Pay. Seamlessly.*
