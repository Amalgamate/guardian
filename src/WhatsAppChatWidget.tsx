import { useState } from 'react'
import { ArrowUp, Check, MessageCircle, X } from 'lucide-react'

type ChatMessage = { id: number; from: 'support' | 'you'; text: string }

const quickReplies = [
  { label: 'Find an exam paper', answer: 'Browse past papers by grade, subject, curriculum, term and year. The catalogue shows the format, marking scheme and sample price before you add a paper to your cart.' },
  { label: 'School pre-order', answer: 'Use “Pre Order Guardian Exams” to share your school delivery details. The current prototype includes a KSh 300 countrywide delivery reservation and a simulated M-PESA checkout.' },
  { label: 'Delivery & payments', answer: 'The sample checkout uses an M-PESA-style prompt, but no real payment is taken. The displayed countrywide delivery fee is KSh 300.' },
]

export default function WhatsAppChatWidget() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 1, from: 'support', text: 'Hello! Welcome to Guardian Exams. What can we help you with today?' }])
  const supportNumber = (import.meta.env.VITE_WHATSAPP_SUPPORT_NUMBER ?? '').replace(/\D/g, '')

  const sendMessage = (text: string) => {
    const cleanText = text.trim()
    if (!cleanText) return
    if (supportNumber) {
      window.open(`https://wa.me/${supportNumber}?text=${encodeURIComponent(cleanText)}`, '_blank', 'noopener,noreferrer')
      setMessages((current) => [...current, { id: Date.now(), from: 'you', text: cleanText }, { id: Date.now() + 1, from: 'support', text: 'Your message is ready in WhatsApp. Our team will reply there.' }])
    } else {
      setMessages((current) => [...current, { id: Date.now(), from: 'you', text: cleanText }, { id: Date.now() + 1, from: 'support', text: 'Thanks for your message. This preview chat is ready; connect the official WhatsApp support number to send it to our team.' }])
    }
    setDraft('')
  }

  return <div className="guardian-chat-widget">
    {open && <section className="guardian-chat-panel" aria-label="Guardian Exams WhatsApp support" aria-live="polite">
      <header className="guardian-chat-head"><span className="guardian-chat-brand-icon"><MessageCircle size={21}/></span><span><strong>Guardian Exams</strong><small><i/> WhatsApp support {supportNumber ? '· online' : '· preview'}</small></span><button onClick={() => setOpen(false)} aria-label="Close WhatsApp chat"><X size={18}/></button></header>
      <div className="guardian-chat-content"><span className="guardian-chat-date">TODAY</span><div className="guardian-chat-messages">{messages.map((message) => <div key={message.id} className={`guardian-chat-bubble ${message.from==='you'?'from-you':''}`}>{message.text}<small>{message.from==='you'?'You':'Guardian Exams'} <Check size={11}/></small></div>)}</div>{messages.length===1&&<div className="guardian-chat-quick-replies"><span>QUICK HELP</span>{quickReplies.map((reply)=><button key={reply.label} onClick={()=>sendMessage(reply.label)}>{reply.label}</button>)}</div>}</div>
      <form className="guardian-chat-compose" onSubmit={(event)=>{event.preventDefault();sendMessage(draft)}}><input aria-label="Type a WhatsApp message" value={draft} onChange={(event)=>setDraft(event.target.value)} placeholder="Type your message…"/><button type="submit" aria-label="Send message" disabled={!draft.trim()}><ArrowUp size={18}/></button></form>
      {!supportNumber&&<small className="guardian-chat-demo-note">Preview chat only · no message is sent. Live WhatsApp opens when a support number is configured.</small>}
    </section>}
    <button className={`guardian-chat-launcher ${open?'is-open':''}`} aria-label={open?'Close WhatsApp support chat':'Chat with Guardian Exams on WhatsApp'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X size={24}/>:<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.1-.471-.15-.67.15-.197.297-.767.967-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.15-.174.198-.298.298-.496.1-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.051 24h-.004a11.9 11.9 0 0 1-5.684-1.448L.057 24l1.654-6.161A11.9 11.9 0 0 1 .123 11.893C.126 5.335 5.461 0 12.015 0a11.82 11.82 0 0 1 8.413 3.481 11.82 11.82 0 0 1 3.481 8.413C23.906 18.452 18.57 23.787 12.051 24zm-.036-21.984c-5.45 0-9.89 4.434-9.893 9.884 0 1.9.542 3.753 1.568 5.313l.244.374-.981 3.648 3.74-.982.362.214a9.87 9.87 0 0 0 5.031 1.378h.004a9.895 9.895 0 0 0 9.908-9.862 9.82 9.82 0 0 0-2.893-7.011 9.82 9.82 0 0 0-7.006-2.903z"/></svg>}{!open&&<span className="guardian-chat-ping"/>}</button>
  </div>
}
