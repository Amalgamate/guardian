# Guardian Exams live integrations

## Implemented in this milestone

- Resend delivery for account verification and password reset codes. A welcome email is sent after email verification; a payment receipt is sent after a successful marketplace M-PESA callback.
- MobileSasa SMS for phone verification, password-reset codes and paid marketplace order receipts, using TrendScore's bearer-authenticated `/v1/send/bulk` request and `responseCode=0200` acceptance rule.
- Safaricom Daraja STK Push for signed-in Learner and Parent marketplace orders. Payment state is persisted in PostgreSQL, verified callbacks mark orders paid, and paid orders create the existing seller settlement and pending wallet ledger records.
- Customer checkout shows provider availability, phone entry, the pending prompt state, callback polling, retry after a confirmed failure, and an administrator-review state when callback amount, phone or receipt data does not match the order.
- Platform administrators have a Payments page that reports Resend, SMS and Daraja readiness without exposing credentials.
- Guardian Exams school pre-orders use per-student grade-pack pricing, a configurable flat delivery fee, server-side totals, saved order price snapshots, and the configured Daraja STK flow. Platform admin → Exam pricing edits the grade prices and reviews school orders.
- OTP resend is rate-limited with a 60-second cooldown and a maximum of four recent challenges in 15 minutes.

## Server environment configuration

Set these in the Guardian Exams server environment. Do not place provider secrets in source control, frontend variables, or browser storage.

```env
OTP_DELIVERY=resend
RESEND_API_KEY=<existing Resend API key>
RESEND_FROM_EMAIL=<verified Guardian Exams sender>
RESEND_FROM_NAME=Guardian Exams

MOBILESASA_API_KEY=<MobileSasa API key>
MOBILESASA_SENDER_ID=<approved sender ID, or MOBILESASA>
MOBILESASA_BASE_URL=https://api.mobilesasa.com

MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=<Daraja sandbox consumer key>
MPESA_CONSUMER_SECRET=<Daraja sandbox consumer secret>
MPESA_SHORTCODE=<sandbox shortcode>
MPESA_PASSKEY=<sandbox passkey>
MPESA_CALLBACK_URL=https://<Guardian Exams host>/api/mpesa/callback
MPESA_CALLBACK_SECRET=<random secret of at least 32 characters>
```

`EMAIL_FROM` and `BILLING_FROM_EMAIL` are accepted as sender-address aliases for environments that already use those variable names. The callback URL must be HTTPS and publicly reachable; Daraja receives the callback URL with the callback secret appended as a path segment. Keep proxy access logs private and redact this callback path where possible.

The API refuses production mode unless Resend is selected and configured. Daraja remains disabled until all required credentials, the HTTPS callback URL and the callback secret are present. Keep `MPESA_ENVIRONMENT=sandbox` through end-to-end acceptance. Configure production credentials and the live shortcode only after that acceptance.

## Database and screens

Migration `007_live_checkout.sql` adds marketplace payment fields. Migration `012_guardian_exam_orders.sql` adds school exam orders and editable grade/delivery pricing. The API applies migrations on startup. Restart the Guardian Exams API against the intended PostgreSQL database after deploying the code.

- Customer checkout: Marketplace → Cart → Checkout.
- School exam packs: Pre Order Guardian Exams → select grades and student counts → review itemized price → M-PESA checkout.
- Grade pack prices and school orders: Platform admin → Exam pricing.
- Provider readiness: Platform admin → Payments.
- Email: account registration, verification resend, password recovery and payment receipt.

## Still required before public launch

- Install the same approved Resend and Daraja credentials in the Guardian Exams server environment. Existing credentials were not copied from TrendScore/iQuote into this repository.
- Register the Guardian Exams callback URL for the Daraja application and confirm the callback can reach the deployed API.
- Run a sandbox registration/password-reset cycle and a marketplace STK Push from a signed-in test buyer. Confirm successful callback, failed callback, mismatch-to-review handling, receipt email, and seller settlement creation before changing the Daraja environment to production.
- Add Guardian Exams' MobileSasa credentials to its own server environment and verify the approved sender ID, account balance and a controlled Kenyan test phone. Credentials were not copied from TrendScore into this repository.
- Marketplace print fulfillment is connected: sellers upload private PDF/ZIP print masters, admins retrieve them from paid orders, update print/dispatch states, and record courier tracking. This does not assign a delivery run automatically or integrate directly with a courier API.
- Marketplace WhatsApp order updates send only to buyers who opted in and only when `WHATSAPP_ORDER_WEBHOOK_URL` and `WHATSAPP_ORDER_WEBHOOK_TOKEN` point to the separately hosted WhatsApp service. No WhatsApp service is provisioned by this repository.
- Teacher payout approvals remain internal and do not send Daraja B2C payments.
- Mount persistent storage at `/data/marketplace-files` (or configure `MARKETPLACE_FILES_DIR`) in the API container. Keep this directory private and include it in backups; marketplace files are print masters, not buyer downloads.
- Move process-local rate limits to shared storage before running multiple API replicas, and review callback logging, CSRF protections, data retention, operational alerts and reconciliation procedures.
