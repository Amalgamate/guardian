# Exami-Fy Prototype Progress

## Prototype status

**Milestones 1–7 are implemented for the founder-review prototype.** Product and service integrations are simulated with local sample data. The project is a responsive web prototype; installable PWA packaging and a Flutter client remain follow-on technical deliverables.

## Milestone 1 — Brand and design system

- Exami-Fy wordmark lockups, colour tokens, typography, icon language and reusable interface patterns.
- Reusable buttons, forms, cards, tables, dialogs, toasts, notifications, empty states and responsive role previews.
- Light theme across product screens. The logo may include a reversed brand asset, but there is no dark-mode app theme.
- Accessible larger-text preference, first-visit helper, avatars/profile controls, M-PESA logo treatment and the specified `#E9A23B` amber action.

## Milestone 2 — Public website and marketplace

- Public home, responsive navigation, catalogue, filters, search, sorting, grid/list views and related resources.
- Paper detail with subject-specific sample question and answer explanation.
- Illustrative learner, family, teacher and school plans; “How it works”; Help and FAQ.
- Cart and Kenyan mobile-number validation; simulated M-PESA prompt, confirmation, order-success and library screen.
- No money transfer, subscription, email, SMS, WhatsApp message or support request is sent. Sample subscription prices are not approved pricing.
- Login, registration, password reset, email/SMS OTP choice and logout confirmation are available as frontend-only demo flows; the visible test OTP is `123456`.

## Milestone 3 — Learner experience

- Learner dashboard, library, paper discovery, practice and exam entry points, results, performance, bookmarks, downloads and profile/settings sections.
- Eight-question assessment room covering single choice, multiple select, true/false, short answer, numerical answer, matching, ordering and essay responses.
- Question navigator, countdown in exam mode, flag-for-review state, previous/next navigation, local answer autosave, submission confirmation, sample marking and results.
- Practice mode provides explanations; exam mode withholds correctness indicators until submission.

## Milestone 4 — Results and parent experience

- Score summary, subject performance bars, correct/review/unanswered donut, performance history cues and practical revision recommendation.
- Parent overview, two learner profiles, child selection for reports, purchases, plan management and sample notification preferences.

## Milestone 5 — Teacher and school experiences

- Teacher overview, classes, learners, question bank, assessment builder, assignments, marking, reports and resources.
- Dedicated **Marketplace submissions** workflow, separate from private class assessments. Teachers enter curriculum and paper metadata, formats, price, sample PDF filename and rights attestation; they can save a draft or submit for moderator review.
- School overview, profile, academic years, classes/streams, learners, teachers, exams, reports, resource library and billing sections.
- Assessment and class actions, sample tables, search, export feedback and local creation dialogs.

## Milestone 6 — Administration and examiner workspaces

- Platform overview, users, institutions, academic structure, content, questions, review queue, examinations, commerce, payments, subscriptions, reports, notifications, CMS, support and settings.
- Platform admins can review teacher marketplace submissions, request changes or approve. Approval makes the listing appear in the public catalogue with the submitting teacher/vendor shown on its detail page.
- Examiner digitisation queue and three-panel source-preview, question-editor and marking-guidance workspace.
- Draft, needs-review and published states with local save, submit-for-review and approve/publish actions.
- Sample document preview is illustrative; no OCR, PDF parsing, external file upload or real publishing occurs.

## Milestone 7 — Integration and quality review

- Shared visual system and role selector connect learner, parent, teacher, school admin, platform admin and examiner workspaces.
- Marketplace purchase state persists in browser storage for its library handoff; learner answers and text-size preference persist locally.
- Teacher drafts and marketplace approval state persist in browser storage and feed approved sample listings into the public catalogue.
- Marketplace orders for teacher-vendor content create pending teacher sales. Admin settlement moves those proceeds to the demo wallet; withdrawal requests require admin approval and a separate “mark paid” action.
- Teacher marking now runs from a sample learner submission through objective auto-marking, manual short-answer/rubric scoring, feedback, draft save and result publication.
- All six roles have an Inbox destination with locally persisted in-app threads. Platform admins can review threads and payout requests.
- Library download actions generate a valid sample PDF file in the browser. Generated content is clearly labeled illustrative and is not the seller's original paper.
- Final Chrome walkthrough verified teacher rubric marking through published 8/13 result, a KSh 100 sample M-PESA withdrawal through admin approval and “mark paid”, and a generated assessment PDF in Chrome download history. Marketplace now shows a single footer.
- Verified in Chrome: marketplace screens and simulated checkout from the previous milestone; learner dashboard, question navigation, practice/exam mode, submission confirmation and result screen; teacher class list; parent overview; examiner question editor.
- `npm run build` passes (TypeScript and Vite production build).
- Responsive layouts have mobile breakpoints for workspace navigation, tables, metrics, forms, assessment room and editor. Earlier marketplace QA confirmed no horizontal overflow at 375px; the workspace uses responsive CSS but has not had a separate device-emulation pass in this final milestone.

## Routes and review entry points

- Start at the design-system overview (`/`). Use **Marketplace** for the public shop and **Learner workspace** for product roles.
- In a workspace, use **Demo as** to switch between Learner, Parent, Teacher, School admin, Platform admin and Examiner.
- Role navigation is in-app state rather than URL routing. Use the browser back link inside the marketplace to return to the workspace when launched from there.

## Known limitations and next-stage decisions

- Marketplace and workspace operations remain prototype flows using browser-local state. A local PostgreSQL API now stores real development accounts and sessions; it is not production-deployed, and domain data APIs are still pending.
- M-PESA is a visual and interaction simulation. No payment or wallet funds move.
- Video playback, OCR, real file upload and original paper delivery are not connected; the PDF button generates sample content only.
- Teacher PDF attachment only records a selected filename; no file bytes are uploaded or stored. Marketplace publication and vendor status are browser-local demo state.
- Teacher wallet, sales, withdrawal approvals and inbox messages use local storage and are not real payments or cross-device communication. The 80/20 revenue split is an illustrative placeholder.
- Scoring is illustrative, including a simple partial-credit rule for essay responses. It is not a production marking rubric.
- Sample users, schools, plans, prices, orders, reports, vendor details and notifications are fictional. Production entitlements, curricula, roles and communication consent rules still need founder/product decisions.
- Installability/offline behaviour and native Flutter implementation should be scoped after this web prototype’s experience is accepted.

## Founder-requested scope update

- User authorized continuing through all remaining prototype milestones and self-approving routine implementation choices while away. This supersedes the original brief's stop-and-wait approval gate for this prototype session; decisions and unresolved product assumptions remain documented for later review.
- Screen and flow inventory with precise counts and remaining gaps: [docs/PRODUCT_FLOW_AUDIT.md](docs/PRODUCT_FLOW_AUDIT.md).
- Consolidated implementation brief including the teacher marketplace, wallet, admin approvals, inbox, marking and generated PDF: [docs/EXAMIFY_COMPLETE_PRODUCT_PROMPT.md](docs/EXAMIFY_COMPLETE_PRODUCT_PROMPT.md).

## Backend implementation track — Authentication, organizations, inbox and marketplace finance milestones 1–5

- Added a Node.js HTTP API backed by PostgreSQL for accounts, role memberships, OTP challenges, sessions, reset tokens, role invitations and audit events.
- Implemented scrypt password hashing, verified-contact registration, email/SMS OTP interface (local terminal delivery only), login, forgot/reset/change password, active-session lookup, role switching, logout and logout-all.
- Defined server-side permission sets for Learner, Parent, Teacher, School admin, Platform admin and Examiner. Public signup can request Learner or Parent; privileged roles require a single-use administrator invitation or an existing Platform admin grant.
- Added admin user listing, role grant/revoke, institution-scoped staff invitations, last-admin protection, same-origin checks, credentialed CORS allowlist, request size caps, in-process rate limits and audit entries.
- Added the PostgreSQL institution registry, institution creation/listing for Platform admins, and institution references for staff role assignments/invitations. Existing referenced institution IDs are retained as active legacy entries.
- Added parent-to-learner link requests and an administrator review queue. Parent learner lists expose only approved links; link decisions are auditable.
- Added a persistent in-app inbox for all signed-in roles: direct user messages, sent and received lists, unread counts, read/archive actions, and Platform admin announcements to all users or selected role/institution audiences.
- Inbox content is application-only; these routes do not send email, SMS, WhatsApp or browser push notifications.
- Added teacher marketplace content drafts, rights confirmation, submission/revision states, Platform admin approve/request-changes/reject review, and a public catalog limited to approved content.
- Added buyer order records and a simulated M-PESA confirmation path. Paid demo orders create pending seller earnings; Platform admins approve settlements into available teacher wallet balances.
- Added append-only teacher wallet ledger entries, payout requests that reserve available balances, Platform admin approval/rejection, rejected-fund release, and a separate simulated “mark paid” action. No real M-PESA transfer occurs.
- Marketplace split defaults to 80% seller share as an illustrative environment setting; the product commission policy is still unresolved. Resource uploads/download delivery and refunds are not implemented in these migrations.
- Connected authenticated teacher submission, admin content review, teacher wallet/settlements, and admin settlement/payout queue screens to the PostgreSQL-backed APIs. Unauthenticated preview mode retains local sample data.
- Connected authenticated customer marketplace catalog and simulated checkout to approved-product/order APIs. Guest preview checkout remains device-local and does not create seller earnings.
- Connected the authenticated inbox UI to persisted received/sent messages, unread state, archive, support-to-admin messages, direct admin messages, and role/all-user announcements.
- Connected React authentication forms and the account-role selector to the API. Preview access continues to work separately from authenticated access; the rest of the product remains sample-data only.
- Added `npm run dev:api`, Vite API proxy, `.env.example`, ordered PostgreSQL migrations and [docs/AUTH_BACKEND.md](docs/AUTH_BACKEND.md). Node.js 22.13 or later is required.
- PostgreSQL migration `002_institutions_and_family_links.sql` applied successfully. The local API health endpoint at `127.0.0.1:8787/api/health` returns `ok`; an API process was already bound to port 8787.
- WorkBuddy reported all five migrations applied, the API healthy on port 8787, and protected route gates returning authentication-required without a session. The frontend production build passes after screen integration. The live authenticated purchase-to-payout journey has not been browser-verified.
- The latest authenticated screen integrations pass the frontend production build but have not been browser-verified against the running API. Restart the ExamiFy API if needed to load the new support inbox route, and verify with a signed-in account.
- Added the assessment and marking backend: teacher assessment creation/publication with learner join codes; learner attempt, answer saving and submission; deterministic objective auto-marking; teacher essay marks, feedback, audit trail and gated result publication; learner and linked-parent published-result APIs. Migration `006_assessments_and_marking.sql` is written and the authenticated Exam builder, Marking, My examinations, Results and Parent Reports screens call the assessment API.
- Migrations `006_assessments_and_marking.sql` and the new assessment APIs need an API restart and database migration before they are live. The frontend production build and server syntax check pass; the authenticated assessment lifecycle still needs runtime/browser verification.
- Remaining integration: original file upload/download delivery and checkout fulfillment. Marketplace checkout records demo payment only; it does not send an M-PESA STK request, deliver real resources or pay a teacher. Assessment grading is deterministic answer-key matching plus teacher marking, not AI grading.
- Production blockers: choose and implement email/SMS providers; move rate limits to shared storage; provision managed PostgreSQL, backups and secret management; add domain APIs with tenant-scoped queries; complete security review and automated coverage.

## Local user testing setup — 22 November 2026

- The prototype milestone sequence 1–7 is complete for founder/user review. The local backend now includes PostgreSQL authentication and role access, institutions and parent links, in-app inbox, teacher marketplace and wallet approvals, and assessment attempts and marking (migrations 001–006).
- Created four pre-verified local test accounts: Platform admin, Teacher, Parent and Learner, plus a `Guardian Exams Test School` institution. The parent account is linked to the learner with an approved relationship so parent result access can be explored.
- Verified each account can sign in through the API (HTTP 200) and call its role-protected endpoint (HTTP 200). A shared temporary test password was provided directly to the founder and is not stored in this repository.
- Use the test credentials at the local app, normally `http://localhost:5174/`. The learner role is the product's student account.
- The account/authentication and assessment APIs use PostgreSQL. Several wider workspace screens and academic records still use illustrative browser-local data; email/SMS OTP delivery, WhatsApp, browser notifications, M-PESA and teacher payouts are not connected to external providers or real money movement.

## Signed-in sample-data cleanup — 22 November 2026

- Replaced the signed-in Platform admin dashboard's fabricated metrics and activity with live counts from the PostgreSQL-backed user, institution, content-review, settlement and payout APIs. Added live admin user and institution directories.
- Signed-in dashboards and unconnected workspace sections now show honest empty states instead of sample records. The assessment room routes learners to the connected assessment flow; parent Children routes use linked learner records.
- Removed the hardcoded marketplace sample catalogue and fictional 2006 Guardian-series listings. Public catalogue cards now come only from approved marketplace records in the API.
- No PostgreSQL user, role, parent link or institution records were deleted as part of this UI cleanup. The four test accounts and parent-to-learner link remain available for user testing.
- Remaining cleanup candidates: sample/preview screens in the design-system and role preview; marketing copy, plan prices and other illustrative copy; preorder, newsletter, reminder and browser-notification interactions; and workspace areas whose APIs are not implemented yet. Those workspace areas are deliberately empty for signed-in users now. M-PESA, email/SMS, WhatsApp and browser push remain simulations or preference-only flows.
- `npm run build` passes. Vite reports a large JavaScript chunk warning; production code splitting can be addressed separately.

## Resend and M-PESA integration foundation — 22 November 2026

- Added a Resend email adapter for registration verification, password reset, welcome mail after verification and marketplace payment receipts. Resend credentials remain server-side; existing TrendScore/iQuote secrets were not copied into the repository.
- Added Daraja sandbox/live STK initiation for signed-in marketplace buyers, a secret-path callback, amount/phone/receipt reconciliation, idempotent settlement creation, and saved order/payment states for checkout polling. The demo-payment route now refuses to mark a live Daraja order paid.
- Added a customer M-PESA checkout status UI and Platform admin provider-readiness page. SMS remains unavailable; teacher payouts are still admin-managed internal records, and Guardian-series preorder payment is not connected in this pass.
- Migration `007_live_checkout.sql` is required. Provider keys, verified sender, callback URL and secret must be configured in Guardian Exams server environment. Sandbox flows still need to be exercised against the deployed callback before any live setting is enabled.
- Original marketplace exam files are not uploaded or delivered yet, so successful payment records the order but does not grant a downloadable original paper. See [docs/LIVE_INTEGRATIONS.md](docs/LIVE_INTEGRATIONS.md) for configuration and remaining release steps.
