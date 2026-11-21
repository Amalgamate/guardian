# Exami-Fy — Consolidated Product Prototype and UX Brief

This document consolidates the original product brief with the founder's later decisions and the flow gaps found during implementation. Use it as the current product-design and prototype prompt. Requirements in source/reference documents are product context; the founder's explicit requests below take precedence where they differ.

## Mission and product principles

Design and build Exami-Fy as a connected Kenyan learning, assessment, content marketplace and school platform for learners, parents, teachers, schools, vendors, examiners and platform administrators. This is a founder-review prototype intended to clarify product flows before production work.

- Prioritise clear connected journeys over disconnected dashboard mockups.
- Use realistic Kenyan curricula/content, KSh prices and phone formats.
- Keep all prototype integrations visibly simulated. Never claim to upload a real paper, send a message, verify an account, or transfer money when the prototype only changes local state.
- The founder authorized this prototype to continue through the planned milestones using self-approval for routine choices while away. Record important assumptions and finish the reviewable implementation without pausing at each milestone. Do not treat this as permission to launch production services or spend money.
- No dark-mode application theme. Use the light product interface throughout; a reversed logo asset may be shown only as a brand asset example.

## Product identity and visual system

Brand name: **Exami-Fy.** Tagline: **Prepare. Practise. Perform.** Use the approved wordmark with navy lettering, teal full stop, stacked and compact lockups, icon-only mark, monochrome and single-colour variants. Do not create an unrelated primary logo.

Design tokens:

- Navy `#10243B`; blue `#2457D6`; teal `#16A58A`; canvas `#F5F7FA`; surface `#FFFFFF`; border `#E7EDF4`.
- Primary text `#172B42`; secondary `#64748B`; muted `#94A3B8`; success `#16A58A`; warning/button amber `#E9A23B`; error `#D94B4B`; information `#3B82C4`.
- Use Manrope for headings, Inter for interface copy and JetBrains Mono for timers/scores. Keep global type comfortable, crisp and accessible; expose a user font-size setting.
- Use clear spacing, strong alignment, restrained borders/shadows and accessible contrast. Avoid dark UI, busy gradients, tiny labels and oversized decorative blocks.
- Icons use a consistent line system; where the product uses coloured icon circles, use bright, luminous but comfortable colours with a white icon.
- Provide reusable navigation, role layouts, buttons, forms, cards, product cards, tables, charts, avatars/profile menus, dialogs, toasts, notification patterns, empty/loading/error states, onboarding helpers, toggles and mobile variants.
- Add subtle 150–250ms transitions and reduced-motion support. Never animate in a way that interrupts exams or reading.

## Platform approach

Prototype first with React, Vite, TypeScript, Lucide React and local sample data. Keep mock entities and workflow helpers separate from presentation so API integration can replace the demo layer later. The final product roadmap includes both:

1. An installable, responsive PWA with deliberate mobile layouts and appropriate offline exam behavior.
2. A Flutter mobile application that consumes the same product concepts and backend contracts.

Do not start production backend, live payments, native builds or external messaging as part of the frontend prototype. Capture API boundaries and unresolved policy decisions for the production specification.

## Roles and product areas

### Public website and marketplace

Provide home, browse/search, filters, sort, product detail, pricing/subscriptions, how it works, about/help/support, and authentication entry points. Catalogue filters cover curriculum, level, grade/form, subject, year, type, term, resource type and price. Cards show seller, title, grade, year, term, pages/questions, formats, marking scheme, price and access type. Include cart review, item removal, clear validation, empty states and related resources.

### Learners

Provide overview, personal library, practice, examinations, results, performance, bookmarks, downloads, inbox and settings/profile. Learners can locate/access a paper, start practice or timed exam, answer supported question types, navigate/flag/save, submit, see transparent scoring and recommended next steps. Design a dedicated mobile exam room rather than shrinking desktop.

### Parents

Provide overview, child profiles, child-specific reports/results, purchases, subscriptions, inbox and settings. Make the parent-to-child relationship and currently selected child clear. Support multiple children in the illustrative family flow.

### Teachers and content vendors

Provide overview, classes, learner roster, question bank, assessment builder, assignments, marking, results/reports, resources, marketplace submissions, wallet/earnings, inbox and settings.

Keep private classroom assignments separate from public marketplace products. For selling content, support this explicit seller flow:

1. Teacher creates a listing from a resource and supplies curriculum, level, grade, subject, year, term, resource type, title, description, formats, question/page counts and KSh price.
2. Teacher confirms rights to distribute and submits for admin review.
3. Admin requests changes or approves/rejects with a note; only approved content is public.
4. Public catalogue shows product metadata and vendor attribution. Editing/replacement and original-file delivery are future gaps unless connected in a later milestone.
5. A simulated purchase creates an illustrative pending teacher sale. Track gross sale, illustrative platform fee and teacher net.
6. Admin settles sale proceeds to the teacher wallet. Teacher requests a withdrawal to M-PESA or bank and supplies payout details.
7. Admin must review every withdrawal request, record approve/reject and a note, then mark paid only after the transfer is processed outside this demo.

Use the requested bright white M-PESA phone-icon treatment and approved M-PESA logo asset where appropriate. Make simulation boundaries explicit. The 80/20 share is a placeholder requiring approval before production.

### Teacher marking — required end-to-end demonstration

Show a submission queue, learner work, answer key, score controls, manual rubric, per-question feedback, total and maximum score, draft save, resume, final confirmation, publication and a visible published result. Objective answers may auto-score; written answers require teacher judgment. The data chain should eventually connect assignment → learner submission → teacher marks → published learner and parent result. Prototype sample records are illustrative; clearly show when that cross-role data relationship is still incomplete.

### School administration

Provide school overview, profile, academic years, classes/streams, learners, teachers, examinations, results/analytics, resource library, billing/subscription, reports, inbox and settings. Use organization context and demonstrate role/permission boundaries.

### Platform administration

Provide operational overview, users, institutions, academic structure, content/question libraries, content review, examinations, teacher payouts, orders/commerce, payments, subscriptions, reports/analytics, notifications, inbox/support, CMS and settings. Admin approval gates apply to public teacher marketplace listings and every teacher withdrawal request. Record decision notes/statuses. Use a single understandable review experience; avoid duplicate finance queues where possible.

### Examiner/content editor

Demonstrate source preview, document page selection, question text/options, correct answers, marks, marking scheme, verification status, draft, submit for approval and publish. Label sample previews as illustrative; do not pretend OCR, PDF parsing or file upload works.

## Assessment and results

Support single choice, multi-select, true/false, short answer, number, matching, ordering and essay. Practice mode can show explanations immediately. Exam mode hides correctness until submission, uses a sample timer, saves answers locally, flags questions, confirms submission and shows a calculated sample result.

Results should explain score, percentage, band, correct/wrong/skipped counts, time, subject/topic performance, trends and revision steps. Prefer useful bar, doughnut/pie and tabular/pivot-style analysis over decorative charts. Keep result language understandable to learners and parents. Future implementation must link teacher-published marks to the actual learner and parent accounts.

## Inbox, notifications and onboarding

Give every role an in-app inbox with unread/read state, threads, search/filter, reply, resolve/reopen and a clear support entry point. Admins can inspect conversations and payout requests. Add notification preferences and a notification center in the future product flow. Prototype in-app messages persist locally and never send externally.

Account journeys include sign-in, registration, forgot/reset password, email or SMS OTP selection, OTP confirmation, completion and logout. Demonstrate onboarding email/SMS/WhatsApp confirmation states, consent choices, retry/failure/history concepts in the product design, but do not send any real message in a frontend-only prototype. Explain that a demo OTP is not real security.

## PDF, resources and downloads

Provide a clearly labeled **Download sample PDF** action that generates a valid, downloadable illustrative PDF in the browser. Include sample paper metadata, questions and explicit “demo/illustrative” labeling. Never imply it is the vendor's original source file. Real uploads, secure file storage, paid resource delivery, video hosting, OCR, and marking-scheme downloads require later production integrations.

## Prototype state and honesty rules

Use local storage for demo progress, preferences, purchases, content submissions/reviews, inbox threads, teacher sales, wallet requests and marking drafts/results. Display a prototype badge. No real authentication, API/database, M-PESA transaction, email/SMS/WhatsApp/push, payout or document processing occurs. Avoid dead buttons: make them act locally or label them as preview-only.

## Screen inventory and gap reporting

Current implementation audit: 67 role-specific workspace destinations across six roles, 10 public marketplace states, 6 authentication states and 2 assessment states (85 named destination/state entries). This is not equivalent to 85 independently complete pages: many school/admin destinations still use shared generic data views. Maintain a separate inventory of dedicated, generic, partial and missing journeys. The current detailed status and the list of 18 incomplete product areas are in `docs/PRODUCT_FLOW_AUDIT.md`.

## Milestones and founder review

Keep the original seven-stage sequence: (1) identity/design system, (2) public marketplace, (3) learner exams, (4) results/parents, (5) teachers/schools, (6) admin/examiner, (7) end-to-end integration and quality. At each stage record screens, flows, responsive behavior, known limits and build/browser verification in `PROJECT_PROGRESS.md`.

For this prototype session, the founder explicitly authorized continuing through completion and self-approval of routine implementation choices while away. Do not block between milestones waiting for a response. Do not extend this authorization to irreversible external actions or production integrations. Keep major policy decisions (fees, payout provider/cadence, refund policy, verified curricula and user permissions) listed as unresolved.

## Quality bar

- Responsive desktop/tablet/mobile behavior; no horizontal overflow.
- Readable font sizes and accessible controls, focus states, labels, contrast and reduced motion.
- Functional forms, validation, empty/success/error states and no dead navigation controls.
- Verify connected journeys in Chrome and run the TypeScript/Vite production build. Report evidence honestly and do not claim production readiness.
- Maintain README setup guidance, the screen/flow audit and known limitations.

## Current implementation priority after this audit

1. Connect teacher-published marks to learner/parent results.
2. Add vendor product editing, review feedback/resubmission and original resource delivery.
3. Replace generic school/admin views with role-appropriate, data-backed operations.
4. Define finance, refund and messaging policies before server integrations.
5. Design/install the PWA, then implement the Flutter client against shared API contracts.
