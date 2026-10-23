# TomDLC handoff

Where TomDLC stands as of 2026-10-21, how it's been checked, and what to do next. `README.md` describes what the plugin does; this file is for whoever develops it next.

## State
- **Branch:** `main`, nothing pushed (no remote). The latest work is the run 1 and run 3 fixes (`b3f84c8`, `8f46996`).
- **Tests:** `bun test` passes all 10 suites. Run it after every change; `tests/README.md` lists what each suite covers.
- **Layout:** `skills/orchestrator/SKILL.md` is the orchestrator. `agents/*.md` are the 14 stage agents. `hooks/hooks.json` wires the Bun handlers in `hooks-handlers/` (shared code in `hooks-handlers/lib/`). Method detail lives in `skills/orchestrator/reference/` (gates, tuning, change shapes, control map) and `reference/knowledge/<agent>/` (`knowledge/README.md` says which file goes to which agent). `scripts/` has the traceability checker and the scanner-report importer.

## How changes are made
- **Prompt changes are tested by live runs; hook changes by the suites.** A rule in `SKILL.md` or an agent file only proves itself when an orchestrator follows it in a real run. A hook change needs a suite test first.
- **Write rules from evidence.** Most of the guidance in `tuning.md`, `user-runbooks.md` and the "found live" notes in `SKILL.md` came from a run where something went wrong. Say what happened next to the rule, so a later reader knows why it's there.
- **Keep the knowledge files fact-checked.** They were checked against primary sources on 2026-10-14. For compliance values, point at scanner compliance packs (Prowler, Trivy, AWS Config) rather than writing figures by hand.
- **Commits:** one commit per batch of fixes, with a body that lists them. Never push.

## Live runs
Headless sessions drive TomDLC on a sample project, one fresh session per stage. A person answers every gate, and their reply is relayed word for word.

**Harness** (in `C:\tmp\tomdlc-wt\`, outside the repo; recreate it if it's gone):
```bash
#!/usr/bin/env bash
# run-agentic.sh <project dir> <out name> <budget> <prompt>  -- headless TomDLC session with NO AWS credentials
cd "$1" || exit 1
NOAWS=$(cd /c/tmp/tomdlc-wt/noaws && pwd -W)   # noaws/ holds empty `config` and `credentials` files
env -u AWS_SDK_LOAD_CONFIG -u AWS_PROFILE AWS_CONFIG_FILE="$NOAWS/config" AWS_SHARED_CREDENTIALS_FILE="$NOAWS/credentials" AWS_EC2_METADATA_DISABLED=true \
  CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 claude -p "$4" --plugin-dir C:/repos/tom/tomdlc --permission-mode auto --max-budget-usd "$3" --output-format json > "../$2.json" 2> "../$2.err"
python -X utf8 -c "import json;d=json.load(open('../$2.json',encoding='utf-8'));print('== $2 cost',round(d.get('total_cost_usd',0),2),'min',round(d.get('duration_ms',0)/60000,1));print(d.get('result'))" 2>&1 || tail -5 "../$2.err"
```
`emptyhome/` is an empty folder to point `HOME` and `USERPROFILE` at for credential-free builds.

**Rules that keep runs honest:**
- **Agents never get cloud credentials.** The person running the test does every deploy, diff and teardown, with the named profiles only.
- **Relay the user's words verbatim.** Explain context in a parenthetical after the quote. Relay a promotion's "Approve" only after the orchestrator has opened the request (an early one is refused, correctly).
- **Never hand anyone a logout command** (`aws sso logout` and the like); a runbook's cleanup once signed the user out of every profile.
- **Agree a budget and pause at it.** Report spend after every session. Costs below are what runs actually cost, not estimates.
- **Before resuming after an interruption,** check for a still-running `claude -p` process: one survived an editor restart, kept writing state and finished its reviews.
- Put sample projects under `C:\tmp\tomdlc-wt\`, not the scratchpad: git worktrees fail under the scratchpad's path.

**Windows notes:** use `python -X utf8`; set `MSYS_NO_PATHCONV=1` for AWS CLI paths in Git Bash; quote comma lists in PowerShell. Claude Code's auto mode refuses production changes (security services, `cdk deploy`) until the user explicitly authorizes that action in the conversation.

**AWS test accounts:** profiles `cloudstuff-dev` (216989109848), `cloudstuff-stage` (225989341518) and `cloudstuff-prod` (183631320106), in an AWS Organization whose admin account (879381267286) manages Security Hub and GuardDuty in us-east-1. CDK is bootstrapped (v32, qualifier `hnb659fds`) in all three, in us-east-1 and us-west-2. Don't remove it.

## What's been proven live

| Run | Project (deleted after) | What it covered | Cost |
|---|---|---|---|
| Early runs, 2026-10-12..14 | tempconv, logredact, hookrelay, textkit, cdk-urlshort, tf-statuscheck, linkshelf | The full lifecycle at low and moderate tiers; parallel slices in worktrees; scanner-report intake; CDK and Terraform deploys to one dev account; the UX designer | ~$395 for the first full run, then $77–$160 each |
| Run 1, 2026-10-14..19 | taskbox (CDK TS, low, small) | dev/stage/prod in separate accounts, one-word promotions P-1..P-6, the guards' negative paths, restore drill, rollback rehearsal, pilot-light failover into us-west-2, teardown in all three accounts | ~$140 |
| Run 3, 2026-10-19..20 | payledger (existing code, high, small) | Orientation on code TomDLC hadn't seen (it found both planted defects plus a real one), high-tier gates, a mid-change re-scope, an incident routed to an incident-fix proposal | ~$132 |
| Run 4, 2026-10-20 | orderfeed (existing deployed service, moderate) | An incident-fix change end to end: sre triage, fix, test against a copy of production, rehearsal, deploy, verified export, postmortem routed to five stages | ~$18, plus a lost session |

Every run turned up fixes that were committed afterwards; the commit log has them.

## What's next
1. **Run 2: Terraform with environments, and CI/CD on GitHub.** This is the main path never run live. It also needs a GitHub repository for the pipeline and branch-protection evidence. Add the `dev-prod` environment set and the shared-account override to the same run; they cost little extra. Expect $130–150.
2. **Watch the high tier at the small scale.** Run 3 spent about $130 on two slices of a 300-line service. `tuning.md` now caps the counts. A future high-tier run should show whether that's enough.
3. **Still untested live, lower value:** the `dev`-only set, warm-standby and active-active DR, CDK in Python, medium and large scale, spikes and discovery mode. The suites cover their rules.

## Open questions about the plugin
- **Session cost.** One long session gets expensive: late turns cost far more than early ones, so the orchestrator checkpoints `resume` at each gate, pushes heavy work into agents and relies on compaction (the session-start hook re-orients it afterwards) instead of asking the user for a new session. If runs still overspend, look at what each stage's brief passes in.
- **Review convergence.** Rework passes at the high tier tended to produce one more medium per re-check. The convergence rules in `tuning.md` should stop that; confirm in the next high-tier run.
