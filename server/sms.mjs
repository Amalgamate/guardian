const defaultBaseUrl = 'https://api.mobilesasa.com'

export function mobileSasaReady() {
  return Boolean(process.env.MOBILESASA_API_KEY)
}

function normalizeKenyanPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`
  if (/^254[17]\d{8}$/.test(digits)) return digits
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`
  throw new Error('Enter a valid Kenyan mobile number.')
}

export async function sendGuardianSms({ to, message }) {
  const apiKey = process.env.MOBILESASA_API_KEY
  const senderId = (process.env.MOBILESASA_SENDER_ID || 'MOBILESASA').trim()
  if (!apiKey) throw new Error('SMS verification is not configured. Add the MobileSasa API key on the server.')

  const baseUrl = (process.env.MOBILESASA_BASE_URL || defaultBaseUrl).replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/v1/send/bulk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ senderID: senderId, message, phones: normalizeKenyanPhone(to) }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.responseCode !== '0200') {
    console.error(`MobileSasa OTP delivery returned HTTP ${response.status}, response code ${body.responseCode || 'unknown'}.`)
    throw new Error('We could not deliver the SMS code. Check MobileSasa configuration and try again.')
  }
  return { messageId: body.messageId || null }
}

export async function sendGuardianOtpSms({ to, code, purpose, challengeId }) {
  const action = purpose === 'password_reset' ? 'reset your Guardian Exams password' : 'verify your Guardian Exams account'
  const result = await sendGuardianSms({
    to,
    message: `Guardian Exams: use ${code} to ${action}. It expires in 10 minutes. If you did not request this code, ignore this SMS. Ref ${challengeId.slice(0, 8)}`,
  })
  return result
}

export async function sendGuardianPaymentReceiptSms({ to, orderId, receipt, amountKes }) {
  return sendGuardianSms({
    to,
    message: `Guardian Exams: payment received for order ${orderId.slice(0, 8)}. Amount KSh ${Number(amountKes).toLocaleString('en-KE')}; M-PESA receipt ${receipt}. Thank you.`,
  })
}
