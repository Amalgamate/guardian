import { ArrowRight, BookOpen, GraduationCap, MessageCircle, Search, BookOpenCheck, CalendarClock, ClipboardCheck, ClipboardList, ListChecks, ClipboardPenLine, NotebookPen, ChartNoAxesCombined } from 'lucide-react'
import { assessmentTools } from './data/assessmentTools'

const footerToolIcons = [BookOpenCheck, CalendarClock, ClipboardCheck, ClipboardList, ListChecks, ClipboardPenLine, NotebookPen, ChartNoAxesCombined]

type Destination = 'home' | 'guardian-exams' | 'catalogue' | 'pricing' | 'how-it-works' | 'support' | 'assessment-tools'

type Props = { navigate: (screen: Destination) => void; onOpenTool: (id: string) => void; onPreorder: () => void; onBack: () => void; backLabel?: string }

export default function MarketplaceFooter({ navigate, onOpenTool, onPreorder, onBack, backLabel }: Props) {
  return <footer className="market-footer">
    <div className="market-footer-pattern" aria-hidden="true"/>
    <div className="market-footer-inner">
      <section className="market-footer-brand"><button className="market-footer-logo" onClick={()=>navigate('home')} aria-label="Guardian Exams home"><span className="guardian-logo-badge"><GraduationCap className="guardian-logo-cap" aria-hidden="true"/></span><span>Guardian <i>Exams</i><b>.</b></span></button><h2>Prepare well.<br/><em>Go further.</em></h2><p>Quality exam practice, useful learning tools and school resources, together in one place.</p><button className="market-footer-preorder" onClick={onPreorder}>Pre Order Guardian Exams <ArrowRight size={15}/></button></section>
      <nav className="market-footer-links" aria-label="Explore Guardian Exams"><h3>Explore</h3><button onClick={()=>navigate('guardian-exams')}>Guardian Exams</button><button onClick={()=>navigate('catalogue')}><Search size={14}/> Browse past papers</button><button onClick={()=>navigate('pricing')}>eLearning</button></nav>
      <nav className="market-footer-links market-footer-tools" aria-label="Teaching tools"><h3>Tools</h3><button className="market-footer-tools-overview" onClick={()=>navigate('assessment-tools')}><BookOpen size={14}/> Explore all tools <ArrowRight size={12}/></button><div className="market-footer-tool-list">{assessmentTools.map((tool,index)=>{const ToolIcon=footerToolIcons[index];return <button key={tool.id} onClick={()=>onOpenTool(tool.id)}><ToolIcon size={13}/>{tool.label}</button>})}</div><div className="market-footer-school-links"><button onClick={()=>navigate('how-it-works')}>How it works</button><button onClick={()=>navigate('support')}>School access</button></div></nav>
      <section className="market-footer-contact"><span className="market-footer-chat-icon"><MessageCircle size={18}/></span><h3>Here when you need us.</h3><p>Questions about papers, school orders or delivery? Open the WhatsApp chat and choose a quick help topic.</p><span className="market-footer-delivery">KSh 300 delivery countrywide</span><div className="market-footer-payment-ready"><img src="/assets/mpesa-logo.svg" alt="M-PESA"/><span><strong>M-PESA-ready checkout</strong><small>Prototype preview · live payments not connected</small></span></div></section>
      <div className="market-footer-bottom"><span>© {new Date().getFullYear()} Guardian Exams</span><span>Prototype preview · sample resources and simulated checkout</span>{backLabel && <button onClick={onBack}>{backLabel} <ArrowRight size={13}/></button>}</div>
    </div>
  </footer>
}
