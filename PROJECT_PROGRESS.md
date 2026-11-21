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

- Frontend-only prototype with browser local state; no API, database, production authentication, access control or server persistence. The login/registration/OTP flows do not create or verify real accounts.
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
