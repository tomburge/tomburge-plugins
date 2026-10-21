# Story quality

## User types
Before writing stories, define the people who use the system. Ground each one in the plan's stakeholders and users; don't invent demographics or backstories.

| Field | Content |
|---|---|
| Name | A role, e.g. "Billing admin", "First-time customer" |
| Goals | What they're trying to get done |
| Context | Where and how they use it: device, frequency, time pressure, expertise |
| Constraints | Accessibility needs, permissions, language, connectivity |
| Data they touch | And its classification |

Every story names one of these user types. A story that fits no defined user is either missing a user type or isn't needed.

## Writing stories
`As a <user type>, I want <capability>, so that <outcome>.`

Check each story against **INVEST**:

| | Means | Fails when |
|---|---|---|
| Independent | Can be built and delivered on its own, in any order with its peers | It only works once another story is done (merge them, or make the dependency explicit) |
| Negotiable | Says what and why, leaving how open | It prescribes UI controls or technology |
| Valuable | A user or the business gets something | It's a technical task dressed as a story ("as a developer I want a database") |
| Estimable | The team could size it | It's too vague, or depends on an unresolved question |
| Small | Fits comfortably in one delivery slice | It describes a whole feature area |
| Testable | Its acceptance criteria can be checked | It uses words like "easy", "fast" or "intuitive" |

Give each story 3–6 acceptance criteria: at least one happy path, one error path, and the boundary values for any limit it mentions. More than about 6 usually means the story should be split.

## Splitting large stories
Split vertically, so every piece still delivers something end to end. Never split by technical layer (UI story, API story, database story).

| Pattern | Example |
|---|---|
| Workflow steps | "Check out" → enter address; choose delivery; pay; confirm |
| Business rule variations | Standard pricing first; discounts; then tax exemptions |
| Happy path first | Successful payment; then declined card; then timeout |
| Data variations | One currency first, then several |
| Operations | Create and view first; edit; delete |
| Interfaces | Web first, then API, then mobile |
| Make it work, then fast | Correct results first; then the performance requirement as its own story |
| Spike | A time-boxed investigation when the unknowns block sizing; its output is a decision, not a feature |

## Anti-patterns
- **Epic in disguise:** "As a customer I want to manage my account." Split it.
- **Compound story:** "…search and filter and export." One behavior per story.
- **Solution-prescriptive:** "…a dropdown of countries." Describe the need ("choose my country quickly") and leave the control to the ux-designer.
- **No user value:** infrastructure and refactoring are work items or NFRs, not stories.
- **Criteria that restate the story:** acceptance criteria must add precision (values, states, errors), not repeat the title.

## Story map and MVP line
Add a **Story Map & MVP** section to `02-requirements.md`:
1. **Backbone:** the user activities in the order people do them (e.g. browse → choose → pay → track).
2. **Under each activity,** the stories, most essential at the top.
3. **The MVP line:** the smallest set of stories that achieves the plan's objectives end to end, for the primary user type. Everything above the line is `Must`.
4. **Increments:** group the remaining stories into later releases (`R2`, `R3`), each with the objective it serves.

Keep `Must` honest. If the Musts clearly exceed what the plan's deadline or team can deliver, flag it under Questions for the user rather than quietly keeping everything. A common rule of thumb is that Musts should take no more than about 60% of the available capacity, leaving room for the unexpected.

The architect orders delivery slices so the MVP line is reached first.

## Prioritizing beyond MoSCoW
MoSCoW is the default. When the backlog is large or stakeholders disagree, offer one of these, and record which was used:
- **WSJF:** (user value + time criticality + risk reduction) ÷ job size. Do the highest first.
- **RICE:** reach × impact × confidence ÷ effort.

Break ties by risk first (what retires the biggest unknown), then by dependencies.

## Definition of ready
A story is ready for a delivery slice when:
- it names a user type
- it passes INVEST
- its acceptance criteria cover happy, error and boundary cases
- its edge-case conditions are settled
- it has no open questions
- its data classification is known

## Questions worth asking (questions mode)
Ask only what you can't reasonably decide. For everything else, propose a default the user can correct. Useful open questions, one topic each:
- **Outcomes:** What has to be true for this to count as a success, and how will you measure it?
- **Users:** Who uses it, how often, on what devices, and with what expertise or accessibility needs?
- **Current process:** How is this done today, and what's most painful about it?
- **Scale and data:** How many users, records and transactions, now and in a year? What data is sensitive?
- **Exceptions:** What happens when <the main thing> fails or is done wrong? Who fixes it?
- **Constraints:** Deadlines, budget, platforms, integrations, regulations?
- **Non-goals:** What is explicitly not part of this?

Avoid leading questions ("you'll want SSO, right?") and questions that presuppose a solution.

Facts checked against primary sources on 2026-10-14.
