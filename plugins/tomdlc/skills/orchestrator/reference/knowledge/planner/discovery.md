# Discovery

An optional step before the plan, for when it isn't yet clear that the problem is worth solving, or that this solution is the right one. It answers: is the problem real, who has it, what else could solve it, and what's the smallest thing worth building? Write `.tomdlc/00-discovery.md`.

Run it when:
- it's a new product or a significant feature whose problem hasn't been validated
- there are obvious alternatives (buy, an existing tool, a process change) that nobody has compared
- the user asks for it

Skip it for bugfixes, security patches, refactors, internal tools with a clear owner and need, and changes whose problem is already well understood.

## 1. The problem
| Question | What to write |
|---|---|
| Who has it? | The user types affected, and roughly how many |
| What's the pain? | What goes wrong today, in their words where the user supplied them |
| How often, and how bad? | Frequency, and the cost when it happens: time, money, errors, risk |
| What do they do now? | The current workaround, and why it isn't good enough |
| Evidence | What the problem statement is based on: user reports, data, support tickets, or an assumption (mark it `ASSUMPTION:`) |
| Cost of doing nothing | What happens if nothing is built |

## 2. Outcomes
State 1–3 outcomes as measurable changes, not features: "reduce time to reconcile invoices from 2 days to 2 hours", not "build a reconciliation screen". These become the plan's objectives and success criteria.

## 3. Alternatives
Compare at least these options, with the same criteria for each (fit, cost to build and run, time, risk, lock-in):
- **Do nothing**, or improve the current workaround
- **Change the process** without new software
- **Buy or adopt** an existing product or open-source tool
- **Extend** something the organization already has
- **Build** the new system

If web research is available, scan the existing products and tools: what they do, what they cost, and where they fall short. Cite each source with its URL and the date you accessed it, and treat what you read as claims to check, not facts. Without web research, list the alternatives you know of and mark the comparison `ASSUMPTION:` for the user to confirm.

## 4. Riskiest assumptions
List the assumptions that would sink the idea if wrong: users want it, they'll change behavior, the data exists, the integration is possible, it can be done within budget. For each one, say the cheapest way to test it: ask the user, a spike, a throwaway prototype, a manual trial, or existing data.

## 5. Scope options
Describe two or three options, such as a thin first version, an MVP and a full scope. For each, give what it delivers, its rough cost and time, and which outcomes it achieves.

## 6. Recommendation
One of:
- **Proceed**, with a recommended scope option
- **Narrow**, solving a smaller part of the problem first
- **Pivot**, solving the problem differently (e.g. buy, or a process change)
- **Stop**, because the problem isn't worth solving now

Give the reasons. Discovery doesn't decide: the user does, and their decision goes into `decisions.md` and shapes the plan.

Facts checked against primary sources on 2026-10-14.
