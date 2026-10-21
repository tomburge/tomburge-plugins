# Functional design

Requirements say *what* the system must do. Functional design pins down the behavior precisely enough that the developer and tester can't interpret it two ways. Add a **Functional Design** section to `03-design.md` (or a separate `03-functional-design.md` when it grows large).

## When it's needed

| Tier | Depth |
|---|---|
| low | Only for money, permissions and anything with states (orders, approvals, subscriptions) |
| moderate | Every component with business logic |
| high | Every component with business logic, plus worked examples for every calculation and a complete authorization matrix |

## Business rules (`BR-n`)

One entry per rule:

| Field | Content |
|---|---|
| ID | `BR-n`, cited by the FRs it refines and the tests that verify it |
| Trigger | The event or operation that invokes it |
| Condition | When it applies |
| Action | What happens |
| Exception | What happens when it can't be applied |
| Source | The FR, policy or stakeholder decision it comes from |

When two rules can conflict, state which wins and why: more specific beats more general, a safety or legal rule beats a convenience rule, and otherwise the later policy decision.

## Entities

For each entity:
- Fields, types and invariants (what must always be true)
- **The one component that owns it.** Other components read it through that owner's interface, never its storage.
- Lifecycle: how it's created, changed, archived and deleted
- What deletion means for linked records (cascade, block, anonymize), and the retention period from its data class

## State machines

For anything with a status field, give a transition table:

| From state | Event | Guard | To state | Side effects |
|---|---|---|---|---|

Check that:
- every state is reachable, and every non-terminal state has a way out
- there are no implicit transitions; anything not in the table is rejected with a defined error
- every guard is a condition a test can set up
- concurrent events on the same record have a defined outcome (e.g. optimistic locking, with the losing request getting a conflict error)

## Calculations

For each calculation: inputs, formula, units, precision, **where rounding happens** and in which direction, and at least three worked examples, including one at a boundary. Store money as integer minor units with a currency code; never in floating point.

## Authorization matrix

One row per operation:

| Operation | Role or attribute | Allowed when | Enforced in |
|---|---|---|---|
| `GET /orders/{id}` | customer | the order belongs to the caller's account | order service, before loading the record |

Every operation in the API contract needs a row. Deny anything not listed. The threat-modeler uses this table directly for elevation-of-privilege and IDOR analysis.

## Workflows

For multi-step operations: the steps, preconditions, timeouts, what happens when a step fails partway (compensation or retry), and the idempotency key that makes a retry safe.

## Error catalogue

| Code | Meaning | Status (HTTP or equivalent) | User-facing message | Retryable | Logged fields |
|---|---|---|---|---|---|

User-facing messages say what happened and what the user can do about it, without revealing internals. Logged fields never include secrets or personal data.

Facts checked against primary sources on 2026-10-14.
