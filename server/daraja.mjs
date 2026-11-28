const accessTokens = new Map()
let adminCredentialOverride = null

export function setDarajaAdminCredentials(credentials) {
  adminCredentialOverride = credentials ? { ...credentials } : null
  accessTokens.clear()
}

export function darajaConfig() {
  const source = adminCredentialOverride || {}
  const environment = source.environment || process.env.MPESA_ENVIRONMENT || 'sandbox'
  const config = {
    environment,
    baseUrl: environment === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke',
    consumerKey: source.consumerKey || process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: source.consumerSecret || process.env.MPESA_CONSUMER_SECRET || '',
    shortcode: source.shortcode || process.env.MPESA_SHORTCODE || '',
    passkey: source.passkey || process.env.MPESA_PASSKEY || '',
    callbackUrl: source.callbackUrl || process.env.MPESA_CALLBACK_URL || '',
    callbackSecret: source.callbackSecret || process.env.MPESA_CALLBACK_SECRET || '',
  }
  const configured = Boolean(config.consumerKey && config.consumerSecret && config.shortcode && config.passkey)
  return { ...config, configured, ready: ['sandbox', 'production'].includes(environment) && configured && Boolean(config.callbackUrl.startsWith('https://') && config.callbackSecret.length >= 32) }
}

export class DarajaRequestError extends Error {
  constructor(message, readonlyAmbiguous = false) {
    super(message)
    this.name = 'DarajaRequestError'
    this.ambiguous = readonlyAmbiguous
  }
}

async function getAccessToken(config) {
  const key = `${config.environment}:${config.consumerKey}`
  const cached = accessTokens.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')}` },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || typeof body.access_token !== 'string') throw new Error('Safaricom Daraja authentication failed. Check the server credentials and environment.')
  const token = { value: body.access_token, expiresAt: Date.now() + Math.max(60, Number(body.expires_in || 3600)) * 1000 }
  accessTokens.set(key, token)
  return token.value
}

function darajaTimestamp() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`
}

export function normalizeMpesaPhone(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `254${digits.slice(1)}`
  else if (digits.startsWith('7') || digits.startsWith('1')) digits = `254${digits}`
  return /^254[17]\d{8}$/.test(digits) ? digits : null
}

export async function initiateStkPush({ phone, amount, accountReference, description }) {
  const config = darajaConfig()
  if (!config.ready) throw new Error('M-PESA checkout is not configured yet. Ask the administrator to complete payment setup.')
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('M-PESA checkout requires a whole-number amount in KSh.')
  const timestamp = darajaTimestamp()
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64')
  const token = await getAccessToken(config)
  let response
  try {
    response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: config.shortcode,
      PhoneNumber: phone,
      CallBackURL: `${config.callbackUrl.replace(/\/$/, '')}/${config.callbackSecret}`,
      AccountReference: String(accountReference).slice(0, 12),
      TransactionDesc: String(description).slice(0, 13),
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new DarajaRequestError('Safaricom may have received the payment request, but the response was not confirmed. Check the order status before retrying.', true)
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new DarajaRequestError(typeof body.errorMessage === 'string' ? body.errorMessage : 'Safaricom could not confirm its response to the payment request.', response.status >= 500)
  if (body.ResponseCode !== '0') throw new DarajaRequestError(typeof body.errorMessage === 'string' ? body.errorMessage : typeof body.ResponseDescription === 'string' ? body.ResponseDescription : 'Safaricom did not accept the M-PESA payment prompt.')
  if (!body.CheckoutRequestID || !body.MerchantRequestID) throw new DarajaRequestError('Safaricom may have accepted the payment prompt, but returned no payment reference. Contact support before retrying.', true)
  return { checkoutRequestId: body.CheckoutRequestID, merchantRequestId: body.MerchantRequestID, customerMessage: body.CustomerMessage || 'Check your phone and enter your M-PESA PIN to approve payment.' }
}
