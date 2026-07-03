# ChatOut

**Talk. Shop. Pay. Seamlessly.**

ChatOut is a privacy-first conversational checkout system. Instead of clicking through a traditional cart and payment form, users chat with an assistant that helps them discover products, manage their cart, and complete purchases. The checkout can be embedded into an existing shop via an iframe, or deployed as a standalone storefront reachable through a single link.

The project was built for the [DevCareer x Nomba Hackathon 2026](https://developer.nomba.com). A live demo is running at **[chatout.com](https://chatout.com)**.

> The full source code will be published here after the hackathon judging period ends. The hackathon submission deadline is July 8, 2026. Judging and Demo Day follow around July 18. We are keeping the codebase private until the evaluation process is complete.

---

## The problem

Online checkout has not changed much in twenty years. You fill out the same fields, click the same buttons, and hope nothing goes wrong. For merchants in emerging markets, the friction is worse: limited payment options, slow mobile connections, and customers who are not comfortable navigating multi-step forms.

At the same time, conversational AI is moving into every part of software. But dropping a large language model into a checkout flow means sending it names, phone numbers, email addresses, purchase histories, and payment details. That is a privacy risk most platforms cannot afford.

## What ChatOut does

ChatOut places a privacy layer between the user and the AI model. Before any message reaches the language model, personally identifiable information (PII) like emails, phone numbers, and addresses is detected and replaced with placeholder tokens. The anonymized message goes to the AI. The AI's response comes back, and the placeholders are swapped with the original values. The user sees a natural reply. The model never sees real personal data.

This de-anonymization pipeline is the core of the system. It means merchants can offer an AI shopping assistant without exposing their customers' data to a third-party model. The approach is lightweight: a regex-based scanner and an in-memory mapping store, with the option to persist mappings to SQLite for longer sessions.

On top of this privacy foundation, ChatOut provides:

- **JSON-driven integration.** A host app sends shop details and a product catalog as a JSON payload. ChatOut operates on that data independently. No shared database, no tight coupling.
- **A product grid with search, filters, and categories.** Users can browse the catalog directly, not just through chat.
- **A real-time cart** that persists across page reloads and stays in sync with the chat assistant.
- **A pluggable AI gateway.** The frontend talks to a single `/api/chat` endpoint. Swap the model on the backend without touching the UI. The demo ships with a keyword-based response engine that works offline; connecting a real LLM is a matter of setting two environment variables.
- **Dark and light themes.** The dark theme is the default. The layout caps at 1200 pixels wide, designed for clean iframe embedding.

## Architecture

The system is a standard Vue 3 frontend with a Node.js backend, built to run independently of any host platform.

```
Host App  →  JSON payload (shop + products)
                ↓
ChatOut Frontend (Vue 3 + Pinia)  ←→  ChatOut Backend (Express + SQLite)
                ↓                              ↓
         Product Grid + Chat UI        /api/chat  →  AI Gateway (pluggable)
                                       Anonymization layer (PII protection)
                                       Nomba Payment API (phase 2)
```

The frontend uses hash-based routing, so it works inside iframes without the host app needing to configure URL rewrites. The backend serves the built frontend as static files and exposes a handful of API endpoints.

## Current status (Phase 1)

The hackathon submission covers the full checkout interface and the AI conversation layer. What is implemented:

- 50-product demo catalog with real African fashion images
- Product grid with category tabs, search, sort, and pagination
- Product detail modal with image lightbox
- Slide-out cart drawer with quantity controls
- ChatGPT-style floating chat window with suggested prompts
- Intelligent keyword-based chat responses (offline demo mode)
- PII anonymization pipeline (email, phone, card, address detection)
- Pluggable AI gateway contract (`POST /api/chat`)
- Dark/light theme toggle with localStorage persistence
- Namecheap production deployment pipeline

What is planned for Phase 2:

- **Nomba Checkout integration** — the payment gateway (virtual accounts, webhooks, and transaction processing via Nomba's API) has not been integrated during Phase 1. This is the next priority. Once connected, payments will flow directly to the merchant's Nomba virtual account with automatic reconciliation.
- Live AI model connection (DeepSeek or equivalent)
- Multi-currency conversion
- Receipt generation

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3.5 (Composition API), Vite 8, Pinia 3, Vue Router 5 |
| Styling | Vanilla CSS with design tokens (glass-morphism theme) |
| Backend | Node.js, Express 5, SQLite 3 |
| AI gateway | Pluggable — demo mode uses keyword matching; swap to any LLM via env vars |
| Privacy | Custom PII anonymizer/de-anonymizer (regex-based, Map-backed) |
| Deployment | Python deploy script + Bash staging/promote/rollback for Namecheap cPanel |

## Author

**Emmanuel Oben** — [obenitsolutions.com](https://obenitsolutions.com)

Built as part of the ChatOut project for the Nomba Hackathon 2026. The system will be integrated into the [Sales Ledger](https://github.com/obenitsolutions) platform as its native conversational checkout, while remaining publicly available for any developer to embed into their own application.

## License

MIT. See `LICENSE` for details. The full license file will be included when the complete source code is published after the hackathon judging period.

---

*Talk. Shop. Pay. Seamlessly.*
