# Change shapes

Not every change needs all seven stages. Before any work starts, the orchestrator classifies the change, proposes which stages and agents run, and gets the user's approval. The goal is the smallest workflow that still delivers the change safely. Every skipped or lightened step needs a one-line reason the user can challenge.

## Stage actions

| Action | Meaning |
|---|---|
| `run` | The stage runs in full for the risk tier. |
| `light` | The stage runs with a narrowed brief: only the agents and outputs listed for the shape, and only the gate criteria that apply. Mark the others N/A with a reason when evaluating the gate. |
| `skip` | The stage doesn't run. Its status becomes `skipped`, and its reason is recorded in the change plan. |

## Default plans

These are starting points. Adjust them with the escalation rules below.

| Shape | Use when | Plan | Requirements | Design | Develop | Test | Deploy | Maintain |
|---|---|---|---|---|---|---|---|---|
| `new-project` | Nothing exists yet | run | run | run | run | run | run | run |
| `feature` | New capability in an existing system | light: scope, data classes, tier check | run | run: update design and threat model | run | run | run | light: runbook and alerts for the feature |
| `bugfix` | Behavior differs from an existing requirement | skip: scope is the defect | light: confirm or correct the requirement the bug violates | skip, unless the fix changes a design element or trust boundary | run: regression test first, then fix | light: regression and affected tests | light: standard release path | skip |
| `security-patch` | Vulnerable dependency, scanner finding or reported vulnerability | skip | skip | light: threat-modeler checks whether the finding reveals an unmodeled threat | run: fix with a regression test per finding | light: re-scan, plus security-tester on the affected threats | run: expedited, within the remediation SLA | light: sre records the finding as remediated |
| `refactor` | Structure changes, behavior must not | skip | skip | light: architect records the target structure as an ADR | run: baseline required, no behavior change | light: full existing suite against the baseline | light | skip |
| `infra-change` | IaC, pipeline or platform configuration | light: scope and blast radius | skip, unless it affects SLOs or RPO/RTO | run: deployment design and threat model for changed boundaries | run: devsecops-engineer or release-engineer owns the change | light: IaC scan, plan review, smoke tests | run | light: alerts and runbook |
| `incident-fix` | Fixing the cause of a production incident | skip | light: add the missing requirement if the postmortem found one | light: update the threat model if the cause was security-related | run | light: regression test for the incident | run: expedited | run: postmortem and routing |
| `docs-only` | Documentation with no code or config change | skip | skip | skip | light: the change itself | skip | skip | skip |

The shape decides which stages run; the change's **scale** (`tuning.md`) decides how heavy each one is. Set `change.scale` from the change itself: a bugfix in a large system is usually small. For changes to existing projects, also follow the "Changes to existing projects" rules in `tuning.md`: questions and reviews cover only what the change touches, and findings about untouched parts are `preexisting`.

## Escalation rules

Escalate a stage from `skip` to `light` or `run`, or from `light` to `run`, when any of these holds:

- **Unclear intent:** the expected behavior is ambiguous or disputed → run Requirements.
- **Trust boundaries:** the change touches authentication, authorization, input handling at a trust boundary, cryptography, secrets, or restricted or confidential data → run Design (threat model update), and run the security-reviewer in Develop.
- **Wide blast radius:** many components or shared code are affected, or the codebase analysis lists the area as a coupling hotspot → run Design.
- **Weak verification:** the affected area has little or no test coverage → run Test, and have the developer add characterization tests before changing behavior.
- **New dependencies or data types:** add a supply-chain check in Develop, and run Plan's data classification for new data types.
- **Risk tier:** at the high tier, never skip Design's threat-model check for code changes, and never lighten the security-reviewer.

Never skip:
- the secrets guard, the production-change guard or other hooks
- the test baseline for changes to existing code
- the security-reviewer for changes touching trust boundaries

## Recording the plan

Record the approved plan in `state.json` under `change` (see the orchestrator skill). Show it to the user as a table: stage, action, agents and reason. Ask them to approve or change it before any dispatch. When new evidence appears mid-change (e.g. the developer finds the fix touches auth), propose the escalation and get approval before changing a pending stage. Never change a stage that has already passed or been skipped without the user agreeing to reopen it.

## Changing the plan mid-change

- **Escalating** a pending stage (skip → light → run) adds protection. Propose it with the evidence and record it; the approval guard doesn't require new words, but tell the user.
- **Lightening** a pending stage (run → light → skip) removes protection, for example when Design turns out to be unnecessary. Explain why, ask, and record the user's words in `change.plan.<stage>.decision` (quoted). The approval guard rejects a lightened stage without them. The escalation rules above still win: never lighten what they require.
- Update `reason` for the stage either way. The audit log records every plan update.

## Saved plans

When the user tailors a plan they'll want again (e.g. "dependency bumps: Develop light, Test light, Deploy light, nothing else"), offer to save it as a preset in the `practices` register (`kind: "preset"`, with a `name`, the `shape` it applies to, and in `rule` each stage's action and reason, and when it doesn't apply). It appears in `practices.md` under **Stage plan presets**. When sizing a later change, offer a matching preset as the starting proposal. It's still shown and approved like any plan, and the escalation rules still apply.
