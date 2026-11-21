import { ArrowRight, Bell, BookOpen, Check, GraduationCap, Sparkles } from 'lucide-react'

type Props = { browsePastPapers: () => void; openReminder: () => void; openGuide: () => void }

export default function GuardianExamsPage({ browsePastPapers, openReminder, openGuide }: Props) {
  return <main className="guardian-exams-page">
    <div className="market-breadcrumb"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Home</button><span>/</span><strong>Guardian Exams</strong></div>
    <section className="guardian-exams-hero">
      <div className="guardian-exams-hero-copy"><span className="guardian-exams-eyebrow"><GraduationCap size={16}/> PREPARE · PRACTISE · PERFORM</span><h1>Guardian Exams</h1><p>Quality past papers and purposeful practice to help every learner feel ready for what comes next.</p><div className="guardian-exams-hero-actions"><button className="button button-primary" onClick={browsePastPapers}>Browse past papers <ArrowRight size={16}/></button><button className="guardian-exams-secondary" onClick={openGuide}>How it works <ArrowRight size={15}/></button></div><div className="guardian-exams-proof"><span><Check size={14}/> CBC and 8-4-4 resources</span><span><Check size={14}/> Clear paper details</span></div></div>
      <div className="guardian-exams-hero-art" aria-hidden="true"><span className="guardian-exams-orbit orbit-a"/><span className="guardian-exams-orbit orbit-b"/><span className="guardian-exams-cap"><GraduationCap size={76}/></span><span className="guardian-exams-art-dot dot-a"/><span className="guardian-exams-art-dot dot-b"/></div>
    </section>
    <section className="guardian-exams-upcoming"><div className="guardian-upcoming-icon"><Sparkles size={20}/></div><div className="guardian-upcoming-copy"><span className="guardian-upcoming-kicker">UPCOMING EXAM SERIES</span><h2>2027 Term 1 Midterm Exam</h2><p>Release details are coming soon. Save a reminder to hear when this series is announced.</p></div><button className="guardian-upcoming-button" onClick={openReminder}><Bell size={16}/> Remind me</button></section>
    <section className="guardian-exams-sections"><article><span className="guardian-exams-section-icon blue"><BookOpen size={20}/></span><span className="market-eyebrow">PAST PAPERS</span><h2>Find the right paper</h2><p>Browse by curriculum, grade, subject, year and exam type. See formats and included marking guidance before you choose.</p><button className="market-text-link" onClick={browsePastPapers}>Browse the catalogue <ArrowRight size={15}/></button></article><article><span className="guardian-exams-section-icon teal"><GraduationCap size={20}/></span><span className="market-eyebrow">LEARNING SUPPORT</span><h2>Practise with purpose</h2><p>Use interactive practice and marking guidance to understand what you know and what to work on next.</p><button className="market-text-link" onClick={openGuide}>See how it works <ArrowRight size={15}/></button></article></section>
    <p className="guardian-exams-prototype-note">Upcoming series and learning examples are shown for this prototype. No exam release or reminder message is sent.</p>
  </main>
}
