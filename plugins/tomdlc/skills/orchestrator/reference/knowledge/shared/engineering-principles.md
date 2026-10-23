# Engineering principles

How to keep designs, code, tests, pipelines, infrastructure and operations config small and easy to change. They apply to every file you write, alongside your other reference files. `.tomdlc/practices.md` overrides them where it conflicts. These rules make you more careful, which costs some speed; for a one-line change, use judgment.

## Think before you build
- **State your assumptions.** If the brief, the design or the slice can be read more than one way, don't pick one silently. Choose the simplest reading that meets the Done-when, mark it `ASSUMPTION:` (in a code comment or your result) and list the question under **Questions for the user**.
- **Surface trade-offs.** When there's a simpler approach than the one the brief implies, say so in your result. If something doesn't make sense, report it rather than guessing.

## Simplicity first (YAGNI)
Write the least code that meets the slice's requirements, its Done-when and the controls the risk tier requires. Nothing more:
- No features, options, flags or extension points that no requirement asks for.
- No abstraction (interface, base class, factory, plugin hook) with a single implementation, unless the design names a second one or a test needs the seam.
- No configuration for values that never change; a named constant is enough. Limits that an NFR or SR sets are configuration (see `tuning.md`).
- No error handling for states that can't happen. Handle the failures the design, the abuse cases and the edge-case sweep name, and fail fast on the rest.
- In a design, no component, service, queue, cache, screen, alarm or dashboard that no requirement, NFR or threat needs. Name the requirement each one serves; if there isn't one, leave it out.
- If 200 lines could be 50, rewrite it. Ask: would a senior engineer call this overcomplicated?

YAGNI never removes a security control, a test for a requirement or mitigation, or input validation at a trust boundary. Those are required, not speculative.

## One source of truth (DRY)
- **Each piece of knowledge lives in one place:** a business rule, a validation, a constant, a schema, a policy or a config value. Derive the rest from it (generate types from the contract, reuse the validation, reference the constant).
- **Duplicated logic is a defect when the copies must change together.** If fixing a bug in one copy would leave the same bug in another, merge them.
- **Don't merge code that only looks alike.** Two pieces of code that happen to match but would change for different reasons should stay separate. Wait for a third real use before extracting a shared helper; a wrong abstraction costs more than duplication.
- In documents, state a fact once and refer to it by its ID (`FR-n`, `SR-n`, `T-n`, `ADR-n`) rather than restating it.
- This applies to tests, pipelines and IaC too: shared fixtures and builders over copy-pasted setup, one reusable workflow or module over near-identical copies, and values from a single variables or config file.

## Surgical changes
- **Touch only what the slice needs.** Every changed line should trace back to the slice, a finding or a defect in your brief.
- **Match the existing style** (naming, structure, idioms, comment density), even where you'd do it differently.
- **Don't improve adjacent code, comments or formatting**, and don't refactor what isn't broken. Report it under **Findings** instead.
- **Clean up only your own mess.** Remove imports, variables and functions that your change left unused. Don't delete dead code that was already there; mention it under Findings.

## Goal-driven execution
- **Turn the task into checks before you start.** For a bug, write a test that reproduces it, then make it pass. For a feature, write the tests for its requirements and Done-when. For a refactor, make sure tests pass before and after.
- **For multi-step work, plan each step with its check:** "1. [step] → verify: [check]". Verify each step before moving on.
- **Done means verified.** Report the real test, lint and scan output; never claim a result you didn't see.

## For reviewers (code mode)
Check the diff against these principles and report violations as findings:
- Speculative code (unused options, single-implementation abstractions, handling for impossible states): **low**, or **medium** when it adds attack surface or a dependency.
- Duplicated logic or knowledge whose copies must change together: **medium**, since the copies will drift.
- Changes outside the slice's scope: **medium** when they change behavior, **low** when they're only style.
- A security control, required test or boundary validation is never a YAGNI violation.

Adapted from the Karpathy guidelines (MIT): https://github.com/multica-ai/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md
