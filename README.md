# Exami-Fy Prototype

Responsive founder-review prototype for the Exami-Fy examination marketplace and learning platform. Built with React, Vite and TypeScript.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The current development setup normally uses `http://localhost:5174/`.

## Start the authentication API

Use Node.js 22.13 or later and a running PostgreSQL server. In a second terminal:

```sh
Copy-Item .env.example .env
npm run dev:api
```

The API stores accounts and sessions in PostgreSQL and applies its schema migrations on startup. Set `DATABASE_URL` in `.env`; local OTP defaults to the API terminal. Configure Resend and MobileSasa for email and SMS delivery using [docs/LIVE_INTEGRATIONS.md](docs/LIVE_INTEGRATIONS.md). Optionally set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env` before the first start to enable administrator-issued role invitations. See [docs/AUTH_BACKEND.md](docs/AUTH_BACKEND.md) for API routes, role model and remaining production gaps.

## Build

```sh
npm run build
```

## Explore the prototype

- The landing screen presents the design system and product component previews.
- Select **Marketplace** in the left navigation to browse sample papers, filters, pricing, help pages, cart and simulated M-PESA checkout.
- Select **Learner workspace** to open the learner portal. Use the **Demo as** picker to preview Parent, Teacher, School admin, Platform admin and Examiner workspaces.
- In learner **Practice** or **My examinations**, open the question room to try sample question types, autosave, flagging, timer, submission and results.
- In the Teacher workspace, open **Marketplace submissions** to draft a listing, set curriculum/grade/subject/price, attach or choose a demo PDF filename, confirm publishing rights, and submit it for review. Switch to **Platform admin → Review queue** to approve or request changes. Approved submissions appear in the public catalogue; classroom assessments stay private to assigned classes.
- Teacher **Marking** demonstrates a submission queue, auto-marking objective responses, rubric-based written marking, saved drafts and publishing results. Teacher **Wallet & earnings** records marketplace purchases, pending settlement, an illustrative 80/20 split and withdrawal requests. Platform admins can settle proceeds and approve, reject or record payouts as paid.
- **Inbox** is available to all demo roles for in-app messages. Platform admins can review all sample threads and payout requests. Replies and approval states persist locally.
- Marketplace checkout adds teacher-vendor sales to pending settlements. **Download sample PDF** generates and downloads an illustrative one-page PDF; it does not contain the original source paper.
- In the marketplace, open the account control for sign-in and registration. The login, registration, email/SMS OTP verification, password reset and logout flows use the local API when it is running. Preview workspace access remains available without signing in.

Marketplace, learning and school operations still use some browser-local prototype data. Authentication accounts persist in PostgreSQL. Marketplace print masters are private PDF/ZIP files stored under `MARKETPLACE_FILES_DIR` (Docker default `/data/marketplace-files`); mount a persistent volume at that path before production use. Paid orders snapshot the print master for admin printing; customers do not receive downloads. Set `WHATSAPP_ORDER_WEBHOOK_URL` and `WHATSAPP_ORDER_WEBHOOK_TOKEN` to connect an opted-in order update to your WhatsApp service. Series completeness uses the active grade subject catalogue and requires it to be configured.

See [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md) for milestone coverage, verification notes and limitations, [docs/PRODUCT_FLOW_AUDIT.md](docs/PRODUCT_FLOW_AUDIT.md) for the screen inventory and gaps, [docs/DEPLOYMENT_PLAN.md](docs/DEPLOYMENT_PLAN.md) for live hosting and GitHub CI, and [docs/EXAMIFY_COMPLETE_PRODUCT_PROMPT.md](docs/EXAMIFY_COMPLETE_PRODUCT_PROMPT.md) for the updated implementation brief. The prototype is responsive web groundwork; an installable PWA and Flutter client are follow-on implementation stages.
