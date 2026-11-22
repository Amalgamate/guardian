# Guardian Exams live integrations

## Implemented in this milestone

- Resend delivery for account verification and password reset codes. A welcome email is sent after email verification; a payment receipt is sent after a successful marketplace M-PESA callback.
- MobileSasa SMS for phone verification, password-reset codes and paid marketplace order receipts, using TrendScore's bearer-authenticated `/v1/send/bulk` request and `responseCode=0200` acceptance rule.
- Safaricom Daraja STK Push for signed-in Learner and Parent marketplace orders. Payment state is persisted in PostgreSQL, verified callbacks mark orders paid, and paid orders create the existing seller settlement and pending wallet ledger records.
- Customer checkout shows provider availability, phone entry, the pending prompt state, callback polling, retry after a confirmed failure, and an administrator-review state when callback amount, phone or receipt data does not match the order.
- Platform administrators have a Payments page that reports Resend, SMS and Daraja readiness without exposing credentials.
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

Migration `007_live_checkout.sql` adds payment references, buyer phone, error/review status and indexes to marketplace orders. The API applies it on startup. Restart the Guardian Exams API against the intended PostgreSQL database after deploying the code.

- Customer checkout: Marketplace → Cart → Checkout.
- Provider readiness: Platform admin → Payments.
- Email: account registration, verification resend, password recovery and payment receipt.

## Still required before public launch

- Install the same approved Resend and Daraja credentials in the Guardian Exams server environment. Existing credentials were not copied from TrendScore/iQuote into this repository.
- Register the Guardian Exams callback URL for the Daraja application and confirm the callback can reach the deployed API.
- Run a sandbox registration/password-reset cycle and a marketplace STK Push from a signed-in test buyer. Confirm successful callback, failed callback, mismatch-to-review handling, receipt email, and seller settlement creation before changing the Daraja environment to production.
- Add Guardian Exams' MobileSasa credentials to its own server environment and verify the approved sender ID, account balance and a controlled Kenyan test phone. Credentials were not copied from TrendScore into this repository.
- Add a separate school Guardian-series preorder/payment workflow and Daraja B2C integration for teacher withdrawals. This milestone covers approved marketplace resource purchases only; teacher payout approvals remain internal and do not send B2C payments.
- Connect uploaded exam files to buyer entitlements and secure downloads. Payment confirmation currently records the order, but the original seller file is not stored or delivered.
- Move process-local rate limits to shared storage before running multiple API replicas, and review callback logging, CSRF protections, data retention, operational alerts and reconciliation procedures.
