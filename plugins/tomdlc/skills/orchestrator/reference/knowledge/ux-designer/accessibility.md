# Accessibility

Target: WCAG 2.2 at the level in the `NFR [a11y]` requirement (by tier: see the scaling table in your brief). Accessibility laws, such as the ADA, Section 508 and EN 301 549 under the European Accessibility Act, generally reference WCAG level AA (WCAG 2.0 or 2.1 today: Section 508 uses 2.0, the ADA Title II rule and EN 301 549 V3.2.1 use 2.1; meeting 2.2 AA also meets them). Confirm which apply with the user.

## Principles (POUR)
- **Perceivable:** text alternatives, captions, adaptable structure, sufficient contrast
- **Operable:** keyboard access, enough time, no seizure risks, navigable, input modalities beyond the keyboard
- **Understandable:** readable, predictable, helps users avoid and correct mistakes
- **Robust:** works with assistive technology, through valid semantics

## Checklist for the spec

| Area | Requirement (level) |
|---|---|
| Images and icons | Meaningful images have text alternatives; decorative ones are hidden from assistive technology (A) |
| Structure | Headings in order, landmarks (header, nav, main, footer), lists marked as lists, tables with headers (A) |
| Color and contrast | Color is never the only signal (A). Contrast is 4.5:1 for normal text and 3:1 for large text (AA), and 3:1 for icons, focus indicators and control boundaries (AA) |
| Keyboard | Everything is operable by keyboard, with no traps (A); a logical focus order (A); focus always visible (AA) and not hidden behind sticky elements (2.2, AA) |
| Targets | At least 24×24 CSS pixels, or enough spacing (2.2, AA) |
| Dragging | Any drag action has a single-pointer alternative (2.2, AA) |
| Forms | Visible labels and instructions (A); errors identified in text (A) with suggestions (AA); no re-entering information already given in the same process (2.2, A) |
| Authentication | No cognitive tests such as memorizing or transcribing to log in; allow paste and password managers (2.2, AA) |
| Help | Help mechanisms repeated across pages appear in the same order relative to other content (2.2, A) |
| Resize and reflow | Text resizes to 200% (AA); content reflows at 320 CSS pixels wide without horizontal scrolling (AA) |
| Time and motion | Time limits can be extended (A); moving content can be paused (A); nothing flashes more than 3 times a second (A); respect `prefers-reduced-motion` |
| Media | Captions for video (A); audio description or a transcript (A or AA by type) |
| Language | The page language is set (A) |
| Status messages | Results and errors are announced without moving focus (AA) |

## Semantics and ARIA
- Use native HTML elements first (`button`, `a`, `input`, `select`, `dialog`). They come with keyboard support and roles.
- Add ARIA only when no native element fits, and then implement the full keyboard pattern for that role.
- Every interactive element has an accessible name that contains its visible label text, ideally at the start (A).

## Accessibility spec per component
For each component in the component specs:

| Field | Content |
|---|---|
| Role | Native element, or ARIA role |
| Accessible name | Where it comes from |
| Keyboard | The keys and what they do (e.g. Enter and Space activate; arrow keys move within a menu; Escape closes) |
| Focus | Where focus goes on open, close and after actions |
| States announced | Expanded, selected, busy, invalid |
| Contrast | The tokens used, and confirmation that they meet the ratios |

## Verification
The tester runs automated checks (axe or pa11y) in CI, plus manual keyboard, screen reader, zoom and reflow checks on each critical flow. Design so these can pass: specify focus behavior and announcements here rather than leaving them to chance.

Facts checked against primary sources on 2026-10-14.
