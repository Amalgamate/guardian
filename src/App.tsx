import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Bell, BookOpen, CheckCircle2, Check, ChevronDown, CircleHelp, GraduationCap, LayoutDashboard, LockKeyhole, ShoppingBag, ShoppingCart, Sparkles, UserRound, X } from 'lucide-react'
import Marketplace from './Marketplace'
import Workspace from './Workspace'
import AuthFlow from './AuthFlow'
import { authApi, type AuthSession } from './authApi'

function Wordmark({ inverse = false }: { inverse?: boolean }) {
  return <span className={`wordmark ${inverse ? 'wordmark-inverse' : ''}`}><span className="wordmark-name"><span className="wordmark-cap-badge"><GraduationCap className="wordmark-cap" aria-hidden="true"/></span><span className="wordmark-guardian">Guardian</span> <span className="wordmark-exams">Exams</span></span><span className="wordmark-period">.</span></span>
}

function Avatar({ initials, tone = 'blue', size = 'md', online = false, label }: { initials: string; tone?: string; size?: 'sm' | 'md' | 'lg'; online?: boolean; label?: string }) {
  return <span className={`avatar avatar-${tone} avatar-${size}`} role="img" aria-label={label ?? initials}>{initials}{online && <i className="avatar-presence" aria-label="Online"/>}</span>
}

function App() {
  useEffect(() => {
    const preloader = document.getElementById('app-preloader')
    if (!preloader) return
    const fadeTimer = window.setTimeout(() => {
      preloader.classList.add('is-hidden')
      window.setTimeout(() => preloader.remove(), 300)
    }, 320)
    return () => window.clearTimeout(fadeTimer)
  }, [])
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'info' | 'warning' | 'error' } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [readNotifications, setReadNotifications] = useState<string[]>([])
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('examify-welcome-dismissed') !== 'true')
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [profileMenu, setProfileMenu] = useState(false)
  const [fontScale] = useState<'standard' | 'large'>(() => localStorage.getItem('examify-font-scale') === 'large' ? 'large' : 'standard')
  const [marketplaceOpen, setMarketplaceOpen] = useState(true)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceMarketplace, setWorkspaceMarketplace] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authSession, setAuthSession] = useState<AuthSession>()
  useEffect(() => {
    let current = true
    authApi.me().then((session) => { if (current) setAuthSession(session) }).catch(() => {})
    return () => { current = false }
  }, [])
  const fontStyle = { '--type-scale': fontScale === 'large' ? 1.2 : 1 } as CSSProperties
  const tourSteps = [
    { title: 'Find the right paper', text: 'Browse by curriculum, grade, subject and year. Paper cards show what is included before you choose.' },
    { title: 'Practise at your pace', text: 'Start a practice paper, save answers and return to your learning library whenever you need.' },
    { title: 'See your progress', text: 'Review results by subject, spot topics to revisit, and choose a useful next step.' },
  ]
  const dismissWelcome = () => {
    setShowWelcome(false)
    localStorage.setItem('examify-welcome-dismissed', 'true')
  }
  const startTour = () => {
    dismissWelcome()
    setTourStep(0)
  }
  const announce = (message: string, tone: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    window.clearTimeout(toastTimer.current)
    setToast({ message, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), 3600)
  }
  const notificationItems = [
    { id: 'progress', title: 'Your weekly progress is ready', detail: 'You completed 4 of 5 planned sessions.', time: 'Today · 9:42 am', tone: 'teal' },
    { id: 'paper', title: 'A new Mathematics paper is available', detail: 'Grade 8 · Term 2 · Practice + marking scheme', time: 'Yesterday · 4:10 pm', tone: 'blue' },
    { id: 'streak', title: 'You’re on a 5-day learning streak', detail: 'A little practice today keeps it going.', time: 'Yesterday · 8:00 am', tone: 'gold' },
  ]
  const unreadNotifications = notificationItems.filter((item) => !readNotifications.includes(item.id)).length

  if (authOpen) return <AuthFlow onBack={() => setAuthOpen(false)} onComplete={(session) => { setAuthSession(session); setAuthOpen(false); setWorkspaceOpen(true) }} />
  if (marketplaceOpen) return <Marketplace session={authSession} backLabel={workspaceMarketplace ? 'Return to workspace' : 'Back to home'} onSignIn={() => { setMarketplaceOpen(false); setAuthOpen(true) }} onBack={() => { setMarketplaceOpen(false); if (workspaceMarketplace) { setWorkspaceOpen(true); setWorkspaceMarketplace(false) } }} />
  if (workspaceOpen) return <Workspace session={authSession} onLogout={() => { void authApi.logout().catch(() => {}).finally(() => { setAuthSession(undefined); setWorkspaceOpen(false); setAuthOpen(true) }) }} onMarketplace={() => { setWorkspaceOpen(false); setWorkspaceMarketplace(true); setMarketplaceOpen(true) }} />

  return <div className="app-shell" style={fontStyle}>
    <header className="topbar">
      <a className="brand-link" href="#top" aria-label="Guardian Exams home"><Wordmark /></a>
      <div className="topbar-center"><span className="prototype-pill"><span /> Full product prototype</span></div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="Help and product tour" title="Help and product tour" onClick={() => {setProfileMenu(false);setShowWelcome(true)}}><CircleHelp size={18}/></button>
        <div className="notification-wrap"><button className="icon-button notification-button" aria-label={`Notifications, ${unreadNotifications} unread`} aria-expanded={notificationsOpen} aria-controls="notification-panel" onClick={() => {setNotificationsOpen(!notificationsOpen);setProfileMenu(false)}}><Bell size={18}/>{unreadNotifications>0&&<i />}</button>{notificationsOpen&&<div className="notification-panel" id="notification-panel" role="dialog" aria-label="Notifications"><div className="notification-panel-head"><span><strong>Notifications</strong><small>{unreadNotifications?`${unreadNotifications} unread`:'You’re all caught up'}</small></span><button disabled={!unreadNotifications} onClick={()=>setReadNotifications(notificationItems.map((item)=>item.id))}>Mark all read</button></div><div className="notification-list">{notificationItems.map((item)=>{const isRead=readNotifications.includes(item.id);return <button key={item.id} className={`notification-item ${isRead?'is-read':''}`} onClick={()=>{setReadNotifications((items)=>items.includes(item.id)?items:[...items,item.id]);setNotificationsOpen(false);announce(item.detail,'info')}}><span className={`notification-type-icon notification-${item.tone}`}>{item.tone==='teal'?<CheckCircle2 size={16}/>:item.tone==='blue'?<BookOpen size={16}/>:<Sparkles size={16}/>}</span><span className="notification-item-copy"><strong>{item.title}</strong><small>{item.detail}</small><time>{item.time}</time></span>{!isRead&&<i className="notification-unread-dot"/>}</button>})}</div><div className="notification-panel-foot">Sample in-app notifications · prototype only</div></div>}</div>
        <div className="profile-menu-wrap"><button className="profile-trigger" aria-expanded={profileMenu} onClick={() => setProfileMenu(!profileMenu)}><Avatar initials="JM" size="sm" tone="blue" label="Jane Mwangi"/><span className="profile-name">Jane Mwangi</span><ChevronDown size={15} className="muted-icon"/></button>{profileMenu && <div className="profile-popover"><div className="profile-popover-head"><Avatar initials="JM" size="md" tone="blue"/><span><strong>Jane Mwangi</strong><small>Learner · Grade 8</small></span></div><button onClick={() => {setProfileMenu(false);setWorkspaceOpen(true)}}><UserRound size={15}/> My workspace</button><button onClick={() => {setProfileMenu(false);setMarketplaceOpen(true)}}><ShoppingBag size={15}/> Browse past papers</button><button onClick={() => {setProfileMenu(false);setAuthOpen(true)}}><LockKeyhole size={15}/> Sign in / Register</button></div>}</div>
      </div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="workspace-label">EXPLORE</div>
        <div className="nav-group">
          <button onClick={() => setMarketplaceOpen(true)} className="nav-item"><ShoppingCart size={17}/> Marketplace</button>
          <button onClick={() => setWorkspaceOpen(true)} className="nav-item"><LayoutDashboard size={17}/> Learner workspace</button>
          <button onClick={() => setAuthOpen(true)} className="nav-item"><BookOpen size={17}/> Sign in</button>
        </div>
        <div className="sidebar-bottom"><div className="sidebar-note"><span className="note-icon"><Sparkles size={15}/></span><strong>Built for progress</strong><p>A clear, focused space for every learner.</p><button onClick={() => setWorkspaceOpen(true)}>Explore the vision <ArrowRight size={14}/></button></div><div className="sidebar-foot"><span className="status-dot"/> Prototype environment <span className="version">v0.1</span></div></div>
      </aside>

      <main id="top" className="main-content">
        <div className="page-heading"><div><div className="eyebrow">GUARDIAN EXAMS</div><h1>Prepare. Practise. Perform.</h1><p className="page-subtitle">Quality exam papers, interactive practice, and clear progress — for learners, families and educators.</p></div><button className="button button-primary" onClick={() => setMarketplaceOpen(true)}>Browse past papers <ArrowRight size={16}/></button></div>
        {showWelcome && <section className="first-visit-card" aria-label="Welcome guide"><div className="welcome-mark"><Sparkles size={18}/></div><div className="welcome-copy"><strong>Welcome to Guardian Exams</strong><p>Find a paper, practise with confidence, and see how you’re progressing.</p></div><div className="welcome-actions"><button className="button button-gold" onClick={startTour}>Show me around <ArrowRight size={15}/></button><button className="welcome-dismiss" onClick={dismissWelcome}>Skip for now</button></div><button className="welcome-close" aria-label="Dismiss welcome guide" onClick={dismissWelcome}><X size={15}/></button></section>}
        <section className="hero-panel">
          <div className="hero-copy"><span className="overline"><span className="tiny-check"><Check size={12}/></span> PREPARE. PRACTISE. PERFORM.</span><h2>A calmer way to<br/>make progress.</h2><p>Thoughtful tools for learners, families and educators—grounded in clarity, built around confidence.</p><div className="hero-actions"><button className="button button-primary" onClick={() => setMarketplaceOpen(true)}>Explore papers <ShoppingCart size={15}/></button><button className="button button-gold" onClick={() => setWorkspaceOpen(true)}>Open workspace <ArrowRight size={16}/></button></div></div>
          <div className="hero-preview"><div className="preview-top"><span className="preview-label">YOUR LEARNING SNAPSHOT</span><span className="live-tag"><i/> ON TRACK</span></div><div className="preview-greeting">Good morning, Jane <span>☀</span></div><div className="preview-sub">A little progress adds up.</div><div className="progress-card"><div className="progress-head"><span>This week</span><strong>4 of 5 sessions</strong></div><div className="progress-track"><div/></div><div className="progress-foot"><span>Weekly learning goal</span><b>80%</b></div></div><div className="preview-stat-row"><div><span>Practice time</span><strong>2h 35m</strong></div><div><span>Current streak</span><strong>5 days <i>↗</i></strong></div></div><div className="preview-sparkline"><span/><span/><span/><span/><span/><span/><span/></div></div>
        </section>

        <footer className="page-footer"><Wordmark/><span>Prepare. Practise. Perform.</span><span className="footer-right">Interactive prototype</span></footer>
      </main>
    </div>
    {toast && <div className={`toast toast-${toast.tone}`} role={toast.tone==='error'?'alert':'status'} aria-live={toast.tone==='error'?'assertive':'polite'}><span className="toast-symbol">{toast.tone==='success'?<CheckCircle2 size={17}/>:toast.tone==='info'?<CircleHelp size={17}/>:toast.tone==='warning'?<CircleHelp size={17}/>:<X size={17}/>}</span><span className="toast-message">{toast.message}</span><button aria-label="Dismiss message" onClick={() => {window.clearTimeout(toastTimer.current);setToast(null)}}><X size={15}/></button><i className="toast-lifetime"/></div>}
    {tourStep !== null && <div className="modal-backdrop tour-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTourStep(null) }}><div className="tour-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-title"><button className="modal-close" aria-label="Close tour" onClick={() => setTourStep(null)}><X size={18}/></button><div className="tour-icon"><Sparkles size={19}/></div><div className="eyebrow">A QUICK TOUR · {tourStep+1} OF {tourSteps.length}</div><h2 id="tour-title">{tourSteps[tourStep].title}</h2><p>{tourSteps[tourStep].text}</p><div className="tour-progress">{tourSteps.map((_,index)=><i key={index} className={index<=tourStep?'tour-step-done':''}/>)}</div><div className="tour-actions">{tourStep>0 && <button className="button button-secondary" onClick={()=>setTourStep(tourStep-1)}>Back</button>}<button className="button button-gold" onClick={()=>tourStep===tourSteps.length-1?setTourStep(null):setTourStep(tourStep+1)}>{tourStep===tourSteps.length-1?'Finish tour':'Next'} <ArrowRight size={14}/></button></div></div></div>}
  </div>
}

export default App
