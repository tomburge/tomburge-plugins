# tomdlc

A Claude Code plugin for a secure software delivery lifecycle. It combines the seven standard SDLC stages with DevOps, DevSecOps and Secure SDLC (NIST SSDF) practices, run by a central orchestrator that dispatches specialist agents.

## Quick start

1. Install [Bun](https://bun.sh). Every hook and script runs on it.
2. Install the plugin (Claude Code 2.1.275 or later):

   ```text
   /plugin install tomdlc --marketplace tomburge/tomburge-plugins
   ```

   On earlier versions, add the marketplace first:

   ```text
   /plugin marketplace add tomburge/tomburge-plugins
   /plugin install tomdlc@tomburge-plugins
   ```

3. In your project, run `/tomdlc` and describe what you want to build or change. To jump to a stage, add its name: `/tomdlc design`. If another plugin or command already uses the name `tomdlc`, type `/tomdlc:tomdlc` instead.
4. The orchestrator proposes a plan (which stages run, at what depth). Approve it in your own words, then answer its questions and approve each stage gate as it comes up. Everything it produces goes into `docs/sdlc/`.
5. After a gate passes, you can start a fresh session and run `/tomdlc` again. It picks up where you stopped.

## Updating

Refresh the marketplace so Claude Code sees the latest plugin versions, then update the plugin:

```sh
claude plugin marketplace update tomburge-plugins
claude plugin update tomdlc@tomburge-plugins
```

Restart Claude Code to load the new version. If you installed the plugin for a project rather than for your user, add `--scope project` (or `--scope local`) to the update command.

Your project's `docs/sdlc/` files are not touched by an update.

## How it works

```
                       ┌──────────────────────────────┐
           user  ◄───► │  orchestrator (main session) │  owns state.json, gates, approvals
                       └──────────────┬───────────────┘
            dispatches briefs ▼       ▲ results: summary, gate self-assessment,
                                      │          questions, handoffs, findings
   planner · requirements-analyst · architect · ux-designer · threat-modeler
   reviewer · devsecops-engineer · developer · security-reviewer · tester
   security-tester · release-engineer · sre · platform-engineer
```

- **Only the orchestrator creates agents.** Agents have no Agent tool. When an agent needs another specialist, it returns a *handoff*, and the orchestrator decides whether to dispatch it.
- **Only the orchestrator talks to the user.** Agents return their questions, and the orchestrator asks them and resumes the agent with the answers.
- **Only the orchestrator passes stages.** It verifies agent output against `skills/orchestrator/reference/gates.md`, asks for your approval, records it in your own words, and writes `docs/sdlc/state.json`.
- **Independent review.** At the moderate and high tiers, a `reviewer` that can't write files tries to refute the requirements, the design and the code, without seeing the authors' reasoning. In code mode it checks the implementation against the design, contracts and functional design, and runs the tests and the traceability check. Any critical finding, or more than two high ones, means NOT READY.
- **Spikes with evidence.** Unknowns the plan can't settle go to a time-boxed spike: a developer working only in `spike/`, on synthetic data, measured against numeric exit criteria. Long runs go to the background rather than being watched. Results are verified against raw outputs, and you decide; spikes are tracked in `state.json`.
- **Plan before code where it matters.** For risky slices (by tier), the developer first returns its blast radius and approach without editing. Surprises (auth, a contract, a schema) go to you before any code is written.
- **Risks, not just findings.** A risk register (risks, assumptions, issues, dependencies) with likelihood, impact, treatment and owner is reviewed at every gate. Accepting a risk needs your words.
- **Lifecycle-long compliance and cost.** Releases carry Compliance and Cost sections; Maintain collects compliance evidence on schedule and reviews spend against the budget; the deployment record captures what actually happened at deploy.
- **Findings are tracked by ID.** Reviewer and tester findings go into a register (`F-n`). Re-reviews answer Fixed or Still applies per ID, and findings you've decided (waived, accepted, rejected) aren't re-raised.
- **Questions before drafts.** For vague requests, the planner or requirements-analyst first returns its questions with proposed defaults. The orchestrator asks you, reads the answers back with any contradictions flagged, records them verbatim in `docs/sdlc/decisions.md`, and only then dispatches the draft.
- **Provable approvals.** A hook records every prompt you submit, with secrets redacted. The approval guard only lets a gate pass, a change plan, a finding or risk decision, or a waiver be recorded when the stated words match something you actually typed after it came up.
- **Approvals stay current.** When a stage passes, or the reviewer says READY, its documents are fingerprinted. If one changes later, even outside Claude, it's flagged, and no later stage can pass until you re-approve it.
- **Tamper-evident audit trail.** Hooks append every dispatch, agent completion, gate decision (with your approval text), waiver, finding decision, skipped stage and production command to `docs/sdlc/audit.jsonl`. Each line carries the hash of the line before it, and session start verifies the chain. No tool can write the log, and `history` in `state.json` is append-only: inserting, editing or removing an entry is refused before the write.
- **Sessions resume where they stopped.** `state.json` keeps the next action, open questions and fix-loop counts, and session start shows them with open findings and any interrupted dispatch.
- **AWS infrastructure as code.** When the system runs on AWS (`platform` in `state.json`), a `platform-engineer` designs the accounts, identity, network, data protection, logging and cost (`03-platform.md`), builds infrastructure slices in Terraform or AWS CDK (TypeScript or Python) with tests, scanners and plan-time policy checks, prepares the reviewed plan for Deploy (`06-infra.md`), and checks drift in Maintain while the sre reviews AWS security posture. Agents never apply: the production guard blocks `terraform apply`, `cdk deploy`, `cdk bootstrap` and mutating `aws` calls, including through `npx`, `uv run` and similar launchers.
- **Incidents go to the sre first.** When you report a production incident, the sre confirms the cause and names the stage that should have caught it before an `incident-fix` change is proposed. The postmortem routes the lesson back to that stage.
- **Commands for you run as written.** Agents that hand you commands (deploys, live tests, drills, teardown) follow `knowledge/shared/user-runbooks.md`: guards that halt the script, expected output observed from the real service, a review step separate from the change it reviews, and never a command that signs you out of your cloud session.
- Independent agents run in parallel with disjoint file ownership. Review and fix cycles are capped at 3 loops (per slice in Develop) before the orchestrator escalates to the user.

| # | Stage | Agents | Output in `docs/sdlc/` |
|---|-------|--------|------------------------|
| 0 | Orient (existing code) | architect (codebase analysis) ‖ planner (assessment) | `00-codebase.md`, `practices.md` |
| 1 | Plan | planner | `01-plan.md`, `practices.md` |
| 2 | Requirements | requirements-analyst, including an edge-case sweep → reviewer (moderate and high tiers) | `02-requirements.md` |
| 3 | Design | (architect ‖ ux-designer when there's a UI) → platform-engineer (on AWS) → threat-modeler → security-reviewer (design review, plus pillar review at moderate and high tiers) ‖ reviewer (moderate and high tiers) | `03-design.md` (functional design, delivery slices), `03-ux.md`, `03-threat-model.md`, `03-platform.md`, API contract files |
| 4 | Develop | devsecops-engineer, then per slice: developer (plan, when required) → developer, or platform-engineer for infrastructure slices → security-reviewer ‖ reviewer (code mode, by tier) | code, `infra/**`, CI pipeline, `04-develop.md` |
| 5 | Test | tester ‖ security-tester, with fixes routed to the developer | tests, `05-test-report.md` |
| 6 | Deploy | platform-engineer (plan review, on AWS) → release-engineer (prepares the release; never deploys) | `06-infra.md`, `06-release.md` |
| 7 | Maintain | sre (with AWS posture checks) ‖ platform-engineer (drift), with root causes routed back to earlier stage agents | `07-operations.md` |

Start with `/tomdlc`, optionally followed by a stage name, e.g. `/tomdlc design`. If another plugin or command already uses the name `tomdlc`, type `/tomdlc:tomdlc` instead. The orchestrator also triggers on requests like "fix this bug", "threat model this" or "are we ready to release".

### Sized to the change, scaled to the tier and the project
- **Scale** (small, medium or large, set in Plan) decides *how much ceremony*: questions per round, review rounds, how low findings are handled (batched, never a reason for another round), document length and gate format. Changes to existing projects are reviewed only where they touch, and findings about untouched parts don't block them. Large projects are split into several changes and batched by area. See `skills/orchestrator/reference/tuning.md`.
- **Change shapes** decide *which* stages run. Each piece of work is classified (`new-project`, `feature`, `bugfix`, `security-patch`, `refactor`, `infra-change`, `incident-fix` or `docs-only`), and each stage is set to `run`, `light` or `skip` with a reason. You approve the plan before anything is dispatched. Escalation rules add process back when a change touches trust boundaries, sensitive data or poorly tested code. See `skills/orchestrator/reference/change-shapes.md`.
- **Risk tiers** (low, moderate or high, set in Plan) decide *how deep* each stage goes. The scale's counts (requirements, threats, slices) still hold at the high tier: the tier buys depth on the money and trust-boundary paths, not more of everything. Pre-existing problems a change doesn't need fixed are offered as their own change. `skills/orchestrator/reference/control-map.md` has the scaling table and maps the stages to NIST SSDF, OWASP SAMM, ASVS, SLSA and DORA.
- Finished changes are archived in `state.json` with their gate results, so every cycle keeps its evidence.

### Existing codebases
- On first contact, the architect writes `00-codebase.md`: stack and commands, component inventory, entry points (the starting point for the threat model), dependency graph, coupling hotspots, test coverage, security observations, and an honest statement of what it did and didn't read.
- Before Develop, the orchestrator runs the test suite and records a **baseline**. The developer reports a **blast radius** for each slice and compares the suite against the baseline afterwards. Develop and Test gates fail on any new failure.

### Delivery slices
The architect splits Develop into slices (`S-n`): a walking skeleton first, then dependency and risk order. Each slice has its own owned files, Done-when and review requirement. The orchestrator runs the developer and the reviews slice by slice. What each slice teaches (wider blast radius, deviations, wrong assumptions, recurring findings) is recorded on the slice and passed to every later slice, and the remaining order is re-checked against it. Independent slices can run in parallel, up to three at once, each developer in its own git worktree with its own dispatch key (`developer#S-2`). The hooks keep one shared state and audit log in the main checkout, and the orchestrator merges each slice after review.

### Knowledge and project practices
- Every agent gets method detail from `skills/orchestrator/reference/knowledge/`, passed as absolute paths in its brief. `knowledge/README.md` maps the files to agents and modes. Topics:
  - **Planning:** optional discovery (problem evidence, alternatives including buying and doing nothing, riskiest assumptions, a proceed, narrow, pivot or stop recommendation), risk tiers, data classification controls, budget, build/buy/reuse, the risk register, branching strategy
  - **Requirements:** a completeness checklist of standard capabilities, user types, INVEST and story splitting, story map and MVP line, an edge-case sweep with expected outcomes, NFR templates, compliance and privacy (PIA, data subject rights, residency, evidence, FedRAMP and SOC 2, compliance through the lifecycle)
  - **Design:** architecture style and boundaries, NFR-to-mechanism mapping, cost, functional design (business rules, state machines, authorization matrix, error catalogue), domain modelling (event storming, aggregates, context maps), data modelling (store choice, keys, indexes, migrations), deployment strategy choice, API contracts, delivery slices, codebase analysis, UX and WCAG 2.2 accessibility
  - **Security:** threat modeling (forgotten elements, risk matrix, refresh triggers), pillar review, security test patterns, DAST and fuzzing
  - **Build, test and release:** pipeline gates and scanner suppressions, coding standards and error handling, unit testing, changing existing code, coverage, mutation and accessibility testing, performance test shapes, zero-downtime releases and feature flags
  - **Operations:** SLOs and burn-rate alerts, observability, incident response, runbooks (including leaked secrets), recovery drills and game days
  - **Commands for the user:** how to write runbooks that run as written, PowerShell pitfalls, and AWS behaviours observed in live runs that expected outputs must reflect

### Scripts
Both need [Bun](https://bun.sh); the orchestrator runs them.
- `scripts/check-trace.ts <project root> [--tests <dir>] [--matrix]`: a traceability check run at each gate. It reports undefined and duplicate IDs, Must FRs missing from the design or slices, FRs and SRs no test mentions, and threats the test report doesn't cover. `--matrix` prints the end-to-end table (requirement → design → slices → tests → test report) that the orchestrator saves as `docs/sdlc/traceability.md`.
- `scripts/import-findings.ts <report>`: normalizes SARIF, Semgrep, gitleaks, npm audit, pip-audit, OSV, Trivy, Sonar and Dependabot output into finding candidates with severity and auto-fixability. This is the entry point for "here's a scan, fix it". Secret values are never printed.
- Projects add their own rules without editing the plugin: `docs/sdlc/practices.md` (code style, testing approach, branching, Mandated, Forbidden and Learned rules) and `docs/sdlc/standards/<agent or shared>/*.md`. Project files override plugin knowledge. The orchestrator offers to record your corrections as learned rules.

## Hooks

All hooks need [Bun](https://bun.sh). Shared parsing and helpers live in `hooks-handlers/lib/`. The hooks tell the main session (the orchestrator) apart from agents by the `agent_id` field Claude Code sends from inside a subagent.

The PreToolUse guards run through `hooks-handlers/fail-closed.ts`. Claude Code lets a call through when a hook crashes, so the wrapper denies the call instead if a guard fails to load, throws or runs past its deadline (`TOMDLC_GUARD_TIMEOUT_MS`, default 20 s), and names the broken guard.

| Hook | Event | What it does |
|---|---|---|
| `on-session-start` | SessionStart | Tells Claude the project's current stage and flags expired waivers. Also re-runs after compaction. |
| `block-claude-cli` | PreToolUse: Bash, PowerShell | Blocks any command that would launch Claude Code: directly, by path, wrapped (`sudo`, `xargs`, `Start-Process`, `&`), nested (`bash -c`, `pwsh -Command`/`-EncodedCommand`, `eval`, `$(...)`) or through a package runner. Mentions of the word (`grep claude`, commit messages) are allowed. |
| `prod-guard` | PreToolUse: Bash, PowerShell | Production-change guard. **Denied for agents; asks you to confirm in the main session.** Covers Terraform/OpenTofu/Terragrunt, Pulumi, kubectl/oc, Helm, AWS/GCP/Azure CLIs and Az/AWS PowerShell cmdlets, Ansible, deploy CLIs (cdk, sam, serverless, vercel, netlify, fly, firebase, wrangler, heroku, …), image and package publishing, risky `gh` commands, and force or delete pushes. Plain `git push` and `gh pr create` are blocked for agents only. Read-only and dry-run forms (`plan`, `diff`, `--dry-run`, `--check`) pass. Also gates environments: a deploy aimed at stage or prod is denied for everyone until its promotion is approved. |
| `ownership-guard` | PreToolUse: Write, Edit, MultiEdit, NotebookEdit, Bash, PowerShell | Nobody can write the audit log, its snapshot or saved agent reports with tools. Agents can't write `docs/sdlc/state.json`, `docs/sdlc/.dispatch.json` or `docs/sdlc/decisions.md`, and the orchestrator can't write the first two with shell commands (only with Write or Edit, so the state checker and approval guard run). A TomDLC agent with an entry in `.dispatch.json` can only write project files matching its `owns` globs, whether with the file tools or with shell commands whose targets are visible (`>`, `>>`, `tee`, `sed -i`, `cp`/`mv` destinations, PowerShell `Set-Content`/`Out-File`/`Copy-Item`). Also denies Bash redirects to `NUL` (Git Bash on Windows creates a file named NUL); use `/dev/null`. |
| `secrets-guard` | PreToolUse: Write, Edit, MultiEdit | Blocks writes containing high-confidence secrets (cloud keys, private keys, API tokens). |
| `validate-state` | PostToolUse: Write, Edit, MultiEdit | Checks `state.json` and `.dispatch.json` against their schemas after each write, and reports errors back to Claude. Includes the risk register, the deployment record, and change plans that run a stage whose inputs don't exist because their producer is skipped (or skip Design for high-tier code changes). |
| `post-write-scan` | PostToolUse: Write, Edit, MultiEdit | Runs gitleaks (any file) and semgrep (code and IaC) on the file just written, and reports findings without echoing secret values. Silent if neither tool is installed. semgrep config is the project's `.semgrep.yml` or `.semgrep/`, else `$TOMDLC_SEMGREP_CONFIG`, else `p/default`. |
| `agent-report-check` | SubagentStop | Sends a TomDLC agent back once if its result is missing a required section (Summary, Files changed, Gate self-assessment, Questions for the user, Handoffs, Findings). |
| `web-guard` | PreToolUse: WebFetch, WebSearch | The planner and requirements-analyst can research on the web. Queries and fetches containing secrets are denied for everyone, and agents can't fetch local, private, internal or non-http(s) addresses. Every query and fetch is logged in the audit log. |
| `audit-prompt` | UserPromptSubmit | Records each prompt you submit in `docs/sdlc/audit.jsonl`, with secrets redacted, so approvals can be checked against your actual words. Never blocks. |
| `approval-guard` | PreToolUse: Write, Edit, MultiEdit on `state.json` | Denies recording a gate approval, a change-plan approval, an accepted or rejected finding or risk, or a waiver granted or widened, unless the words (or the double-quoted part) match a prompt you submitted after the item came up. The approval must also come after the last change to the stage's documents; earlier words count only as a recorded conditional approval (`conditional`, `changes`), and never at the high tier. Denies passing a stage while a document approved at an earlier gate has changed since, and, at the high tier, when the stage's documents changed after the reviewer's READY. Promotions need the one-word reply **Approve** after the promotion was requested, and sharing an AWS account between environments needs your words. Refuses any write that inserts, edits or removes a `history` entry. |
| `audit-events` | SubagentStart, SubagentStop, PostToolUse: Write, Edit, MultiEdit, Bash, PowerShell | Appends hash-chained events to `docs/sdlc/audit.jsonl`: dispatches, agent completions (with the reviewer's verdict), and events derived from each `state.json` write (changes approved and archived, stage and slice status with your approval text, waivers, findings and decisions, baseline, settings) and from `decisions.md` writes. Also logs every file written with the file tools (path, author, hash), risk register changes and the deployment record, and saves each TomDLC agent's full report to `docs/sdlc/reports/` (hook-only) with its hash. Rejects rewrites of earlier `history` entries. When the live log reaches 20,000 entries (`TOMDLC_AUDIT_ROTATE_LINES`) it rotates into `docs/sdlc/audit-archive/`: the chain continues into the new file, the snapshot records each archive's hash, and reading and verification span all segments. After shell commands, catches `state.json` changes made outside the file tools (e.g. by a script), logs them and sends them back to be redone with Edit; the approval guard judges writes against the last recorded state, so such a change can't slip an approval through. The production guard also logs what it blocked or asked about, and session start verifies the chain. |

**Limits:** the shell hooks read the command text, so a determined workaround could still get through, such as writing a script and then running it. Shell ownership checks only see targets written in the command itself; a script that writes files internally isn't attributed, so agent prompts also forbid writing files through the shell.

## Environments and promotions
Cloud projects deploy through local → dev → stage → prod, or a shorter set chosen in Requirements: **dev only**, **dev and prod**, or **dev, stage and prod**. For each environment you give its AWS account, CLI profile and region.
- **HA/DR:** Requirements also settles availability per journey, RPO and RTO per scenario, a DR strategy (backup and restore, pilot light, warm standby or active-active) and the regions: primary per environment and a different DR region when the strategy needs one. Design shows how each is met, and Maintain drills the region failover.
- **Separate accounts:** each environment gets its own account. Sharing one is flagged as not recommended and needs your explicit approval in your own words.
- **Develop deploys only to dev,** and each dev deploy you report is recorded (`environments.devDeploys`: build, account, smoke result). Stage and prod are reached only by promotion of the same build, in order, and the first promotion out of dev is valid only for a build that passed its smoke test in dev.
- **Drills come first.** Before the first production release, the restore drill and the rollback rehearsal run in the environment below prod, then the go/no-go, then the prod deploy.
- **Promotions need one word:** the orchestrator opens the promotion request in the same message that hands you its runbook, shows what will be promoted, and asks you to reply **Approve**. Nothing else counts. The approval guard checks the reply, and the production guard blocks any deploy aimed at stage or prod (by profile or an environment-named var file) until that promotion is approved, for Claude and agents alike.

## Who runs deploys
Agents never deploy or apply: the production guard blocks `terraform apply`, `cdk deploy`, `cdk bootstrap`, mutating `aws` calls and deploy scripts for them, however they're launched. You run deploys, with the plan or diff the platform-engineer prepared in `06-infra.md`:
- **Terraform:** apply the saved, reviewed plan file (`terraform apply dev.tfplan`), so what's applied is what was reviewed.
- **CDK:** run `cdk deploy --app cdk.out <stack>` in your own terminal and confirm the IAM and security-group changes it shows. If you ask Claude to run it in the main session, the production guard asks you first, and Claude Code's auto mode may also refuse non-interactive forms such as `--require-approval never` unless you authorize that specific deploy.
- Keep agent sessions away from cloud credentials altogether (for example, run them with empty AWS config and credentials files), since a guard can't see what an SDK call inside a script does.

## Keeping sessions affordable

Each turn re-reads the whole conversation, so one long session through several stages gets expensive fast. In a full live run, early turns cost under $1 and late ones about $70. TomDLC keeps its state in files, so you don't need a long session:
- **Start a fresh session per stage.** When a gate passes, open a new session and run `/tomdlc`. The session-start summary (stage, change, slices, next action, open questions, findings, drift) and `docs/sdlc/state.json` carry everything over. The orchestrator suggests this at each gate.
- **Agent reports are files.** Full reports are saved in `docs/sdlc/reports/`, so the conversation only needs summaries.
- **Headless runs** (`claude -p`): headless mode stops background agents after 10 minutes. Set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` when running the orchestrator non-interactively, and cap each run with `--max-budget-usd`.

## Developing the plugin

- **Tests:** `bun test` runs every suite in `tests/suites/`, each driving the hook handlers the way Claude Code does. See `tests/README.md`.
- **Live runs:** the hooks' tests can't show how agents behave in a real lifecycle, so TomDLC is also checked with headless end-to-end runs on sample projects. `HANDOFF.md` has the method, the results so far and what's still untested.
- **Releasing:** bump `version` in `.claude-plugin/plugin.json` with every release. Claude Code compares versions to decide whether there is an update, so changes pushed without a bump don't reach installed copies.

## Install

From the `tomburge-plugins` marketplace (Claude Code 2.1.275 or later):

```text
/plugin install tomdlc --marketplace tomburge/tomburge-plugins
```

## Install locally

```sh
claude --plugin-dir /path/to/tomdlc
```
