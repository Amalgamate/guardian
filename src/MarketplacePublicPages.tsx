import { Check, ChevronDown, CircleHelp, ArrowRight } from 'lucide-react'

export type MarketplacePublicScreen = 'pricing' | 'how-it-works' | 'support' | 'plan-success'

type Props = {
  screen: MarketplacePublicScreen
  selectedPlan: string
  navigate: (screen: 'home' | 'catalogue' | 'detail' | 'pricing' | 'support') => void
  choosePlan: (name: string) => void
}

const plans = [
  { name: 'Learner', price: 'KSh 299', period: '/ month', description: 'Steady practice for one learner.', features: ['Practice library access', 'Progress and results', 'Save papers for later'] },
  { name: 'Family', price: 'KSh 599', period: '/ month', description: 'Support learning across your family.', features: ['Everything in Learner', 'Up to 4 learner profiles', 'Family progress overview'], featured: true },
  { name: 'Teacher', price: 'KSh 799', period: '/ month', description: 'Tools to prepare and guide a class.', features: ['Question and paper library', 'Assignments and class insights', 'Marking workflow preview'] },
  { name: 'School', price: 'Let’s talk', period: '', description: 'Learning resources for your institution.', features: ['School and class workspaces', 'School-level reporting', 'Institutional access options'] },
]

export default function MarketplacePublicPages({ screen, selectedPlan, navigate, choosePlan }: Props) {
  if (screen === 'pricing') return <main className="public-info-page pricing-page">
    <div className="market-breadcrumb"><button onClick={() => navigate('home')}>Home</button><span>/</span><strong>Plans</strong></div>
    <section className="public-page-heading"><span className="market-eyebrow">LEARNING THAT FITS YOUR NEEDS</span><h1>Choose how you want to prepare.</h1><p>Start with individual papers or explore access for learners, families, teachers and schools.</p><small>Prices below are illustrative prototype values for founder review. No plan is activated and no payment is taken.</small></section>
    <div className="plan-grid">{plans.map((plan) => <article className={`plan-card ${plan.featured ? 'plan-featured' : ''}`} key={plan.name}>{plan.featured && <span className="plan-ribbon">FAMILY FAVOURITE</span>}<span className="market-eyebrow">GUARDIAN EXAMS {plan.name.toUpperCase()}</span><h2>{plan.name}</h2><p>{plan.description}</p><div className="plan-price">{plan.price}<small>{plan.period}</small></div><ul>{plan.features.map((feature) => <li key={feature}><Check size={15}/>{feature}</li>)}</ul><button className={`button ${plan.featured ? 'button-primary' : 'button-secondary'}`} onClick={() => plan.name === 'School' ? navigate('support') : choosePlan(plan.name)}>{plan.name === 'School' ? 'Ask about school access' : 'Preview this plan'} <ArrowRight size={15}/></button></article>)}</div>
    <div className="pricing-footnote"><CircleHelp size={17}/><span><strong>Need help choosing?</strong><small>Compare individual papers with subscription access, or ask us about a school workspace.</small></span><button className="market-text-link" onClick={() => navigate('support')}>Get help <ArrowRight size={14}/></button></div>
  </main>

  if (screen === 'how-it-works') return <main className="public-info-page">
    <div className="market-breadcrumb"><button onClick={() => navigate('home')}>Home</button><span>/</span><strong>How it works</strong></div>
    <section className="public-page-heading"><span className="market-eyebrow">YOUR LEARNING JOURNEY</span><h1>From finding a paper to knowing what to practise next.</h1><p>Guardian Exams brings learning resources and progress into one clear experience.</p></section>
    <div className="journey-grid">{[{ n: '01', title: 'Find the right resource', text: 'Search by curriculum, level, grade, subject or exam type. Check formats, page counts and price before choosing.', action: 'Browse past papers', go: () => navigate('catalogue') }, { n: '02', title: 'Practise with purpose', text: 'Use a paper preview or an interactive practice resource. Marking guidance is shown when included.', action: 'See a sample paper', go: () => navigate('detail') }, { n: '03', title: 'Review your progress', text: 'Understand scores, see areas to revisit and connect the next practice step to your learning goals.', action: 'Explore learning resources', go: () => navigate('catalogue') }].map((item) => <article className="journey-card" key={item.n}><span className="journey-number">{item.n}</span><h2>{item.title}</h2><p>{item.text}</p><button className="market-text-link" onClick={item.go}>{item.action} <ArrowRight size={15}/></button></article>)}</div>
    <div className="journey-note"><Check size={18}/><span><strong>Made for Kenyan learning contexts</strong><small>Browse sample CBC and 8-4-4 resources, with KSh pricing and familiar grade and form labels.</small></span></div>
  </main>

  if (screen === 'support') return <main className="public-info-page support-page">
    <div className="market-breadcrumb"><button onClick={() => navigate('home')}>Home</button><span>/</span><strong>Help and support</strong></div>
    <section className="public-page-heading"><span className="market-eyebrow">HERE TO HELP</span><h1>Questions about finding or using a paper?</h1><p>Start with these quick answers. This prototype does not send support requests.</p></section>
    <div className="faq-list">{[{ q: 'How do I find a paper for my class?', a: 'Browse the catalogue and combine filters for curriculum, level, grade or form, subject, year, term and format. You can clear all filters at any time.' }, { q: 'What happens when I buy a paper?', a: 'In the prototype, checkout is simulated. A successful demo payment adds the resource to the sample learner library. No real payment is processed.' }, { q: 'Are subscriptions active?', a: 'No. Plan prices and selection are illustrative. Subscriptions are shown for product review and do not activate access or take payment.' }, { q: 'Can I download the sample resources?', a: 'The catalogue and preview content are illustrative. PDF files are not connected in this prototype.' }].map((item) => <details className="faq-item" key={item.q}><summary>{item.q}<ChevronDown size={17}/></summary><p>{item.a}</p></details>)}</div>
    <button className="button button-primary support-browse" onClick={() => navigate('catalogue')}>Browse examination papers <ArrowRight size={15}/></button>
  </main>

  return <main className="checkout-page"><div className="success-card plan-success-card"><span className="success-mark"><Check size={25}/></span><span className="market-eyebrow">PLAN PREVIEW</span><h1>{selectedPlan} access, ready to explore.</h1><p>You selected the {selectedPlan} plan preview. This only records your choice on this screen; no subscription was created and no payment was taken.</p><div className="success-actions"><button className="button button-primary" onClick={() => navigate('catalogue')}>Explore papers <ArrowRight size={15}/></button><button className="button button-secondary" onClick={() => navigate('pricing')}>Compare plans</button></div></div></main>
}

