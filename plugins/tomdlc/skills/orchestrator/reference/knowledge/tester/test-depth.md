# Test depth

**Fit the scale in your brief.** Aim for confidence, not counts: at least one test per requirement, mitigation and applicable edge case. At the small scale, don't add exhaustive input combinations or tests of implementation details just to grow the suite.

## Coverage by risk tier

| Tier | Coverage | Mutation testing |
|---|---|---|
| low | No numeric target; every critical path has a test | None |
| moderate | Line and branch coverage reported in CI; no decrease allowed; around 70% line coverage as a guide | Optional |
| high | 80% line coverage plus branch coverage on modules handling money, permissions or sensitive data; no decrease allowed | On those critical modules (e.g. Stryker, PIT, mutmut); investigate surviving mutants |

Coverage shows what *ran*, not what was *checked*. Mutation testing shows whether the tests would notice a bug.

Never reach a target by:
- adding coverage exclusions or ignore pragmas
- lowering thresholds
- deleting tests
- writing tests without assertions

A genuine exclusion (e.g. generated code) needs a reason in the config and a waiver.

## Test doubles
- Mock only at boundaries you own (your repository interface, your HTTP client wrapper), not third-party library internals.
- Prefer fakes (an in-memory implementation) over mocks for complex dependencies.
- Use real dependencies in integration tests where it's practical (e.g. throwaway database containers).
- Verify external APIs with contract tests rather than trusting mocks.

## Consumer-driven contract tests
Use them when you own both sides of an API, or another team owns the other side and you can agree to share contracts (e.g. services in the same system).
- Each consumer publishes its expectations: the requests it sends and the response fields it relies on (Pact or similar).
- The provider verifies every consumer's contract in its CI. A failing verification blocks the provider's merge.
- Version contracts and store them in a broker (e.g. Pact Broker) or a shared repo, tagged by environment.
- Before deploy, check that the version being deployed is compatible with the versions of its consumers and providers already running (e.g. `can-i-deploy`).

This catches breaking changes before deploy that a schema can't, such as the provider no longer returning an optional field that a consumer depends on. It complements the API schema lint and breaking-change check; it doesn't replace them.

## Test data
- Build data with factories or builders inside each test. No shared fixtures that tests mutate.
- Isolate tests: transactional rollback, a fresh database per test run, or unique IDs per test.
- Synthetic data only. Never copy restricted production data into a test environment; if production-like data is essential, mask or synthesize it.

## Property-based testing
For pure logic with wide input domains (parsers, calculations, serializers), generate inputs and check properties such as round-trips, invariants and agreement with a simple reference implementation.

## CI cadence

| When | What | Target time |
|---|---|---|
| Every push | Lint, unit tests | Under 10 minutes |
| Every pull request | Integration and contract tests | Under 20 minutes |
| Main branch, nightly or pre-release | End-to-end, accessibility, performance regression | Under an hour |

## Tests you can't run (live-only)
Some tests can only run against the deployed system: load and spike runs, live negative probes, TLS and header checks, throttling. You can't run them, so their expectations are guesses until someone does. In the AWS live runs, four of these failed the first time because the test was wrong: a best-effort throttle, API Gateway answering 400 where the test expected 404, a TLS check that misread an error, and a script crash.
- Mark each one **UNVERIFIED** in the test report (and in the script header) until its first real run, with what it assumes about the platform (status codes, limits, timing, client behaviour).
- Prefer assertions on what the platform guarantees ("rejected, and no result data in the body") over exact codes or counts it doesn't guarantee.
- Run every script you can against a local stub or recorded responses, so syntax and logic errors surface before the user runs it.
- **After the first real run**, triage each failure: a **test defect** (wrong expectation or bug in the script: fix the test, finding source `tester`) or a **system defect** (a real gap: finding against the code or infrastructure). Then remove the UNVERIFIED mark.

## Flaky tests
Quarantine a flaky test visibly (a tag, plus a ticket with an owner), and fix or delete it within an agreed time, such as two weeks. A quarantined test still counts as untested coverage.

## Escape rate
An escape is a defect found after Test (e.g. in Deploy, or in production) that the tests should have caught.

- Count it per change: escaped defects ÷ all defects found for the change.
- Record each escape in `05-test-report.md` (or `07-operations.md` if found in production): the defect, where it was found, the requirement ID (FR-n, NFR-n, SR-n), the tier where a test should have caught it (unit, integration, contract, end-to-end), and the missing test.
- Add that test before closing the defect. It must fail without the fix.
- In Maintain, the sre reviews the trend by area and test tier. A rising rate means test depth for that area or tier is too low: add tests there, or raise its coverage or mutation target.

## Test case template
For manual and UAT tests, and complex scenario tests that need a written script, record each case in `05-test-report.md`:

| Field | Content |
|---|---|
| ID | TC-n |
| Covers | Requirement IDs, e.g. FR-3, SR-7 |
| Preconditions | System state, user role, feature flags |
| Data | Synthetic test data used |
| Steps | Numbered actions |
| Expected result | Observable outcome for each step or at the end |
| Actual / evidence | What happened; screenshot, log or recording link |
| Status | Pass, fail (with defect ID) or blocked |

## Accessibility testing (when there's a user interface)

The target level comes from the `NFR [a11y]` requirement. Automated tools catch only part of WCAG failures, so do both kinds of check.

**Automated, in CI:** run axe-core, or pa11y, on every key page and state (including error and empty states). Fail the build on violations at the target level.

**Manual, before release, on each critical flow:**
- Keyboard only: everything reachable and operable; focus always visible and not hidden behind sticky headers; logical order; no keyboard traps; Escape closes dialogs.
- Screen reader smoke test (NVDA or JAWS on Windows, VoiceOver on macOS and iOS): headings and landmarks make sense; controls have names; form errors are announced.
- Zoom to 200%, and reflow at 320 CSS pixels wide (equivalent to 400% zoom) without loss of content or horizontal scrolling.
- Contrast: 4.5:1 for normal text; 3:1 for large text, icons and control boundaries.
- `prefers-reduced-motion` is respected; nothing flashes more than 3 times a second.

Record results per flow, against the WCAG level, in `05-test-report.md`.

Facts checked against primary sources on 2026-10-14.
