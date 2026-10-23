# Agent knowledge

Reference material that agents read during their work. Each agent's prompt stays short; the method detail lives here.

## How it's used
- Files are grouped by agent (`knowledge/<agent>/*.md`), plus `knowledge/shared/*.md` for topics several agents need.
- The orchestrator lists the relevant files as **absolute paths** under **Reference files** in each brief. Agents read them with the Read tool.
- Pass only what the brief's mode and change need, using the table below.
- Always add `shared/engineering-principles.md` (YAGNI, DRY, surgical changes, verified goals) for the agents that design or build: the architect, ux-designer, platform-engineer, developer (except in spike mode), devsecops-engineer, tester, security-tester, release-engineer and sre. Also pass it to the reviewer in code mode.

## Which files to pass

| Agent | Mode or situation | Files |
|---|---|---|
| planner | Plan | `planner/planning.md`, `../templates/practices.md`, `shared/risk-register.md`, `shared/branching.md`, `shared/web-research.md` |
| planner | Discovery | `planner/discovery.md`, `shared/web-research.md` |
| planner | Assessment | `../templates/practices.md` |
| planner | Questions | `planner/planning.md`, `requirements-analyst/story-quality.md` (its questions section) |
| requirements-analyst | Every dispatch, including questions mode | `requirements-analyst/edge-cases.md`, `requirements-analyst/nfr-templates.md`, `requirements-analyst/story-quality.md`, `requirements-analyst/completeness.md`, `shared/web-research.md` |
| requirements-analyst | Compliance drivers or personal data exist | `requirements-analyst/compliance-privacy.md` |
| requirements-analyst | Setting or changing SLOs | `shared/slo.md` |
| architect | Codebase analysis | `architect/codebase-analysis.md` |
| architect | Design (full) | `architect/architecture-method.md`, `architect/functional-design.md`, `architect/api-design.md`, `architect/data-modelling.md`, `architect/delivery-slices.md`, `release-engineer/deployment-strategies.md`, `shared/observability.md`, `shared/recovery-drills.md`, plus `architect/domain-modelling.md` when the domain is complex |
| architect | Light or update | The files above that cover what's changing; always `architect/delivery-slices.md` when adding slices |
| ux-designer | Design (when `ui` is true) | `ux-designer/ux-design.md`, `ux-designer/accessibility.md` |
| threat-modeler | Every dispatch | `threat-modeler/threat-modeling.md` (its Cloud (AWS) prompts section when `platform` is set) |
| platform-engineer | Design mode | `platform-engineer/aws-foundations.md`, `platform-engineer/environments.md`, `architect/architecture-method.md` (its ADR and mechanism settings sections), `shared/recovery-drills.md` |
| platform-engineer | Develop mode | `platform-engineer/terraform.md` or `platform-engineer/cdk.md` (by `platform.iac`), `platform-engineer/aws-foundations.md`, `devsecops-engineer/pipeline-gates.md` (its IaC gates section), `shared/user-runbooks.md` |
| platform-engineer | Deploy prep or drift mode | `platform-engineer/environments.md`, plus `platform-engineer/terraform.md` or `platform-engineer/cdk.md`, `shared/user-runbooks.md` |
| reviewer | Requirements or architecture mode | `reviewer/reviewing.md` |
| reviewer | Code mode | `reviewer/reviewing.md`, `developer/coding-standards.md` |
| security-reviewer | Design review or pillar review | `security-reviewer/pillar-review.md`, plus `requirements-analyst/compliance-privacy.md` when compliance drivers apply |
| security-reviewer | Code review | `security-reviewer/pillar-review.md` (its suppression and re-review sections), plus `security-reviewer/iac-review.md` for `infra/**` and plan or diff output |
| security-reviewer | Design review when `platform` is set | Add `platform-engineer/aws-foundations.md` and `security-reviewer/iac-review.md` |
| devsecops-engineer | Every dispatch | `devsecops-engineer/pipeline-gates.md`, `shared/branching.md` |
| developer | Every slice | `developer/coding-standards.md`, `developer/unit-testing.md`, `shared/observability.md`, `shared/user-runbooks.md` (when the slice adds live checks or saved queries), plus `architect/api-design.md` when the slice implements an API and `architect/data-modelling.md` when it changes the schema |
| developer | Spike mode | `developer/spikes.md` |
| developer | Plan mode | `developer/changing-existing-code.md`, `developer/coding-standards.md` |
| developer | Existing code | `developer/changing-existing-code.md` |
| tester | Every dispatch | `tester/test-depth.md`, `tester/performance-testing.md`, `shared/user-runbooks.md` (when the user runs live tests) |
| security-tester | Every dispatch | `security-tester/security-testing.md`, `shared/user-runbooks.md` (when the user runs live tests) |
| release-engineer | Every dispatch | `release-engineer/zero-downtime-release.md`, `release-engineer/deployment-strategies.md`, `shared/recovery-drills.md`, `shared/branching.md`, `shared/user-runbooks.md`, plus `requirements-analyst/compliance-privacy.md` when compliance drivers apply |
| sre | Every dispatch (add `sre/aws-posture.md` when `platform` is set) | `sre/incident-response.md`, `sre/runbooks.md`, `shared/slo.md`, `shared/observability.md`, `shared/recovery-drills.md`, `shared/risk-register.md`, `shared/user-runbooks.md`, plus `requirements-analyst/compliance-privacy.md` when compliance drivers apply |

## Project and team overrides
Projects add their own material without editing the plugin:

| Location | Contents | Who writes it |
|---|---|---|
| `docs/sdlc/practices.md` | Team practices: code style, testing approach, branching, deployment cadence, Mandated, Forbidden and Learned rules. Template: `../templates/practices.md` | Drafted by the planner; learned rules are added by the orchestrator with the user's consent |
| `docs/sdlc/standards/shared/*.md` | Standards every agent follows (e.g. mandated tools, forbidden libraries) | The user or the team |
| `docs/sdlc/standards/<agent>/*.md` | Additions for one agent (e.g. `requirements-analyst/edge-cases.md` with project-specific conditions) | The user or the team, or an agent the orchestrator assigns |

When a project file conflicts with a plugin knowledge file, the project file wins.
