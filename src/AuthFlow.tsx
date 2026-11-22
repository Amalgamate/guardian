import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Smartphone, GraduationCap } from 'lucide-react'
import { authApi, AuthApiError, type AuthSession, type UserRole } from './authApi'
import './auth.css'

type Screen = 'login' | 'register' | 'forgot' | 'otp' | 'reset' | 'done'
type Method = 'Email' | 'SMS'

const accountRoles: UserRole[] = ['Learner', 'Parent', 'Teacher', 'School admin', 'Examiner', 'Platform admin']

export default function AuthFlow({ onComplete, onBack, initialScreen = 'login' }: { onComplete: (session?: AuthSession) => void; onBack: () => void; initialScreen?: Screen }) {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [method, setMethod] = useState<Method>('Email')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [flow, setFlow] = useState<'register' | 'forgot'>('forgot')
  const [completeMessage, setCompleteMessage] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [deliveryMode, setDeliveryMode] = useState<'email' | 'sms' | 'console'>('console')
  const [resetToken, setResetToken] = useState('')
  const [invitationToken, setInvitationToken] = useState(() => new URLSearchParams(window.location.search).get('invite') || '')
  const [accountRole, setAccountRole] = useState<UserRole>('Learner')
  const [pendingSession, setPendingSession] = useState<AuthSession | undefined>()
  const [doneAction, setDoneAction] = useState<'workspace' | 'login'>('workspace')
  const destination = method === 'Email' ? email || 'your email address' : phone || 'your Kenyan mobile number'
  const channel = method === 'Email' ? 'email' as const : 'sms' as const
  const clearStatus = () => { setError(''); setNotice('') }
  const showError = (reason: unknown) => setError(reason instanceof AuthApiError ? reason.message : 'The authentication request failed. Please try again.')
  const beginOtp = (nextFlow: 'register' | 'forgot', nextChallengeId: string) => { setError(''); setFlow(nextFlow); setChallengeId(nextChallengeId); setCode(''); setScreen('otp') }

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault(); clearStatus()
    try {
      const session = await authApi.login(email.trim(), password)
      setPendingSession(session)
      setCompleteMessage(`You are signed in as ${session.user.fullName}.`)
      setDoneAction('workspace')
      setScreen('done')
    } catch (reason) {
      if (reason instanceof AuthApiError && reason.code === 'CONTACT_VERIFICATION_REQUIRED' && typeof reason.data.challengeId === 'string') {
        setMethod(reason.data.channel === 'sms' ? 'SMS' : 'Email')
      setNotice(reason.data.deliveryMode === 'email' ? 'We emailed you a verification code.' : reason.data.deliveryMode === 'sms' ? 'We sent you a verification code by SMS.' : 'Your local verification code is in the API terminal.')
      setDeliveryMode(reason.data.deliveryMode === 'email' || reason.data.deliveryMode === 'sms' ? reason.data.deliveryMode : 'console')
        beginOtp('register', reason.data.challengeId)
      } else showError(reason)
    }
  }

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault(); clearStatus()
    if (password.length < 12) { setError('Use at least 12 characters for your password.'); return }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return }
    try {
      const challenge = await authApi.register({
        fullName: name,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        role: accountRole,
        channel,
        invitationToken: invitationToken.trim() || undefined,
      })
      setDeliveryMode(challenge.deliveryMode || 'console')
      setNotice(challenge.deliveryMode === 'email' ? 'We emailed you a verification code.' : challenge.deliveryMode === 'sms' ? 'We sent you a verification code by SMS.' : 'Your local verification code is in the API terminal.')
      beginOtp('register', challenge.challengeId)
    } catch (reason) { showError(reason) }
  }

  const submitForgot = async (event: FormEvent) => {
    event.preventDefault(); clearStatus()
    const identifier = method === 'Email' ? email.trim() : phone.trim()
    try {
      const response = await authApi.forgot(identifier, channel)
      setDeliveryMode(response.deliveryMode || 'console')
      setNotice(response.deliveryMode === 'email' ? 'If the account matches, a reset code has been emailed.' : response.deliveryMode === 'sms' ? 'If the account matches, a reset code has been sent by SMS.' : 'If the account matches, a local reset code is in the API terminal.')
      beginOtp('forgot', response.challengeId)
    } catch (reason) { showError(reason) }
  }

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault(); clearStatus()
    try {
      if (flow === 'register') {
        const session = await authApi.verify(challengeId, code)
        setPendingSession(session)
        setCompleteMessage(`Your ${session.activeRole.toLowerCase()} account is verified and ready.`)
        setDoneAction('workspace')
        setScreen('done')
      } else {
        const result = await authApi.verifyReset(challengeId, code)
        setResetToken(result.resetToken)
        setPassword(''); setConfirmPassword(''); setScreen('reset')
      }
    } catch (reason) { showError(reason) }
  }

  const submitReset = async (event: FormEvent) => {
    event.preventDefault(); clearStatus()
    if (password.length < 12) { setError('Use at least 12 characters for your password.'); return }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return }
    try {
      const result = await authApi.reset(resetToken, password)
      setCompleteMessage(result.message)
      setPendingSession(undefined)
      setDoneAction('login')
      setScreen('done')
    } catch (reason) { showError(reason) }
  }

  const title = screen === 'login' ? 'Welcome back' : screen === 'register' ? 'Create your account' : screen === 'forgot' ? 'Reset your password' : screen === 'otp' ? 'Verify your contact' : screen === 'reset' ? 'Choose a new password' : 'You’re all set'
  const finish = () => {
    if (doneAction === 'login') { setScreen('login'); clearStatus(); setPassword(''); return }
    if (pendingSession) onComplete(pendingSession)
    else onComplete()
  }

  return <main className="auth-shell"><header className="auth-header"><button className="auth-brand" onClick={onBack} aria-label="Return to the prototype"><strong><span className="guardian-logo-badge"><GraduationCap className="guardian-logo-cap" aria-hidden="true"/></span>Guardian <em>Exams</em><span>.</span></strong><small>Prepare. Practise. Perform.</small></button><span className="auth-demo-badge"><i/> Secure account access</span></header><div className="auth-layout"><section className="auth-story"><span className="auth-mark"><ShieldCheck size={23}/></span><span className="auth-eyebrow">YOUR LEARNING, ALL IN ONE PLACE</span><h1>Prepare with confidence.</h1><p>Sign in to continue learning, explore your resources and follow your progress.</p><div className="auth-trust-list"><span><Check size={15}/> Separate access for all six product roles</span><span><Check size={15}/> Email or SMS verification flow</span><span><Check size={15}/> Sessions can be revoked securely</span></div><div className="auth-story-note"><LockKeyhole size={16}/><span>Use a unique password. Resend delivers email codes; MobileSasa delivers SMS codes when configured.</span></div></section><section className="auth-card"><button className="auth-back" onClick={() => screen === 'login' || screen === 'register' ? onBack() : setScreen('login')}><ArrowLeft size={15}/>{screen === 'login' || screen === 'register' ? 'Back to Guardian Exams' : 'Back to sign in'}</button><div className="auth-card-heading"><span className="auth-eyebrow">GUARDIAN EXAMS ACCOUNT</span><h2>{title}</h2><p>{screen === 'login' ? 'Sign in with your verified email or Kenyan mobile number.' : screen === 'register' ? 'Create a Learner or Parent account. Staff roles require an administrator invitation.' : screen === 'forgot' ? 'Choose where to receive a password reset code.' : screen === 'otp' ? `Enter the 6-digit code for ${destination}.` : screen === 'reset' ? 'Choose a new password for your account.' : 'Continue to Guardian Exams.'}</p></div>
      {screen === 'login' && <form className="auth-form" onSubmit={submitLogin}><label>Email or Kenyan phone number<input required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com or 0712 345 678"/></label><label>Password<span className="auth-password-wrap"><input required autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label><div className="auth-form-row"><label className="auth-checkbox"><input type="checkbox"/> Remember me on this device</label><button type="button" className="auth-link" onClick={() => { clearStatus(); setScreen('forgot') }}>Forgot password?</button></div><button className="auth-submit" type="submit">Sign in <ArrowRight size={16}/></button><div className="auth-divider"><span>or</span></div><button type="button" className="auth-demo-signin" onClick={() => { setCompleteMessage('Opening the sample learner workspace. This preview does not sign you in.'); setPendingSession(undefined); setDoneAction('workspace'); setScreen('done') }}>Preview sample workspace</button><p className="auth-switch">New to Guardian Exams? <button type="button" className="auth-link" onClick={() => { clearStatus(); setScreen('register') }}>Create an account</button></p></form>}
      {screen === 'register' && <form className="auth-form" onSubmit={submitRegister}><label>Full name<input required autoComplete="name" minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"/></label><label>Email address<input required={method === 'Email'} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Kenyan mobile number<input required={method === 'SMS'} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678"/></label><label>Account role<select value={accountRole} onChange={(e) => setAccountRole(e.target.value as UserRole)}>{accountRoles.map((role) => <option key={role}>{role}</option>)}</select></label><label>Administrator invitation token (for staff roles)<input autoComplete="off" value={invitationToken} onChange={(e) => setInvitationToken(e.target.value)} placeholder="Paste your invitation token"/></label><div className="auth-methods"><span>Verify with</span><button type="button" className={method === 'Email' ? 'selected' : ''} onClick={() => setMethod('Email')}><Mail size={15}/> Email</button><button type="button" className={method === 'SMS' ? 'selected' : ''} onClick={() => setMethod('SMS')}><Smartphone size={15}/> SMS</button></div><small className="auth-help-note">Email codes use Resend. SMS codes use MobileSasa when configured.</small><label>Password<input required autoComplete="new-password" type="password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters"/></label><label>Confirm password<input required autoComplete="new-password" type="password" minLength={12} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password"/></label><button className="auth-submit" type="submit">Create account <ArrowRight size={16}/></button><p className="auth-switch">Already have an account? <button type="button" className="auth-link" onClick={() => setScreen('login')}>Sign in</button></p></form>}
      {screen === 'forgot' && <form className="auth-form" onSubmit={submitForgot}><div className="auth-methods"><span>Send code by</span><button type="button" className={method === 'Email' ? 'selected' : ''} onClick={() => setMethod('Email')}><Mail size={15}/> Email</button><button type="button" className={method === 'SMS' ? 'selected' : ''} onClick={() => setMethod('SMS')}><Smartphone size={15}/> SMS</button></div>{method === 'Email' ? <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label> : <label>Kenyan mobile number<input required type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678"/></label>}<button className="auth-submit" type="submit">Send reset code <ArrowRight size={16}/></button><small className="auth-help-note">Email codes use Resend. SMS codes use MobileSasa when configured.</small></form>}
      {screen === 'otp' && <form className="auth-form" onSubmit={submitOtp}><div className="auth-otp-destination">{method === 'Email' ? <Mail size={18}/> : <Smartphone size={18}/>}<span><strong>{method === 'Email' ? 'Email verification' : 'SMS verification'}</strong><small>{destination}</small></span></div><label>6-digit verification code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter your code"/></label><div className="auth-demo-code"><strong>{deliveryMode === 'email' ? 'Check your email' : deliveryMode === 'sms' ? 'Check your messages' : 'Check the API terminal'}</strong><span>Codes expire after 10 minutes and are limited to five attempts.</span></div><button className="auth-submit" type="submit">Verify code <ArrowRight size={16}/></button><button type="button" className="auth-resend" onClick={async () => { clearStatus(); try { const result = await authApi.resend(challengeId); setChallengeId(result.challengeId); setDeliveryMode(result.deliveryMode || 'console'); setCode(''); setNotice(result.deliveryMode === 'email' ? 'A new code has been emailed.' : result.deliveryMode === 'sms' ? 'A new code has been sent by SMS.' : 'A new local code was generated. Check the API terminal.') } catch (reason) { showError(reason) } }}>Resend code</button>{notice && <small className="auth-notice">{notice}</small>}</form>}
      {screen === 'reset' && <form className="auth-form" onSubmit={submitReset}><label>New password<input required autoComplete="new-password" type="password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters"/></label><label>Confirm new password<input required autoComplete="new-password" type="password" minLength={12} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password"/></label><button className="auth-submit" type="submit">Save new password <ArrowRight size={16}/></button><small className="auth-help-note">Existing sessions will be signed out after a password reset.</small></form>}
      {screen === 'done' && <div className="auth-complete"><span><Check size={22}/></span><p>{completeMessage}</p><button className="auth-submit" onClick={finish}>{doneAction === 'login' ? 'Return to sign in' : 'Continue'} <ArrowRight size={16}/></button></div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && screen !== 'otp' && <p className="auth-notice" role="status">{notice}</p>}
      <div className="auth-security-note"><LockKeyhole size={13}/> Secure API authentication · email through Resend when configured</div>
    </section></div><footer className="auth-footer"><button onClick={onBack}>Return to prototype</button><span>Guardian Exams · Prepare. Practise. Perform.</span></footer></main>
}
