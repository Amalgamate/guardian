# Guardian Exams authentication API

Status: local backend milestones 1–6 implemented in source. WorkBuddy reported migrations 001–005 applied and the API running. Migration `006_assessments_and_marking.sql` and the assessment backend/frontend were added afterward and require an API restart before use. This is not a production deployment.

## Start locally

Requirements: Node.js 22.13 or later and a running PostgreSQL server.

1. Create a PostgreSQL database and least-privilege app login (example below).
2. Copy `.env.example` to `.env` and set `DATABASE_URL` with that app login.
3. Optionally set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` (12 or more characters) before the first API start. The account gets the global Platform admin role once. Do not commit `.env`.
4. Start the API with `npm run dev:api`.
5. Start the web app in a second terminal with `npm run dev`; Vite proxies `/api` to `127.0.0.1:8787`.
6. For local OTP verification, read the one-time code printed in the API terminal. Email/SMS are not sent in this milestone.

Example one-time setup (run with a PostgreSQL superuser, replacing the password with a unique secret):

```sql
CREATE ROLE guardian_app LOGIN PASSWORD 'replace-with-a-long-unique-secret';
CREATE DATABASE guardian_exams OWNER guardian_app;
```

The API applies ordered SQL files in `server/migrations/` and records applied versions in `schema_migrations`. The URL follows `postgresql://guardian_app:password@127.0.0.1:5432/guardian_exams`.

## Implemented routes

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Liveness |
| POST | `/api/auth/register` | Public | Create Learner/Parent account or accept an administrator-issued role invitation |
| POST | `/api/auth/verify` | Public | Verify email/SMS OTP and create a session |
| POST | `/api/auth/resend` | Public | Replace an active verification code |
| POST | `/api/auth/login` | Public | Verify credentials and create a server-side session |
| POST | `/api/auth/password/forgot` | Public | Request a generic password-reset response and OTP |
| POST | `/api/auth/password/verify` | Public | Exchange a valid reset OTP for a short-lived reset token |
| POST | `/api/auth/password/reset` | Public | Change password and revoke all sessions |
| GET | `/api/auth/me` | Signed in | Return account, assigned roles, active role and permissions |
| POST | `/api/auth/active-role` | Signed in | Switch only to an assigned role/institution membership |
| POST | `/api/auth/logout` | Signed in | Revoke current session |
| POST | `/api/auth/logout-all` | Signed in | Revoke every session |
| POST | `/api/auth/password/change` | Signed in | Change password after checking the current password |
| GET | `/api/auth/role-access` | Signed in | Inspect permissions for assigned roles |
| POST | `/api/teacher/assessments` | Teacher | Create an assessment with questions and answer keys |
| GET | `/api/teacher/assessments` | Teacher | List own school-scoped assessments and attempt counts |
| POST | `/api/teacher/assessments/:id/publish` | Owner | Publish an assessment and enable its learner join code |
| POST | `/api/teacher/assessments/:id/close` | Owner | Close a published assessment to new attempts |
| GET | `/api/teacher/marking-queue` | Teacher | List submitted attempts for the teacher's institution |
| GET | `/api/teacher/attempts/:id` | Owner | Review learner answers and written-response marks |
| PUT | `/api/teacher/attempts/:id/marks` | Owner | Save a manual essay score and feedback |
| POST | `/api/teacher/attempts/:id/publish` | Owner | Publish results after every essay question has been marked |
| GET | `/api/learner/assessments` | Learner | List available published assessments |
| GET | `/api/learner/assessments/lookup?code=...` | Learner | Look up a published assessment by join code |
| POST | `/api/learner/assessments/:code/attempts` | Learner | Start or resume the learner's single attempt |
| PUT | `/api/learner/attempts/:id/answers` | Owner | Save answer state while an attempt is active |
| POST | `/api/learner/attempts/:id/submit` | Owner | Submit and automatically score supported objective answers |
| GET | `/api/learner/attempts/:id` | Owner | Retrieve own attempt without answer key before publication |
| GET | `/api/learner/results` | Learner | Read own published assessment results |
| GET | `/api/parent/learners/:id/results` | Approved linked Parent | Read results for an approved linked learner |
| GET | `/api/marketplace/catalog` | Public | Browse approved marketplace resources with basic filters |
| GET | `/api/marketplace/catalog/:id` | Public | View an approved resource |
| GET | `/api/marketplace/orders` | Learner/Parent | List own orders |
| POST | `/api/marketplace/orders` | Learner/Parent | Create an awaiting-payment order from approved products |
| GET | `/api/marketplace/orders/:id` | Buyer | View an own order and its line items |
| POST | `/api/marketplace/orders/:id/simulate-payment` | Buyer | Confirm a demo M-PESA checkout; no payment request is sent |
| GET | `/api/teacher/marketplace-submissions` | Teacher | List own drafts and moderation results |
| POST | `/api/teacher/marketplace-submissions` | Teacher | Create a marketplace resource draft |
| PATCH | `/api/teacher/marketplace-submissions/:id` | Owner | Edit a draft or requested changes |
| POST | `/api/teacher/marketplace-submissions/:id/submit` | Owner | Submit rights-confirmed content for moderation |
| GET | `/api/teacher/wallet` | Teacher | Read pending, available, reserved and processed KSh balances, settlements and payouts |
| GET | `/api/teacher/wallet/transactions` | Teacher | Read own append-only wallet ledger entries |
| POST | `/api/teacher/wallet/payouts` | Teacher | Reserve available funds in a payout request for admin review |
| GET | `/api/inbox` | Signed in | List the user’s in-app messages with read state and pagination |
| GET | `/api/inbox/unread-count` | Signed in | Return the user’s unread message count |
| GET | `/api/inbox/:id` | Recipient | Read one message addressed to the signed-in user |
| GET | `/api/inbox/sent` | Signed in | List messages sent by the signed-in user |
| POST | `/api/inbox/messages` | Signed in | Send an in-app message to one active user |
| PATCH | `/api/inbox/:id/read` | Recipient | Mark an inbox message as read |
| PATCH | `/api/inbox/:id/archive` | Recipient | Archive an inbox message |
| GET | `/api/admin/users` | Platform admin | List up to 250 accounts without credential data |
| GET | `/api/admin/marketplace-submissions?status=submitted` | Platform admin | Review teacher content submissions |
| PATCH | `/api/admin/marketplace-submissions/:id/review` | Platform admin | Approve, request changes or reject a resource with a review note |
| GET | `/api/admin/marketplace-settlements` | Platform admin | Review seller earnings awaiting settlement |
| POST | `/api/admin/marketplace-settlements/:id/approve` | Platform admin | Move an approved sale earning from pending to available wallet balance |
| GET | `/api/admin/teacher-payouts` | Platform admin | Review teacher payout requests |
| PATCH | `/api/admin/teacher-payouts/:id/review` | Platform admin | Approve or reject a reserved payout request |
| POST | `/api/admin/teacher-payouts/:id/mark-paid` | Platform admin | Record a simulated payout as processed after approval |
| POST | `/api/admin/inbox/announcements` | Platform admin | Send an in-app announcement to all active users or a role/institution audience |
| GET | `/api/admin/institutions` | Platform admin | List institution registry entries |
| POST | `/api/admin/institutions` | Platform admin | Create an active school, college, publisher or other institution |
| GET | `/api/admin/parent-links?status=pending` | Platform admin | Review parent-to-learner link requests |
| PATCH | `/api/admin/parent-links/:id` | Platform admin | Approve or reject a pending link with an optional review note |
| POST | `/api/admin/invitations` | Platform admin | Issue a single-use, seven-day role invitation |
| POST | `/api/admin/users/:id/roles` | Platform admin | Assign a role; school-scoped staff roles require an institution ID |
| DELETE | `/api/admin/users/:id/roles/:role` | Platform admin | Revoke a role and sessions using that context |
| POST | `/api/parent/links` | Parent | Request a link to an active Learner account by email or phone; administrator approval is required |
| GET | `/api/parent/learners` | Parent | List only learners whose link has been approved |

Roles in the authorization model are Learner, Parent, Teacher, School admin, Platform admin, and Examiner. Public registration can request Learner or Parent. Educator, school, examiner and platform roles require an invitation or an existing Platform admin. Parent-to-learner links are separate, auditable records: a parent can request a link to an active learner account, but learner data is returned only after a Platform admin approves it. Rejected or revoked requests can be resubmitted.

## Security foundations

- Passwords use Node `scrypt` with a unique random salt. Minimum length is 12 characters.
- Sessions use random opaque bearer secrets in an HttpOnly, SameSite=Lax cookie. Only SHA-256 token hashes are stored. Production cookies are marked Secure.
- OTPs are six digits, expire in 10 minutes, are stored as keyed hashes, and lock after five wrong attempts. Reset tokens are single-use, short-lived, and password reset revokes existing sessions.
- Requests have body-size limits, same-origin checks for mutations, credentialed CORS limited to `WEB_ORIGIN`, and in-process rate limits.
- Role memberships and admin changes have an audit trail. Platform admin routes verify the active server-side role.
- Password reset returns the same public message whether or not an account exists.

## Known production blockers

- The development `console` OTP adapter prints verification codes only to the server terminal. There is no email/SMS provider adapter, delivery consent record, bounce/retry handling or delivery history yet. Startup refuses `OTP_DELIVERY=console` in production; select and implement approved providers before deploying.
- Rate limits are process-local and must move to a shared store before multi-instance hosting.
- PostgreSQL is the backend database for this project. Use a managed PostgreSQL deployment, backups, migration review, TLS and secret management before production.
- Institution registry and admin-reviewed parent-to-learner link records are implemented in migration `002`. Existing institution IDs are backfilled as active legacy registry entries. School domain endpoints still need tenant-scoped query enforcement before those roles can access real school data.
- In-app messages and admin announcements are implemented in migration `003`. They are stored and delivered inside the application only; no email, SMS, WhatsApp or browser push is triggered by these routes.
- Teacher marketplace submissions, admin moderation, approved catalog reads, demo order checkout, pending vendor earnings, admin settlement approval, teacher wallet balances and admin-reviewed payout requests are implemented in migrations `004` and `005`. The default 80% vendor share is an illustrative setting; confirm the commission policy before real sales.
- Assessment creation, learner join-code attempts, answer saving, objective marking, teacher essay marking, audited result publication and learner/approved-parent results are implemented in migration `006`. Choices/multi-select, boolean, exact short response, numeric, matching and ordering use deterministic answer-key matching; essays require teacher marking. The marking rubric is guidance only and not AI-based grading.
- Published assessment access currently uses a 10-character join code. There is no per-class learner roster/assignment policy yet, so any active Learner who has the code can attempt it once. Add school/class membership checks and clarify retake rules before production.
- The authenticated teacher submission, administrator moderation, teacher wallet and administrator settlement/payout screens call these APIs. Preview workspaces without a backend session continue to use local prototype data.
- Authenticated teachers can author/publish questions and review essay answers; authenticated learners can join by code, save answers and submit; learner and approved linked-parent result views show only published marks.
- The storefront fetches approved products and, for signed-in Learner/Parent sessions, records an order before allowing simulated payment confirmation. Guest preview purchases remain local-only. The inbox UI now uses persisted inbox APIs for received/sent messages, support requests, admin direct messages and announcements.
- Product file handling stores a sample filename only. No exam file is uploaded, delivered, downloaded or scanned in this milestone. Demo M-PESA checkout and payout status changes do not initiate real payment transfers.
- Backend route authorization was smoke-checked without sessions; a full authenticated purchase-to-payout workflow and the latest screen integration have not yet been browser-verified.
- The sign-in, registration, OTP, password-reset and logout screens call these routes. Workspace data remains prototype sample data, so authentication is real for local accounts but product actions are not yet backed by domain APIs.
- Add security review, CSRF strategy for the final hosting domains, password-reset abuse review, operational alerts, migrations, audit retention, and automated coverage before production use.
