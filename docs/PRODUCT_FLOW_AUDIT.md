# Exami-Fy prototype flow and screen audit

Audit date: 21 November 2026. Scope: current React/Vite browser prototype, including the teacher wallet, inbox, marking workflow and PDF sample downloads.

## Screen inventory

There are **67 role-specific workspace destinations** in the sidebar. Some roles share concepts, but each role has its own navigation destination:

| Role | Destinations |
|---|---:|
| Learner | 10 |
| Parent | 7 |
| Teacher | 13 |
| School admin | 13 |
| Platform admin | 18 |
| Examiner | 6 |
| **Total** | **67** |

The public marketplace exposes **10 screen states**: home, catalogue, product detail, checkout, payment waiting, purchase success, library, pricing, how it works, and help/support. Authentication exposes **6 states**: sign in, registration, forgot password, OTP, reset password, and completion. The assessment room and its submitted-result state add **2**. That is **85 named screen destinations/states** in this inventory (67 + 10 + 6 + 2). It is a count of navigation/screen states, not 85 independently implemented production pages: many workspace destinations still use a shared sample table or settings template, and navigation is in-memory rather than URL routes.

## Connected prototype journeys

Seven end-to-end journeys have meaningful local interactions:

1. Browse a paper → open details → add to cart → simulate M-PESA confirmation → purchase appears in learner library → download generated sample PDF.
2. Teacher drafts a marketplace listing and confirms rights → submits for review → platform admin approves or requests changes → approved item is visible in the marketplace with teacher attribution.
3. Teacher-vendor item is purchased → sale appears as pending settlement → admin settles proceeds → teacher requests a withdrawal → admin approves/rejects and can record the payout as paid.
4. Teacher opens a sample learner submission → objective questions auto-score → written answers receive manual rubric marks and feedback → teacher saves a draft or publishes the score.
5. Learner/parent/teacher/school/examiner can open an in-app thread → read and reply → admin can review sample conversations. Threads persist locally.
6. Learner completes a practice or timed exam simulation → receives calculated demo score and feedback.
7. User walks through sign-in/registration/password reset and email/SMS OTP screens using demo code `123456`; no identity or message is verified externally.

Other destinations (school operations, many admin tools, reporting pages, settings) are present and clickable but remain sample-data views. They should not be treated as complete operational workflows.

## Implemented components relevant to this request

- Teacher wallet with demo sales ledger, pending and settled balances, illustrative 80/20 teacher share, Kenyan M-PESA/bank withdrawal details and request history.
- Admin sales settlement, withdrawal approve/reject, notes and “mark paid” controls. Inbox admin view also includes the payout queue.
- Shared local in-app inbox with unread state, filters, conversation replies, resolve/reopen and new support conversation.
- Marking queue with auto-marked objective items, manual short-answer and five-point rubric, per-question comments, overall feedback, draft save and publish state.
- Browser-generated sample PDF download from marketplace/library resource actions; generated PDF states that it is illustrative.
- Marketplace purchase creates a pending sale only for paid items with teacher-vendor attribution.

## Remaining gaps: 19 product areas

These are missing or partial screens/flows, not necessarily 18 individual screens:

1. Email/SMS/WhatsApp onboarding and confirmation delivery, consent, retry and delivery history.
2. Production authentication, identity verification, account recovery and secure session handling.
3. Vendor onboarding, organisation profile, verification, policy acceptance and seller-specific dashboard.
4. Seller product editing/versioning, source file storage, preview generation, moderation feedback loop and replacement uploads.
5. Original purchased resource delivery. The current PDF download is generated sample content, not the vendor's source paper.
6. Real payment processing, M-PESA callbacks, receipts, reversals/refunds and payment reconciliation.
7. Finance ledger by vendor, transaction reconciliation, fee configuration and auditable settlements.
8. Server-backed wallet balances, payout provider integration, account verification and payout failure handling.
9. Order history, itemized receipts, cancellation/refund requests and child-specific purchases.
10. In-app notification centre with delivery/read controls, deep links and user-level notification preferences.
11. Teacher class CRUD, learner roster import, assignment scheduling, due dates and actual learner assignment delivery.
12. Marking results joined to real assignment submissions and surfaced in the learner/parent results views with review/appeal history.
13. Full question bank selection and reusable assessment authoring, moderation and version history.
14. Rich result reports with real linked assessment data, downloadable reports and interactive doughnut/pie/pivot-style analysis.
15. School administration permissions, teacher-to-class assignment and school-level subscription entitlements.
16. Administrator CRUD and audit history for users, institutions, curricula, products, plans, content and transactions.
17. Actual PDF upload/preview/OCR/digitisation and asset management; current examiner source document is illustrative.
18. Installable offline-capable PWA and the planned Flutter application, including shared authenticated API/data contracts.
19. Dedicated public About, curriculum and subject landing pages from the original brief; the current how-it-works and catalogue pages only partially cover this discovery content.

## Prototype limits and assumptions

- Browser local storage is the persistence layer. Separate devices/users do not share state, and this is not an access-control boundary.
- M-PESA checkout, admin settlements and “mark paid” only change demo statuses. No money moves.
- The 20% platform fee is illustrative, not an approved commercial policy.
- In-app messages persist locally; no email, SMS, WhatsApp, web push or native push is sent.
- Assessment samples and marks are fictional; manual rubric actions demonstrate the workflow but do not represent a validated marking policy.
- “Download sample PDF” intentionally creates generated illustrative questions and does not imply that source files were uploaded or are licensed for distribution.
- Workspace screens are not URL-routed yet. Refresh/back-button behavior is limited.

## Recommended next build sequence

1. Close the result handoff: connect published marking records to the learner and parent result experience.
2. Build vendor product management and original file delivery around the already demonstrated review flow.
3. Define approved fee, settlement cadence, payout limits, refund rules and provider before production finance work.
4. Replace local storage with API contracts and role/tenant access rules.
5. Implement responsive PWA packaging and offline-safe learner exam behavior.
6. Reuse the approved component and API contracts in the Flutter client.
