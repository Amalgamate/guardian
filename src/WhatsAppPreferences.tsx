import { useState } from 'react'
import { Bell, Check, MessageCircle, ShieldCheck, ShoppingBag, WalletCards } from 'lucide-react'
import './whatsapp-preferences.css'

type Props = { role: string; onNotify: (message: string) => void }
const baseTopics = ['Account and exam reminders', 'Order and delivery updates', 'Results and learning updates']

export default function WhatsAppPreferences({ role, onNotify }: Props) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('guardian-whatsapp-enabled') === 'true')
  const [phone, setPhone] = useState(() => localStorage.getItem('guardian-whatsapp-phone') || '')
  const [topics, setTopics] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('guardian-whatsapp-topics') || JSON.stringify(baseTopics)) as string[] }
    catch { return baseTopics }
  })
  const isTeacher = role === 'Teacher'
  const isSchool = role === 'School admin'
  const isPlatformAdmin = role === 'Platform admin'
  const visibleTopics = [...baseTopics, ...(isTeacher ? ['Content purchases and earnings'] : []), ...(isSchool ? ['School announcements and reports'] : [])]

  const save = () => {
    if (enabled && !phone.trim()) {
      onNotify('Add a WhatsApp number before enabling messages.')
      return
    }
    localStorage.setItem('guardian-whatsapp-enabled', String(enabled))
    localStorage.setItem('guardian-whatsapp-phone', phone.trim())
    localStorage.setItem('guardian-whatsapp-topics', JSON.stringify(topics))
    onNotify('WhatsApp preferences saved on this device. No message was sent.')
  }

  const toggleTopic = (topic: string) => setTopics((current) => current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic])

  return <section className="ws-whatsapp-card" aria-labelledby="ws-whatsapp-heading">
    <div className="ws-whatsapp-head"><span className="ws-whatsapp-icon"><MessageCircle size={19}/></span><div><span className="ws-whatsapp-kicker">MESSAGE PREFERENCES</span><h3 id="ws-whatsapp-heading">WhatsApp updates</h3><p>Choose which useful updates you’d like to receive on WhatsApp.</p></div><label className="ws-whatsapp-master"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)}/><span>{enabled ? 'On' : 'Off'}</span></label></div>
    <label className="ws-whatsapp-phone">WhatsApp number<input type="tel" inputMode="tel" autoComplete="tel" placeholder="+254 7XX XXX XXX" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={!enabled}/></label>
    <div className="ws-whatsapp-topics"><strong>Send me updates about</strong>{visibleTopics.map((topic, index) => <label key={topic}><span className={`ws-whatsapp-topic-icon tone-${index % 3}`}>{index === 1 ? <ShoppingBag size={15}/> : index === 3 ? <WalletCards size={15}/> : <Bell size={15}/>}</span><span>{topic}</span><input type="checkbox" checked={topics.includes(topic)} disabled={!enabled} onChange={() => toggleTopic(topic)}/></label>)}</div>
    {isPlatformAdmin && <div className="ws-baileys-status"><span className="ws-baileys-icon"><ShieldCheck size={16}/></span><span><strong>WhatsApp gateway · Baileys</strong><small>Not connected · prototype status only. The future server adapter can handle approved message delivery.</small></span><b>Demo</b></div>}
    <div className="ws-whatsapp-foot"><span><ShieldCheck size={14}/> Opt-in can be changed any time. Prototype only; no WhatsApp message is sent.</span><button className="ws-button ws-primary" onClick={save}><Check size={14}/> Save preferences</button></div>
  </section>
}
