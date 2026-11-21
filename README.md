# Exami-Fy Prototype

Responsive founder-review prototype for the Exami-Fy examination marketplace and learning platform. Built with React, Vite and TypeScript.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The current development setup normally uses `http://localhost:5174/`.

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
- In the marketplace, open the Jane Mwangi account control for sign-in and registration. Profile avatar in a workspace opens the sign-out confirmation. Forgot-password and registration paths include simulated email/SMS OTP; use demo code `123456`.

The project uses browser local storage for prototype state. The teacher PDF picker only records a filename; downloadable PDFs are generated samples. All academic data and identities are illustrative. No real payments, accounts, file processing, email, SMS, WhatsApp or push notifications are connected.

See [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md) for milestone coverage, verification notes and limitations, [docs/PRODUCT_FLOW_AUDIT.md](docs/PRODUCT_FLOW_AUDIT.md) for the screen inventory and gaps, and [docs/EXAMIFY_COMPLETE_PRODUCT_PROMPT.md](docs/EXAMIFY_COMPLETE_PRODUCT_PROMPT.md) for the updated implementation brief. The prototype is responsive web groundwork; an installable PWA and Flutter client are follow-on implementation stages.
