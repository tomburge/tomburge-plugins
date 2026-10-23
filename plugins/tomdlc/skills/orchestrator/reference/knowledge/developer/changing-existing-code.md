# Changing existing code

On an existing codebase, the hardest question after a change is "did I break anything?". It can only be answered against a record of how things stood before. These rules apply whenever your slice modifies code that already exists.

## The test baseline

The orchestrator records a baseline before Develop starts and gives it to you in the brief: the test command, the commit, pass/fail/skip counts, the names of tests that were already failing, and coverage if available.

- After your changes, run **the same command** and compare.
- A test that was failing in the baseline and still fails is **pre-existing**. Don't fix it unless your slice is about it; list it under Findings.
- A test that passed in the baseline and now fails is a **regression**. Fix it before finishing; never mark it skipped, quarantined or expected-to-fail to get green.
- Report the comparison in your result: baseline counts, after counts, and each test whose status changed.
- Never lower coverage thresholds, add coverage exclusions, or delete tests to make the numbers work.

If the brief has no baseline and you're changing existing code, say so under Questions for the user, and run the suite before your first edit so you have one.

## Blast radius

Before editing, work out what your change can affect:

1. **Change surface:** the files and functions you'll modify.
2. **Dependents:** who calls or imports them. Search the codebase, including dynamic references such as string-based routing, reflection, config files and templates.
3. **Covering tests:** which tests exercise that code. If none do, write characterization tests that pin down current behavior before changing it.
4. **Contracts:** public APIs, database schemas, message formats, config keys and CLI flags your change touches. Changing any of these affects consumers outside this repo.
5. **Impact rating:**
   - low: internal to one component with good test coverage
   - medium: crosses components, or coverage is thin
   - high: changes a contract, shared code, auth or data handling, or has no covering tests

Put the blast radius in your result under **Files changed**: a table of files, dependents, covering tests and impact, plus the overall rating. A high rating that the slice plan didn't anticipate goes under Handoffs, so the orchestrator can decide whether the design or threat model needs revisiting.

## While changing
- Preserve public signatures and behavior unless the slice says otherwise.
- Don't refactor unrelated code in the same slice; note it under Findings instead.
- Match the existing patterns of the code you're in, even where you'd choose differently, unless `.tomdlc/practices.md` says otherwise.
- Keep commits or change notes small and tied to requirement IDs.

Facts checked against primary sources on 2026-10-14.
