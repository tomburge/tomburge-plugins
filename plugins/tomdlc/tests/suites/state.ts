import { join } from "node:path"
import { writeFileSync } from "node:fs"
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
writeFileSync(join(SP, "proj2/.tomdlc/00-codebase.md"), "# Codebase\n") // an existing-code project
const write = (s: unknown) => writeFileSync(join(SP, "proj2/.tomdlc/state.json"), JSON.stringify(s))
const vs = async (s: unknown) => { write(s); return run("validate-state.ts", { cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/.tomdlc/state.json` } }) }
const dec = (o: any) => o.decision ?? "allow"

const plan = {
  plan: { action: "skip", reason: "Scope is the defect" }, requirements: { action: "light", reason: "Confirm FR-12" },
  design: { action: "skip", reason: "No boundary change" }, develop: { action: "run" }, test: { action: "light", reason: "Regression only" },
  deploy: { action: "light", reason: "Standard path" }, maintain: { action: "skip", reason: "Nothing operational" },
}
const good = {
  project: "demo", codebase: "existing", riskTier: "moderate", currentStage: "develop",
  change: { id: "CH-2", title: "Fix duplicate charge", shape: "bugfix", approvedAt: "2026-10-11", plan },
  stages: {
    plan: { status: "skipped" }, requirements: { status: "passed", passedAt: "2026-10-11", approval: { at: "2026-10-11", text: "Approved." }, revisions: 1 }, design: { status: "skipped" },
    develop: { status: "in-progress", slices: [{ id: "S-1", status: "in-progress" }] }, test: { status: "not-started" },
    deploy: { status: "not-started" }, maintain: { status: "skipped" },
  },
  baseline: { command: "npm test", commit: "abc", recordedAt: "2026-10-11", passed: 412, failed: 2, skipped: 5, failing: ["a", "b"], coverage: 71.4 },
  completedChanges: [{ id: "CH-1", title: "Initial build", shape: "new-project", outcome: "completed", completedAt: "2026-09-01", stages: {} }],
  waivers: [],
  history: [{ date: "2026-10-11", stage: "orient", agent: "orchestrator", outcome: "CH-2 approved" }],
}
expect("full valid state", dec(await vs(good)), "allow")
expect("slice lessons accepted", dec(await vs({ ...good, stages: { ...good.stages, develop: { status: "in-progress", slices: [{ id: "S-1", status: "done", lessons: ["Parser needed a shared error type; S-2 should reuse it"] }] } } })), "allow")
expect("legacy state without change", dec(await vs({ project: "x", currentStage: "plan", stages: Object.fromEntries(STAGES.map((s) => [s, { status: "not-started" }])), waivers: [] })), "allow")

const cases: [string, any, string][] = [
  ["skipped without plan skip", { ...good, stages: { ...good.stages, test: { status: "skipped" } } }, "is skipped, but the change plan"],
  ["skip without reason", { ...good, change: { ...good.change, plan: { ...plan, design: { action: "skip" } } } }, "change.plan.design` is skip and needs a `reason`"],
  ["bad action", { ...good, change: { ...good.change, plan: { ...plan, test: { action: "maybe" } } } }, "change.plan.test.action"],
  ["missing plan stage", { ...good, change: { ...good.change, plan: { ...plan, deploy: undefined } } }, "change.plan.deploy.action"],
  ["bad shape", { ...good, change: { ...good.change, shape: "hotfix" } }, "change.shape"],
  ["bad change id", { ...good, change: { ...good.change, id: "2" } }, "change.id"],
  ["current stage skipped", { ...good, currentStage: "design" }, "which this change skips"],
  ["bad slice", { ...good, stages: { ...good.stages, develop: { status: "in-progress", slices: [{ id: "slice1", status: "doing" }] } } }, "slices[0]"],
  ["bad slice lessons", { ...good, stages: { ...good.stages, develop: { status: "in-progress", slices: [{ id: "S-1", status: "done", lessons: "one long string" }] } } }, "lessons` must be an array of strings"],
  ["slices on test", { ...good, stages: { ...good.stages, test: { status: "not-started", slices: [] } } }, "only allowed on develop"],
  ["baseline counts", { ...good, baseline: { ...good.baseline, passed: -1 } }, "baseline.passed"],
  ["baseline failing > failed", { ...good, baseline: { ...good.baseline, failing: ["a", "b", "c"] } }, "lists more tests"],
  ["baseline no command", { ...good, baseline: { ...good.baseline, command: "" } }, "baseline.command"],
  ["completed change bad", { ...good, completedChanges: [{ id: "CH-1", title: "x", shape: "bugfix", outcome: "done", completedAt: "2026-09-01", stages: {} }] }, "completedChanges[0]"],
  ["bad codebase", { ...good, codebase: "brownfield" }, "`codebase`"],
  ["history bad stage", { ...good, history: [{ date: "2026-10-11", stage: "setup", agent: "x", outcome: "y" }] }, "history[0]"],
]
for (const [name, state, frag] of cases) {
  const r = await vs(state)
  expect(`${name}: blocked`, dec(r), "block")
  expect(`${name}: mentions ${frag}`, String(r.reason ?? "").includes(frag), true)
}

expect("platform accepted", dec(await vs({ ...good, platform: { cloud: "aws", iac: "cdk-python" } })), "allow")
expect("platform without iac yet accepted", dec(await vs({ ...good, platform: { cloud: "aws" } })), "allow")
expect("unsupported cloud rejected", dec(await vs({ ...good, platform: { cloud: "gcp", iac: "terraform" } })), "block")
expect("unsupported iac rejected", dec(await vs({ ...good, platform: { cloud: "aws", iac: "pulumi" } })), "block")
expect("scale accepted", dec(await vs({ ...good, scale: "small", change: { ...good.change, scale: "small" } })), "allow")
expect("bad scale rejected", dec(await vs({ ...good, scale: "tiny" })), "block")
expect("bad change scale rejected", dec(await vs({ ...good, change: { ...good.change, scale: "huge" } })), "block")
expect("preexisting flag accepted", dec(await vs({ ...good, findings: [{ id: "F-1", stage: "develop", severity: "medium", status: "open", summary: "Old parser bug", source: "reviewer", preexisting: true }] })), "allow")
expect("preexisting must be boolean", dec(await vs({ ...good, findings: [{ id: "F-1", stage: "develop", severity: "medium", status: "open", summary: "Old parser bug", source: "reviewer", preexisting: "yes" }] })), "block")

write({ ...good, platform: { cloud: "aws", iac: "terraform" }, change: { ...good.change, scale: "small" } })
const ss = await run("on-session-start.ts", { cwd: P })
const ctx: string = ss.hookSpecificOutput?.additionalContext ?? ""
for (const frag of ["Active change: CH-2 (bugfix): Fix duplicate charge.", "plan=skipped", "Develop slices: S-1=in-progress.", "412 passed, 2 failed, 5 skipped, via `npm test`", "Risk tier: moderate. Scale: small", "Platform: aws, IaC terraform"])
  expect(`session start mentions ${frag}`, ctx.includes(frag), true)

console.log(`${total} checks, ${fails} failures`)

process.exitCode = fails > 0 ? 1 : 0
