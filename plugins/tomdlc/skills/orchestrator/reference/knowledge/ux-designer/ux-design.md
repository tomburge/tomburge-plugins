# UX design

The output is a specification the developer can build from and the tester can verify, with low-fidelity wireframes so the user can check layout and priorities before anything is built. It isn't visual design: no colors, fonts or pixel layouts. Write `.tomdlc/03-ux.md`.

## 1. Users and tasks
From `02-requirements.md`, list the user types and their primary tasks. Each user flow serves a named user type. Don't invent personas the requirements don't support; mark gaps as `ASSUMPTION:`.

## 2. User flows
For each user-facing FR (or group of FRs), write a flow:
- Entry points: where the user starts
- Steps, with the decision points
- **Error and recovery paths:** what the user sees and can do when each step fails (validation, permission denied, timeout, conflict, session expired)
- Exit points and the confirmation the user gets
- The FR, BR and AC IDs it covers

Draw flows with three or more branches as Mermaid flowcharts.

## 3. Information architecture
The navigation structure, the screen inventory, and how users find each primary task within a few steps. Use the users' vocabulary, not internal names.

## 4. Screens and their states
For every screen, specify all five states:

| State | Specify |
|---|---|
| Empty | First use, or no results: what explains the emptiness, and what's the next action |
| Loading | What shows while waiting; when it switches to a timeout message |
| Ideal | The normal populated state |
| Error | What failed, in plain language, and how to recover; the user's input is preserved |
| Partial | Some data loaded and some failed; or a list with more to load |

## 4a. Wireframes

Draw a low-fidelity wireframe for each key screen (the screens on the primary flows, and any screen with a complex layout) in its ideal state, as ASCII in a fenced code block. Keep it rough on purpose: it shows **regions, content priority and the primary action**, not styling.

Conventions:
- `[ Button ]` for buttons, with the primary action marked `[* Save *]`
- `[____________]` for text inputs, with the label above; `[ Choose... v ]` for selects
- `( )` and `(o)` for radio buttons; `[ ]` and `[x]` for checkboxes
- `<Link>` for links; `===` under a heading; `...` for repeated rows
- `(1)`, `(2)` callouts that the notes under the wireframe explain (component, behavior, the state variants)

Example:
```
+--------------------------------------------------+
| Logo        Orders   Customers        <Account>  |
+--------------------------------------------------+
| Orders                                           |
| ======                                           |
| [ Search orders..... ] [ Status: Any v ]   (1)   |
|                                                  |
| #     Customer        Total     Status     (2)   |
| 1042  Acme Ltd        £120.00   Shipped          |
| ...                                              |
|                     < Prev   Page 2   Next >     |
|                                [* New order *]   |
+--------------------------------------------------+
(1) Filters apply on change; the URL keeps them (deep links, back button).
(2) Empty state: "No orders yet" + [* New order *]. Error state: message + [ Retry ].
```

Describe the other four states in the notes rather than drawing each, unless the layout changes. For flows with three or more branches, keep using Mermaid flowcharts (section 2). On small screens, add a narrow wireframe only where the layout changes meaningfully.

## 5. Interaction patterns
- **Forms:**
  - visible labels, never placeholder-only
  - validate on blur and on submit, not on every keystroke
  - an error summary at the top with links to the fields, plus inline messages
  - keep the user's input after an error
  - mark required fields
- **Destructive actions:** confirm with a specific description of what will be lost, and offer undo where possible.
- **Dialogs:** use sparingly; trap focus inside while open; return focus to the trigger on close; Escape closes.
- **Long lists:** pagination where users need to find their place again; "load more" or infinite scroll only for browsing feeds.
- **Progressive disclosure:** show the common options and reveal advanced ones on request.
- **Feedback:** every action gets a visible response within about 100 ms (even just a busy state), and a result.

### Pattern catalogue

Use these defaults unless a requirement says otherwise. Record any deviation and its reason in the screen notes.

| Pattern | Default behavior | Accessibility must-haves |
|---|---|---|
| Forms and validation | As above | Label tied to each input; errors linked with `aria-describedby`; focus moves to the error summary on submit; don't rely on color alone for errors |
| Tables (sort, filter, pagination) | Sort by clicking a column header; filters above the table; state kept in the URL; show the result count | Real `<table>` with header cells; `aria-sort` on the sorted column; announce the new result count after filtering; pagination controls are labelled links or buttons |
| Empty, loading, error states | As in section 4 | Loading and result changes announced through a polite live region; spinners have a text label; error text is reachable by keyboard and screen reader |
| Destructive confirmation | As above; for severe, irreversible actions, ask the user to type the item's name | Dialog rules above; the confirm button names the action ("Delete 3 orders"), not "OK"; initial focus on the safe option |
| Toasts vs inline messages | Inline for anything tied to a field or region, or that the user must act on; toasts only for brief confirmations of success | Toasts use a polite live region, stay at least 5 s, pause on hover and focus, and can be dismissed; never put the only copy of an error or an action in a toast |
| Search | Search on submit, or on input with a debounce of about 300 ms; show the query and the result count; helpful no-results state | Labelled search field (`role="search"` on the region); suggestions follow the combobox pattern; result count announced |
| Wizards (multi-step) | Only when steps genuinely depend on each other; show the step and the total; Back keeps entered data; review step before submit | Step indicator readable as text ("Step 2 of 4"); focus moves to the step heading on change; each step's errors handled as a form |
| Settings | Group by task; say whether changes save immediately or on Save, and be consistent; confirm the save | Toggles use the switch role with a visible label and state; saved status announced |
| File upload | Button plus optional drag and drop; state the allowed types and maximum size up front; show progress and allow cancel; check type and size before upload | Drag and drop is never the only way; progress exposed as text or a progressbar; errors name the file and the reason |
| Notifications (in-app) | A list with unread state; mark read individually and all at once; link each to its subject; let users control which they receive | Unread count in the accessible name ("Notifications, 3 unread"); new items not announced intrusively; the panel follows the dialog or disclosure pattern |

## 6. Responsive and input
- State the breakpoints, and what changes at each.
- Touch targets are at least 24×24 CSS pixels (WCAG 2.2 AA minimum), and 44×44 for primary actions.
- Everything works by keyboard, touch and pointer.

## 7. Content
- Plain language. Error messages say what happened and what to do, without blaming the user or exposing internals.
- Use consistent terms for the same thing everywhere.

## 8. Component specs
For each reusable component:
- its purpose
- variants and states (default, hover, focus, active, disabled, loading, error)
- inputs and props
- responsive behavior
- its accessibility spec (see `accessibility.md`)

## 8a. Design tokens
The spec refers to tokens by role, so visual values can be chosen or changed later without rewriting it. Specify the token names and contrast pairs; the values are visual design.

| Tier | Example | Used by |
|---|---|---|
| Primitive | `color.blue.600 = #1d4ed8` | Semantic tokens only |
| Semantic | `color.action.primary → color.blue.600` | Components and screens |
| Component | `button.primary.background → color.action.primary` | One component, where it needs its own override |

- **Name by role, not value:** `color.text.primary`, `color.surface.raised`, `space.2`, `radius.sm`, `font.body`. Never `blue-500` or `16px` in a component spec.
- **One source:** tokens live in one source file in the repository (JSON or similar) and are exported to CSS custom properties and any platform formats. Nothing hard-codes a value the tokens define.
- **Theming and dark mode:** a theme remaps semantic tokens to different primitives. Components don't change.
- **Contrast at token level:** list each foreground and background pair that can appear together (text on surface, text on action, focus ring on surface) and check it against WCAG 2.2 AA in every theme: 4.5:1 for normal text, 3:1 for large text and for UI components and focus indicators. A failing pair is fixed in the tokens, not per screen.

## 8b. Front-end performance budget
State the budget in `03-ux.md` so the architect and developer can design to it and the tester can check it. Defaults, measured at p75 on a mid-range mobile device:

| Metric | Default (all tiers) |
|---|---|
| LCP (Largest Contentful Paint) | ≤ 2.5 s |
| INP (Interaction to Next Paint) | ≤ 200 ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 |

| Product type | JS per route (compressed) | Images |
|---|---|---|
| Public content or marketing pages | ≤ 100 KB | Hero ≤ 200 KB; total page ≤ 1 MB |
| Customer-facing app | ≤ 200 KB initial; lazy-load the rest | ≤ 100 KB each above the fold |
| Internal tools (low risk, desktop) | ≤ 300 KB | No fixed limit; responsive sizes still required |

- Images use modern formats (AVIF or WebP), explicit width and height (prevents layout shift), and lazy loading below the fold.
- Tighten the budget where the requirements have a stricter NFR; loosen it only with a recorded reason.
- **Enforcement:** CI fails when the budget is exceeded. Use Lighthouse CI with assertions on the metrics above for key routes, and a bundle-size check (such as `size-limit` or the bundler's size report) per route. Where real-user monitoring exists, track the same metrics at p75 in production.

Facts in this section checked against primary sources on 2026-10-14.

## 9. Heuristic review
Before handing back, check the flows against Nielsen's 10 usability heuristics:
1. Visibility of system status
2. Match between the system and the real world
3. User control and freedom
4. Consistency and standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility and efficiency of use
8. Aesthetic and minimalist design
9. Help users recognize, diagnose and recover from errors
10. Help and documentation

Note any issue you couldn't resolve under Findings.

Facts checked against primary sources on 2026-10-14.
