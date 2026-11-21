# The Guardian Exams design system notes

This is the shared visual contract for the founder-review prototype. Keep product rules and token names independent of React so the approved system can later be mapped to the PWA and Flutter application.

## Brand and color roles

| Token | Value | Use |
| --- | --- | --- |
| `color.brand.navy` | `#10243B` | Brand, headings, key surfaces |
| `color.action.primary` | `#2457D6` | Primary actions and selected states |
| `color.action.secondary` | `#FFB938` | Amber secondary actions with navy foreground for contrast |
| `color.progress` | `#11A88D` | Progress and positive status |
| `color.surface.canvas` | `#F8FAFD` | Light application canvas |
| `color.border.subtle` | `#E2E9F1` | Surface separation |
| `color.text.primary` | `#172B42` | Main content |
| `color.text.secondary` | `#566A83` | Supporting content |
| `color.status.warning` | `#FFB938` | Attention states |
| `color.status.error` | `#D94B4B` | Error states |

Dashboard metric fills use restrained tints of the core palette with distinct semantic accents. Keep broad reading surfaces light and use navy, blue, teal, and amber consistently for icons, progress, and calls to action. Product icons use a stable set of colored circular backgrounds with white glyphs and text labels; color alone does not carry meaning.

## Typography and accessibility

- Display and headings: Manrope.
- Interface and reading text: Inter.
- Timers, prices and aligned scores: JetBrains Mono.
- Text size preference: `type.scale.standard` or `type.scale.large`; the prototype stores the selected preference on this device.
- Honor reduced-motion preferences and preserve readable contrast at each text size.

## Component and icon vocabulary

Component patterns in the prototype cover navigation, buttons, form controls, cards, dashboard metrics, charts, results tables, product/vendor listings, cart, wallet summary, M-Pesa demo, communications channel choices, video lesson controls, first-visit guide, avatars and profile menu.

Use named icon concepts such as `icon.assessment.results`, `icon.commerce.cart`, `icon.learning.video`, and `icon.communication.message`. Keep the outline weight and circular color treatment consistent. The customer-facing wordmark is **The Guardian Exams** with the TG text mark. Use saturated blue, teal, amber, violet, coral and cyan accents in luminous icon circles; keep white glyphs readable and color meaning reinforced by labels.

## Cross-platform mapping

- Web/PWA: map the named roles to CSS custom properties and semantic HTML components.
- Flutter: map the same role names and values to a Flutter theme extension and shared widgets.
- Keep channel, payment, vendor and reporting rules in product specifications; do not encode provider-specific behavior in the brand tokens.

## Current prototype boundaries

Email, SMS, WhatsApp, in-app and PWA push are channel choices shown for review only. They are not connected to delivery providers. Vendor, wallet, lesson and report content is sample data. Wallet and payment controls do not move money; the video card has no media source. The Flutter and installable PWA builds are future deliverables, not part of this design-system milestone.
