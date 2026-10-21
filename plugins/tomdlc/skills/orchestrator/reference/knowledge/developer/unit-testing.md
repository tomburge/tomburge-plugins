# Unit testing

How the developer writes the tests that ship with each slice. The tester adds integration, end-to-end, performance and accessibility tests later; your tests prove each unit behaves as the requirements and functional design say.

## Testing approach
Follow the **Testing approach** in `docs/sdlc/practices.md`:
- **Test-first or TDD:** write a failing test, make it pass, then refactor. Report evidence in your result: the test name and that it failed before the change.
- **Test-after** (the default if practices are silent): write the tests in the same slice as the code, never "later".
- **Bug fixes, always:** first write a test that reproduces the bug and fails, then fix it. This is the regression test.

## What to test
| Unit type | Test |
|---|---|
| Business rules (`BR-n`) and calculations | Every rule, each worked example from the functional design, boundaries and rounding |
| State machines | Every allowed transition, and that invalid transitions are rejected with the right error |
| Validation and parsing at trust boundaries | Valid input; each kind of invalid input; limits (empty, maximum length, malformed, unexpected types) |
| Authorization checks | Allowed and denied for each row of the authorization matrix that the unit enforces |
| Error handling | Each error path maps to the right error-catalogue entry; nothing leaks internals |
| Adapters (repositories, HTTP clients) | Against fakes or test containers, not mocks of the library |

Also write a negative test for each abuse case (`AC-n`) and threat mitigation (`T-n`) that the slice implements.

## How to write them
- **Arrange, act, assert.** Set up, do one thing, check the outcome. One behavior per test.
- **Name the behavior:** `rejects_temperature_below_absolute_zero`, not `test_convert_3`. Include the requirement ID in the name, a tag or a comment, so the traceability check can find it.
- **Assert on outcomes, not implementation:** check return values, state and emitted events, not which private methods were called. Tests that mirror the implementation break on every refactor.
- **Deterministic:** inject the clock, random sources and ID generators. No sleeps, no dependency on test order, no real network.
- **Test doubles at boundaries you own:** fake your repository interface, not the database driver. Prefer a simple in-memory fake to a mock with many expectations.
- **Test data builders:** create valid objects with defaults and override only what the test is about. No shared fixtures that tests modify.
- **Property-based tests** for logic with wide input domains: round-trips (parse then format), invariants, and agreement with a simple reference implementation.
- **Keep them fast:** the whole unit suite should run in seconds to a couple of minutes.

## Don't
- Don't delete, skip or weaken an existing test to make your change pass. If a test is wrong, say so under Findings.
- Don't add coverage exclusions or lower thresholds (see the tester's test depth guide).
- Don't assert on log text or error message wording unless the requirement specifies the wording.

Facts checked against primary sources on 2026-10-14.
