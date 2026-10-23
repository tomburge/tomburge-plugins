# Coding standards

Language-agnostic defaults for new code. `docs/sdlc/practices.md` overrides any of them, and in existing code, the code's own established patterns win (see `changing-existing-code.md`).

## Structure
- **Organize by feature, not by layer.** `orders/` containing its handler, logic and storage beats `controllers/`, `services/`, `repositories/` spread across the tree. It keeps a change in one place and matches the design's component boundaries.
- **Keep business logic pure.** Put rules and calculations in functions that don't do I/O. Push I/O (HTTP, database, files, clock, randomness) to the edges and pass it in. Pure code is easy to test and to reason about.
- **One owner per entity.** Only the owning component writes an entity's storage; others call its interface (see the design).
- **Small units.** A function does one thing and fits on a screen. A file that keeps growing is usually two modules.
- **No catch-all modules.** `utils` and `common` grow without limit. Name helpers after what they do, and put them next to their callers.

## Naming
- Names say what something is or does in the domain's vocabulary (the same terms as the requirements and design). Avoid `data`, `info`, `manager`, `handle`, `process` without a qualifier.
- Booleans read as questions (`isExpired`, `hasAccess`). Functions are verbs (`calculateTotal`). Units go in names when the type doesn't carry them (`timeoutMs`, `priceMinorUnits`).

## Errors
- **Validate at the boundary, then trust your types.** Parse untrusted input into well-typed values once, where it enters, and reject what doesn't fit. Inner code shouldn't re-check.
- **Fail fast and loudly on programmer errors** (broken invariants, impossible states). Don't limp on with defaults.
- **Expected failures are values or typed errors**, not generic exceptions. Use whatever is idiomatic: result types, error returns, or specific exception classes. A caller should be able to tell "not found" from "database down".
- **Never swallow an error.** Every catch either handles the error (retry, fallback, translate) or adds context and rethrows. An empty catch block is a defect.
- **Add context when you wrap**: what was being attempted, and with which identifiers, but never secrets or personal data. Keep the original error as the cause.
- **Translate at the edges.** Map internal errors to the design's error catalogue (codes, user-facing messages, status) in one place per interface. No stack traces or internal details leave the process.
- **Clean up resources on every path**: files, connections, locks and temporary data. Use the language's scoped constructs (`with`, `using`, `defer`, try-with-resources).

## Data and state
- Prefer immutable values; mutate only within a small, clear scope.
- Model absence explicitly (optional types, null objects). Don't use magic values like `-1` or empty string for "none".
- Money is integer minor units plus currency; time is UTC instants plus explicit time zones for display (see the functional design).
- No global mutable state. Configuration is read once at startup, validated, and passed in.

## Dependencies
- Inject collaborators (clock, ID generator, HTTP client, repository) through constructors or parameters, so tests can substitute them.
- Every new third-party dependency needs a reason in your result (see the developer agent's rules).

## Logging and observability
Follow `../shared/observability.md`: structured logs at operation boundaries, correlation and trace IDs propagated, and no secrets or personal data.

## Concurrency
- Avoid shared mutable state across threads or tasks. Where it's unavoidable, protect it in one place.
- Make operations that may be retried idempotent (idempotency keys, upserts, deduplication).
- Put timeouts on every wait, and cancellation where the platform supports it.

## Performance hygiene
- Avoid N+1 queries; fetch related data in batches.
- Bound everything that grows with input: page sizes, batch sizes, recursion depth, payload sizes.
- Measure before optimizing; the NFR table says what matters.

## UI code
- Give interactive elements stable test hooks: `data-testid` attributes named after the domain action (`data-testid="checkout-submit"`), not the styling or position. Never select elements in tests by CSS classes or text that designers change.
- Use semantic elements first (see the ux-designer's accessibility spec).

## Comments and docs
- Comments explain *why*: constraints, trade-offs and links to requirement or ADR IDs. Don't narrate what the code says.
- Public interfaces have short doc comments stating inputs, outputs, errors and side effects.

## Before you hand back
- [ ] Names use the domain's vocabulary
- [ ] Input validated at the boundary; no unchecked untrusted data inside
- [ ] No empty catch blocks; errors carry context; edges map to the error catalogue
- [ ] Resources released on every path
- [ ] No new global state; collaborators injected
- [ ] Logs structured, with no secrets or personal data
- [ ] Tests written as described in `unit-testing.md`
- [ ] Nothing speculative, no duplicated knowledge, and no edits outside the slice (`../shared/engineering-principles.md`)

Facts checked against primary sources on 2026-10-14.
