// Tests for approvals, findings, resume, waiver IDs, ui, session-start resume output and shell-write ownership.
import { join } from "node:path"
import { writeFileSync, rmSync, existsSync } from "node:fs"
import { H, SP } from "../lib/harness.ts"
const P = join(SP, "proj2").replaceAll("\\", "/")
let fails = 0, total = 0
async function run(hook: string, ev: object) {
  const p = Bun.spawn([process.execPath, join(H, hook)], { stdin: new TextEncoder().encode(JSON.stringify(ev)), stdout: "pipe" })
  const out = await new Response(p.stdout).text()
  return out ? JSON.parse(out) : {}
}
function expect(name: string, got: unknown, want: unknown) {
  total++
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }
}
const STAGES = ["plan", "requirements", "design", "develop", "test", "deploy", "maintain"]
const STATE = join(SP, "proj2/docs/sdlc/state.json"), DISPATCH = join(SP, "proj2/docs/sdlc/.dispatch.json")
const vs = async (s: unknown) => { writeFileSync(STATE, JSON.stringify(s)); return run("validate-state.ts", { cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/docs/sdlc/state.json` } }) }
const dec = (o: any) => o.decision ?? o.hookSpecificOutput?.permissionDecision ?? "allow"

const base = {
  project: "demo", codebase: "new", ui: true, riskTier: "high", currentStage: "develop",
  stages: {
    ...Object.fromEntries(STAGES.map((s) => [s, { status: "not-started" }])),
    plan: { status: "passed", passedAt: "2026-10-01", approval: { at: "2026-10-01", text: "Looks right, go." }, revisions: 0 },
    design: { status: "passed-with-waivers", passedAt: "2026-10-05", approval: { at: "2026-10-05", text: "Approved with W-1." }, revisions: 2 },
  },
  waivers: [{ id: "W-1", stage: "design", criterion: "Pillar review", reason: "Cost review next sprint", owner: "tom", expires: "2026-11-30" }],
  findings: [
    { id: "F-1", stage: "develop", slice: "S-1", source: "security-reviewer", severity: "high", summary: "Missing authz on export", status: "open" },
    { id: "F-2", stage: "design", source: "security-reviewer", severity: "medium", summary: "No budget alert", status: "waived", waiver: "W-1" },
    { id: "F-3", stage: "develop", source: "tester", severity: "low", summary: "Flaky date test", status: "rejected", decision: "Not a defect: test env clock" },
  ],
  resume: { nextAction: "Fix F-1 in S-1, then re-review", openQuestions: ["Which roles may export?"], loops: { "develop/S-1": 2, design: 1 } },
  history: [],
}
expect("valid full state", dec(await vs(base)), "allow")

const cases: [string, any, string][] = [
  ["passed without approval", { ...base, stages: { ...base.stages, plan: { status: "passed", passedAt: "2026-10-01" } } }, "has no `approval`"],
  ["approval empty text", { ...base, stages: { ...base.stages, plan: { status: "passed", passedAt: "2026-10-01", approval: { at: "2026-10-01", text: " " } } } }, "has no `approval`"],
  ["negative revisions", { ...base, stages: { ...base.stages, plan: { ...base.stages.plan, revisions: -1 } } }, "revisions"],
  ["bad ui", { ...base, ui: "yes" }, "`ui`"],
  ["bad waiver id", { ...base, waivers: [{ ...base.waivers[0], id: "waiver1" }] }, "waivers[0].id"],
  ["duplicate waiver id", { ...base, waivers: [base.waivers[0], { ...base.waivers[0] }] }, "W-1 is used more than once"],
  ["bad finding id", { ...base, findings: [{ ...base.findings[0], id: "1" }] }, "findings[0].id"],
  ["duplicate finding id", { ...base, findings: [base.findings[0], { ...base.findings[0] }] }, "F-1 is used more than once"],
  ["bad severity", { ...base, findings: [{ ...base.findings[0], severity: "severe" }] }, "findings[0].severity"],
  ["bad finding status", { ...base, findings: [{ ...base.findings[0], status: "closed" }] }, "findings[0].status"],
  ["accepted without decision", { ...base, findings: [{ ...base.findings[0], status: "accepted" }] }, "needs the user's `decision`"],
  ["waived without waiver", { ...base, findings: [{ ...base.findings[1], waiver: "W-9" }] }, "doesn't name an existing waiver"],
  ["bad finding slice", { ...base, findings: [{ ...base.findings[0], slice: "slice-1" }] }, "findings[0].slice"],
  ["bad resume loops key", { ...base, resume: { loops: { "dev/S-1": 1 } } }, "resume.loops` key dev/S-1"],
  ["bad resume loops count", { ...base, resume: { loops: { develop: 1.5 } } }, "resume.loops.develop"],
  ["bad open questions", { ...base, resume: { openQuestions: [1] } }, "openQuestions"],
]
for (const [name, state, frag] of cases) {
  const r = await vs(state)
  expect(`${name}: blocked`, dec(r), "block")
  expect(`${name}: mentions ${frag}`, String(r.reason ?? "").includes(frag), true)
}

// ---- session start: resume, findings, leftover dispatch
writeFileSync(STATE, JSON.stringify(base))
writeFileSync(DISPATCH, JSON.stringify({ agents: { developer: { stage: "develop", owns: ["src/**"] } } }))
const ctx: string = (await run("on-session-start.ts", { cwd: P })).hookSpecificOutput?.additionalContext ?? ""
for (const frag of ["Next action: Fix F-1 in S-1, then re-review", `Questions waiting for the user: "Which roles may export?"`,
  "Fix loops used (max 3): develop/S-1=2, design=1.", "Open findings: 1 high (F-1).", ".dispatch.json still lists developer"])
  expect(`session start: ${frag}`, ctx.includes(frag), true)

// ---- ownership guard: shell writes
const AG = { agent_id: "a1", agent_type: "tomdlc:developer", cwd: P }
const sh = (cmd: string, ev: object = AG, tool = "Bash") => run("ownership-guard.ts", { ...ev, tool_name: tool, tool_input: { command: cmd } }).then(dec)
const shellCases: [string, string, string?][] = [
  ["echo hi > src/a.ts", "allow"],
  ["echo hi >> src/notes/b.md", "allow"],
  ["echo hi > .github/workflows/ci.yml", "deny"],
  ["echo hi >.github/ci.yml", "deny"],
  ["npm test 2> errors.log", "deny"],
  ["npm test > /dev/null 2>&1", "allow"],
  ["npm test 2>&1 | tee src/test-output.txt", "allow"],
  ["cat x | tee README.md", "deny"],
  ["sed -i 's/a/b/' infra/main.tf", "deny"],
  ["sed -i 's/a/b/' src/app.ts", "allow"],
  ["sed 's/a/b/' infra/main.tf", "allow"],
  ["cp README.md infra/", "deny"],
  ["cp README.md src/", "allow"],
  ["mv src/old.ts src/new.ts", "allow"],
  ["git diff > src/patch.diff", "allow"],
  ["echo $X > $OUT", "allow"],
  ["cat > infra/x.tf <<'EOF'\nresource {}\nEOF", "deny"],
  ["bash -c 'echo hi > infra/y.tf'", "deny"],
  ["echo '{}' > docs/sdlc/state.json", "deny"],
  ["git status", "allow"],
]
for (const [cmd, want] of shellCases) expect(`shell: ${cmd.split("\n")[0]}`, await sh(cmd), want)
expect("pwsh Set-Content outside", await sh("Set-Content -Path infra\\x.tf -Value 'a'", AG, "PowerShell"), "deny")
expect("pwsh Out-File owned", await sh("'a' | Out-File src\\a.txt", AG, "PowerShell"), "allow")
expect("pwsh Copy-Item dest outside", await sh("Copy-Item src\\a.ts -Destination infra\\a.ts", AG, "PowerShell"), "deny")
expect("pwsh state file", await sh("Set-Content docs\\sdlc\\state.json '{}'", AG, "PowerShell"), "deny")
expect("agent without entry: free", await sh("echo hi > .github/ci.yml", { ...AG, agent_type: "tomdlc:tester" }), "allow")
expect("agent without entry: state still blocked", await sh("echo hi > docs/sdlc/.dispatch.json", { ...AG, agent_type: "tomdlc:tester" }), "deny")
expect("main session: free", await sh("echo hi > .github/ci.yml", { cwd: P }), "allow")
expect("outside project: free", await sh(`echo hi > ${SP.replaceAll("\\", "/")}/elsewhere.txt`), "allow")
rmSync(DISPATCH)

console.log(`${total} checks, ${fails} failures`)

process.exitCode = fails > 0 ? 1 : 0
