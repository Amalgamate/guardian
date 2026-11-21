# Guardian Exams — Frontend Design Audit

## Scope
Audited all user-facing pages: Design System landing (`App.tsx`), Marketplace home + catalogue + detail + checkout (`Marketplace.tsx`), Auth flow (`AuthFlow.tsx`), Learner Workspace (`Workspace.tsx`), and Public Pages (`MarketplacePublicPages.tsx`) — plus their 14 CSS files and design token docs.

---

## 1. Colour System — Fragmented & Inconsistent

### Problem
The design tokens document defines one palette, but the CSS implements a **different** one. Multiple conflicting values exist for the same semantic role:

| Role | Token doc says | `color-system.css` says | `styles.css` says | Actual usage |
|------|---------------|------------------------|-------------------|-------------|
| Teal/Progress | `#11A88D` | `#11A88D` | `#16A58A` | Both appear across components |
| Amber/Secondary | `#FFB938` | `#FFB938` | `#E9A23B` | `--deep-yellow` adds a third: `#E9A23B` |
| Canvas | `#F8FAFD` | `#F8FAFD` | `#F5F7FA` | Body uses `#F5F7FA` |
| Border | `#E2E9F1` | `#E2E9F1` | `#E7EDF4` | Both appear |
| Secondary text | `#566A83` | `#566A83` | `#64748B` | Both appear |
| Shadow | `0 4px 14px rgba(16,36,59,.06)` | same | `0 3px 12px rgba(16,36,59,.045)` | Two different shadows |

Additionally:
- `#2457D6` (blue) and `#315EFB` / `#1769F5` are used interchangeably for the brand action colour depending on the file
- `cover-purple` is actually `#10243B` (navy) — not purple at all
- `cover-rose` is `#315FCB` — not rose, it's blue
- The wordmark `Exams` portion is `#2457D6` in some places and `#315EFB` in `brand-polish.css`

### Impact
The product looks slightly "off" — colours don't harmonise because half the components use one teal and half use another. It's subtle but creates a cheap, unpolished feel.

### Recommendation
Consolidate to **one** source of truth. Delete `--deep-yellow` entirely. Pick one teal (`#11A88D` is more sophisticated), one canvas (`#F8FAFD`), one border (`#E2E9F1`). Remove all hardcoded hex values from `styles.css` and reference CSS variables only.

---

## 2. Typography — Good Intentions, Poor Execution

### Problem
- **Three font families** loaded from Google Fonts (Manrope, Inter, DM Mono/JetBrains Mono). The design tokens doc mentions JetBrains Mono but the CSS imports DM Mono. Pick one.
- **Font sizes are extremely small** across the board: `10px`, `11px`, `12px` appear hundreds of times. This is a product for learners and families — many will struggle to read it.
- The `calc(Npx * var(--type-scale, 1))` pattern is used everywhere, but `--type-scale` is either `1` or `1.2`. This means "large text" mode just scales everything up 20%, which breaks layouts rather than intelligently adjusting.
- Headings don't scale responsively with `clamp()` except in a few places (hero, auth). Most section headings are fixed `19px` regardless of viewport.
- No clear typographic rhythm — spacing between elements is inconsistent (margins of `4px`, `7px`, `9px`, `11px`, `12px`, `13px` appear throughout with no system).

### Recommendation
- Use `clamp()` for all heading sizes, not just the hero
- Increase base body text to `15px` minimum
- Replace the hundreds of `calc(Npx * var(--type-scale))` calls with a proper type scale using `rem` units and `@media` queries
- Consolidate DM Mono → JetBrains Mono (or vice versa)
- Establish a spacing scale: `4px, 8px, 12px, 16px, 24px, 32px, 48px` — nothing in between

---

## 3. Design System Page (`App.tsx`) — Too Dense, Not a Landing Page

### Problem
The entry page is a **design system showcase**, not a product landing page. Users arriving at Guardian Exams see:
- A sidebar labelled "DESIGN SYSTEM" with items like "Foundations", "Components", "Data display"
- 8 numbered sections covering colour palettes, typography specimens, button showcases, form controls, status indicators, toast previews, icon libraries, logo boards, commerce patterns, M-Pesa flows, chat widgets, accessibility toggles, vendor profiles, wallets, video lessons, reporting tables, and platform tokens

This is a **Figma board exported to React**, not a customer-facing page. No learner, parent, or teacher should ever see this.

### Specific issues:
- The hero panel is small and immediately followed by 8 walls of content
- The colour palette section lets users "click to copy" hex values — this is a designer tool, not a learner feature
- The logo board shows 12 logo variants — internal brand documentation, not customer-facing
- The icon library shows 30 icons with labels — developer reference material
- The cart/M-Pesa/chat demos are embedded in the design system page rather than the actual product flow
- No clear call-to-action guiding users to the actual product (marketplace or sign in)

### Recommendation
Replace this page entirely with a proper **landing page**:
1. Full-screen hero with value proposition + primary CTA ("Browse papers" / "Sign in")
2. 3 feature cards (Find papers, Practise, Track progress)
3. Social proof / stats section
4. Simple CTA footer
5. Move the design system showcase to `/design-system` or remove it from the prototype entirely

---

## 4. Marketplace — Decent Structure, Cluttered Execution

### What works:
- Hero carousel with rotating slides (learners vs. schools) is a good pattern
- Filter sidebar with curriculum, grade, subject is well-structured
- Paper cards show useful metadata (pages, questions, formats, price)
- Detail page with sample question preview is thoughtful

### What doesn't:

**The announcement marquee bar**
- A bright yellow `#fff0b9` scrolling marquee at the top announcing "2027 Term 1 Midterm Exam" with delivery info looks like a 2010 website banner. It's distracting and cheapens the brand.
- The blue topbar above it (`#1769F5`) creates a double-header that eats vertical space before users see any content.

**Paper cover cards**
- The `.paper-cover` elements are coloured blocks (`cover-blue`, `cover-teal`, etc.) with text overlaid. They look like placeholder rectangles, not product imagery. No actual paper thumbnails or visual previews.
- `cover-purple` is navy, `cover-rose` is blue — the naming is broken

**Filter sidebar**
- Filter group headings use `<details>/<summary>` which is good, but the checkboxes show counts like "3" in tiny `10px` text that's hard to read
- The "Show N papers" button at the bottom of filters is easy to miss

**Catalogue results**
- Grid view and list view toggles use `▦` and `☷` Unicode characters — these render inconsistently across systems and look unprofessional. Use proper icons.
- Sort dropdown and view toggle are crammed together in a small toolbar

**Checkout**
- The M-Pesa demo is functional but the payment card looks like a form, not a polished payment experience
- The `mpesa-mark` with the logo SVG and phone icon is cramped

**Footer**
- Contains "Marketplace prototype · simulated resources and payments" — disclaimers are fine but this reads like developer debug text, not a polished footer

### Recommendation
- Remove the marquee banner. If the upcoming exam is important, feature it as a proper card below the hero
- Replace coloured-block paper covers with actual paper thumbnails or a more elegant placeholder (subject icon + gradient)
- Replace Unicode view-toggle characters with Lucide icons (already available in the project)
- Increase font sizes throughout the catalogue
- Simplify the double-header (announcement bar + main header) into one clean navigation bar
- Redesign the footer with proper columns: Product, Resources, Company, Legal — not a single line of text

---

## 5. Auth Flow — Functional but Generic

### What works:
- Split layout (story panel + form) is a good pattern
- Email/SMS verification choice is thoughtful for the Kenyan market
- Demo code `123456` is clearly shown
- Password visibility toggle is good UX

### What doesn't:

**Visual design**
- The auth card is a basic white box with a thin border. No depth, no polish.
- The "story" panel on the left is just text — no illustration, no image, no visual interest
- The trust list (`✓ Learner-friendly access`, `✓ Email or SMS verification`, `✓ Prototype only`) is bland marketing copy, not compelling reasons to sign up
- The security note box at the bottom of the story panel looks like an error/warning, not a reassurance
- The `auth-demo-badge` pill in the header ("Demo authentication") is unnecessary clutter for end users

**Form design**
- Inputs are unstyled `<label>` + `<input>` pairs with minimal visual treatment
- No input icons (except password show/hide) — the marketplace search has icons but auth inputs don't
- The "or" divider is a plain line with text — could be more elegant
- The "Continue with sample learner" button is styled differently from everything else (`auth-demo-signin` class)

**Mobile**
- On mobile, the story panel shows above the form, pushing the actual login form far down the page. The story panel should collapse to a minimal header on small screens.

### Recommendation
- Add a proper illustration or brand image to the story panel (the marketplace hero photos could be reused)
- Style inputs with leading icons, proper focus states, and subtle background fills
- Replace the trust list with 2-3 concrete value propositions with icons
- On mobile, hide the story panel entirely — show only the logo + form
- Use a consistent button style — remove the separate `auth-demo-signin` variant

---

## 6. Workspace — Overwhelming for Learners

### What works:
- Role switcher (Learner, Parent, Teacher, School admin, Platform admin, Examiner) is good for a prototype
- Sidebar navigation per role is well-structured
- Assessment room with question navigator, flagging, timer is genuinely well-designed
- Progress bars and result cards are clean

### What doesn't:

**Information density**
- The Learner Overview dashboard packs 4 metric cards, an activity feed, a chart card, a papers list, and revision tips into one screen. It's overwhelming for a Grade 8 learner.
- The Teacher and School admin roles have 13 and 12 sidebar items respectively — that's too many navigation options without grouping

**Visual hierarchy**
- Metric cards (`ws-metric`) all look the same — same size, same shadow, same border. There's no visual priority. The "most important" metric isn't highlighted.
- The dashboard grid uses `grid-template-columns: 1.5fr 1fr` but the content doesn't respect this — cards stretch awkwardly
- The chart card uses a CSS-only bar chart (`chart-column i { height: '84%' }`) which is fine for a prototype but looks crude

**Assessment room**
- The question navigator buttons are `32px × 32px` — small touch targets, especially on mobile
- The timer is styled with `ws-timer urgent` when under 120 seconds but the urgent style isn't defined in the workspace CSS — it may not work
- Answer options use `ws-answer-option` but there's no clear hover/focus state defined

**Settings**
- The font size toggle (Standard / Large) is buried at the bottom of the sidebar. Accessibility features should be more prominent.

### Recommendation
- Reduce dashboard to 3 key metrics + 1 primary action for learners
- Group sidebar items into sections (e.g., "Learning", "Account", "Communication") with subheadings
- Give the most important metric card a larger span or distinct visual treatment
- Increase question navigator buttons to `40px × 40px` minimum
- Make the settings/accessibility section reachable from the profile menu, not just the sidebar bottom

---

## 7. CSS Architecture — Technical Debt

### Problem
The CSS is spread across **14 separate files** with no clear organisation:

| File | Purpose | Lines |
|------|---------|-------|
| `styles.css` | Main design system page | ~300+ (minified) |
| `auth.css` | Auth flow | ~100 |
| `marketplace.css` | Marketplace | ~200+ |
| `workspace.css` | Workspace | ~200+ |
| `color-system.css` | Colour overrides | ~75 |
| `brand-polish.css` | Wordmark/logo | ~18 |
| `hero-carousel.css` | Hero carousel | ~37 |
| `styles-expanded.css` | Extended patterns | ~94 |
| `styles-personalization.css` | Accessibility/profile | ~81 |
| `marketplace-extra.css` | More marketplace | (exists, not read) |
| `marking-workflow.css` | Marking | (exists) |
| `inbox-center.css` | Inbox | (exists) |
| `teacher-content.css` | Teacher content | (exists) |
| `teacher-wallet.css` | Teacher wallet | (exists) |
| `feedback.css` | Feedback | (exists) |
| `role-preview.css` | Role preview | (exists) |

Issues:
- **Specificity wars**: `color-system.css` overrides values set in `styles.css`, then `styles-personalization.css` overrides those again. The cascade is fighting itself.
- **No CSS variables consistency**: `styles.css` defines `--navy`, `--blue` etc. in `:root`. `color-system.css` redefines them with different values. Components in `marketplace.css` define their own `--market-navy`, `--ws-navy` etc. — four sets of the same variables.
- **Minified CSS in source**: `styles.css` is minified/compressed with everything on 3 lines. This is unmaintainable.
- **Duplicated rules**: The `.wordmark-name`, `.wordmark-cap`, `.guardian-logo-cap`, `.guardian-logo-badge` rules are copy-pasted at the bottom of at least 4 different CSS files.

### Recommendation
- Consolidate to **3 CSS files maximum**: `tokens.css` (variables only), `base.css` (reset + typography + buttons + forms), `components.css` (everything else)
- Unformat the minified `styles.css` — it should be readable
- Delete all duplicated variable blocks — define once in `tokens.css`, import once
- Remove `--market-navy`, `--ws-navy`, `--auth-navy` — use `--navy` everywhere

---

## 8. Responsive Design — Works but Fragile

### What works:
- Every page has `@media` breakpoints at `1050px`, `760px`, and `430px`
- The marketplace collapses to single-column on mobile
- The workspace sidebar becomes a drawer on mobile
- `prefers-reduced-motion` is respected everywhere

### What doesn't:
- Breakpoints are **per-component**, not global. `styles.css` has breakpoints at `1500px`, `1050px`, `760px`, `430px`. `marketplace.css` has them at `1050px`, `760px`, `430px`. `workspace.css` has `1050px`, `720px`. The inconsistency means components break at different widths.
- Many responsive overrides are in minified CSS blocks that are hard to maintain
- The design system page hides the hero preview on mobile (`hero-preview { display: none }`) but the hero text doesn't expand to fill the space — it looks empty
- The marketplace mobile nav hides items `:nth-child(n+3)` — this silently hides navigation links on small screens without telling the user

### Recommendation
- Standardise breakpoints: `640px`, `768px`, `1024px`, `1280px` (Tailwind-style)
- When hiding elements on mobile, provide an alternative (e.g., a "More" menu for hidden nav items)
- When the hero preview is hidden, let the hero copy expand to full width

---

## 9. Brand Identity — Confused

### Problem
The product is called **"Guardian Exams"** but the repo is named **"guardian"** and the package.json says **"examify-prototype"**. The HTML title says "The Guardian Exams". The README presumably says something else. This three-name confusion makes it hard to establish brand identity.

The logo is a graduation cap in a blue gradient badge + "Guardian Exams." wordmark. It's clean but:
- The graduation cap icon is extremely generic — every education product uses it
- The teal full stop after "Exams" is a nice touch but it's the only distinctive element
- The badge with gradient (`linear-gradient(145deg, #347cff, #155be5)`) looks like a tech startup, not an education brand

### Recommendation
- Decide on one name: "Guardian Exams" (drop "The" from the title, drop "ExamiFy" from the package)
- Consider a more distinctive logo mark — the graduation cap could be stylised with a shield (guardian = protector) or a book + checkmark
- The teal full stop is good — lean into it more as a brand element (use it as a bullet point, loading indicator, etc.)

---

## 10. Performance Concerns

- Google Fonts loaded via `@import url()` in CSS — this blocks rendering. Should be `<link rel="preconnect">` + `<link rel="stylesheet">` in HTML head instead.
- No lazy loading of components — the design system page renders everything at once (8 sections, 30+ icons, 12 logo variants, charts, tables, chat window)
- The marketplace loads external Wikimedia images directly — no optimisation, no fallback
- No CSS containment or `will-change` hints despite animations

---

## Priority Recommendations (Ranked for a Prototype)

> Context: This is a prototype for founder/stakeholder review, not production software. The goal is to communicate the product vision clearly and look polished enough to taken seriously. Recommendations are weighted toward visual impact with minimal effort.

### P0 — Fix before the next stakeholder demo
1. **Replace the design system page with a real landing page** — stakeholders reviewing the prototype see colour palettes, logo variants, and icon libraries instead of the actual product. First impression = confusion. A simple hero + 3 feature cards + CTA would transform this.
2. **Remove the marquee announcement bar** — the scrolling yellow text strip looks like a 2010 website. It's the single most "cheap-looking" element in the entire prototype.
3. **Unify the colour palette** — pick one teal, one amber, one canvas. Right now `#16A58A` and `#11A88D` are both used for the same semantic role across different CSS files. It's subtle but makes the whole thing feel slightly "off."
4. **Increase base font sizes** — `10px` and `11px` text appears hundreds of times. Stakeholders reviewing on a laptop will squint. Bump body text to `14px` minimum.

### P1 — Polish that makes stakeholders say "wow"
5. **Redesign paper covers** — the flat coloured rectangles (`cover-blue`, `cover-teal`) with text look like wireframe placeholders. Even a simple gradient + subject icon would look 10× better.
6. **Fix the auth flow visuals** — the story panel is just text on white. Add an image or illustration (the Wikimedia classroom photos from the marketplace hero could be reused here).
7. **Simplify the learner dashboard** — 4 metrics + activity feed + chart + papers + tips is too much for one screen. Show 3 key metrics + 1 primary action. Stakeholders should immediately "get it."
8. **Consolidate CSS files** — 14 files with conflicting values is a maintenance nightmare even for a prototype. Merge into 3 files: `tokens.css`, `base.css`, `components.css`.
9. **Replace Unicode view-toggle characters (`▦` `☷`) with Lucide icons** — they already import `LayoutGrid` and `List` from lucide-react.
10. **Standardise responsive breakpoints** — different files break at `760px`, `720px`, `780px`. Pick one set.

### P2 — Nice to have if time allows
11. Fix `cover-purple` (actually navy) and `cover-rose` (actually blue) naming
12. Move Google Fonts from CSS `@import` to HTML `<link>` with preconnect (faster first paint)
13. Group workspace sidebar items into sections for Teacher/School admin (13 items is a lot)
14. Consider a more distinctive logo mark — graduation cap is generic
15. Add proper image fallbacks for the Wikimedia hero photos

### Not worth fixing for a prototype
- CSS source minification (nobody reads the CSS in a demo)
- Performance optimisation / lazy loading
- Perfect accessibility compliance
- Spacing scale systematisation

---

## Summary

The Guardian Exams prototype has **solid product thinking** — the role-based workspaces, assessment flow, marketplace structure, and M-Pesa integration are well-conceived. The visual execution is the bottleneck: fragmented colours, tiny fonts, a design-system page masquerading as a landing page, and a dated marquee banner.

For a prototype meant to impress stakeholders, the **two highest-impact changes** are:
1. Swap the landing page from "design system showcase" to a real product landing
2. Kill the marquee banner

Those two changes alone — maybe a day of work — would make the prototype feel like a different product. Everything else in P1 is incremental polish on top of that foundation.
