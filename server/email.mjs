const apiUrl = 'https://api.resend.com/emails'

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

export function resendReady() {
  return Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || process.env.BILLING_FROM_EMAIL))
}

async function sendEmail({ to, subject, text, html, idempotencyKey }) {
  const key = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || process.env.BILLING_FROM_EMAIL
  if (!key || !fromEmail) throw new Error('Email verification is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL on the server.')
  const fromName = String(process.env.RESEND_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Guardian Exams').replace(/[<>\r\n]/g, '').trim()
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    console.error(`Resend OTP delivery returned HTTP ${response.status}.`)
    throw new Error('We could not deliver the verification email. Check the sender configuration and try again.')
  }
  return response.json().catch(() => ({}))
}

export async function sendGuardianOtp({ to, code, purpose, challengeId }) {
  const title = purpose === 'password_reset' ? 'Reset your Guardian Exams password' : 'Verify your Guardian Exams account'
  const safeCode = escapeHtml(code)
  await sendEmail({
    to,
    subject: title,
    idempotencyKey: `guardian-otp-${challengeId}`,
    text: `Your Guardian Exams verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#10243b"><main style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dfe7f1;border-radius:16px"><p style="margin:0 0 16px;color:#2457d6;font-weight:700">GUARDIAN EXAMS</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(title)}</h1><p style="color:#53677e;line-height:1.6">Use this one-time code to continue. It expires in 10 minutes.</p><p style="display:inline-block;padding:14px 22px;background:#eef4ff;border-radius:12px;font-size:30px;letter-spacing:8px;font-weight:700;color:#173c9e">${safeCode}</p><p style="color:#738399;font-size:13px;line-height:1.6">If you did not request this code, ignore this message. Guardian Exams will never ask you to share your code.</p></main></body></html>`,
  })
}

export async function sendGuardianWelcome({ to, name, userId }) {
  const safeName = escapeHtml(name)
  await sendEmail({
    to,
    subject: 'Welcome to Guardian Exams',
    idempotencyKey: `guardian-welcome-${userId}`,
    text: `Welcome to Guardian Exams, ${name}. Your account is verified and ready to use.`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#10243b"><main style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dfe7f1;border-radius:16px"><p style="color:#2457d6;font-weight:700">GUARDIAN EXAMS</p><h1>Welcome, ${safeName}.</h1><p style="color:#53677e;line-height:1.6">Your account is verified and ready. Sign in to explore approved exam resources and learning tools.</p></main></body></html>`,
  })
}

export async function sendGuardianOrderReceipt({ to, orderId, receipt, amountKes }) {
  const safeOrderId = escapeHtml(orderId)
  const safeReceipt = escapeHtml(receipt)
  const amount = Number(amountKes).toLocaleString('en-KE')
  await sendEmail({
    to,
    subject: 'M-PESA payment confirmed · Guardian Exams',
    idempotencyKey: `guardian-payment-${orderId}`,
    text: `Your Guardian Exams order ${orderId} payment was confirmed. M-PESA receipt: ${receipt}. Amount: KSh ${amount}.`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#10243b"><main style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dfe7f1;border-radius:16px"><p style="color:#168b57;font-weight:700">PAYMENT CONFIRMED</p><h1>Thank you for your order.</h1><p>Your M-PESA payment has been confirmed.</p><p><strong>Order:</strong> ${safeOrderId}<br/><strong>Receipt:</strong> ${safeReceipt}<br/><strong>Amount:</strong> KSh ${amount}</p><p style="color:#53677e;line-height:1.6">Open Guardian Exams to review your order and available resources.</p></main></body></html>`,
  })
}
