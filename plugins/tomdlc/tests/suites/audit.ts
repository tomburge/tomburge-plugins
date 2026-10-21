import { join } from "node:path"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { H, SP } from "../lib/harness.ts"
const DIR = join(SP, "proj3"), P = DIR.replaceAll("\\", "/")
rmSync(DIR, { recursive: true, force: true })
mkdirSync(join(DIR, "docs/sdlc"), { recursive: true })
const AUDIT = join(DIR, "docs/sdlc/audit.jsonl"), STATE = join(DIR, "docs/sdlc/state.json")
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
const events = () => (existsSync(AUDIT) ? readFileSync(AUDIT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [])
const names = (from: number) => events().slice(from).map((e) => e.event)
const writeState = async (s: unknown) => {
  writeFileSync(STATE, JSON.stringify(s))
  return run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/docs/sdlc/state.json` } })
}
const STAGES = ["plan", "requirements", "design", "develop", "test", "deploy", "maintain"]
const stages = Object.fromEntries(STAGES.map((s) => [s, { status: "not-started" }]))
const plan = Object.fromEntries(STAGES.map((s) => [s, { action: "run" }]))
const h1 = { date: "2026-10-12", stage: "orient", agent: "orchestrator", outcome: "CH-1 approved" }
const h2 = { date: "2026-10-12", stage: "plan", agent: "planner", outcome: "draft accepted" }

const v1: any = { project: "demo", codebase: "new", currentStage: "plan", stages, waivers: [], history: [] }
await writeState(v1)
expect("v1 events", names(0), ["state_initialized"])

let n = events().length
const v2: any = {
  ...v1, riskTier: "moderate", change: { id: "CH-1", title: "Initial build", shape: "new-project", plan, approval: { at: "2026-10-12", text: "Go ahead." } },
  stages: { ...stages, plan: { status: "passed", passedAt: "2026-10-12", approval: { at: "2026-10-12", text: "Ship the plan." } } },
  waivers: [{ id: "W-1", stage: "plan", criterion: "Signed commits", reason: "Later", owner: "tom", expires: "2026-12-01" }],
  findings: [{ id: "F-1", stage: "plan", source: "reviewer", severity: "high", summary: "No budget", status: "open" }],
  history: [h1],
}
await writeState(v2)
expect("v2 events", names(n), ["setting_changed", "change_approved", "stage_status_changed", "waiver_granted", "finding_recorded", "stage_fingerprinted"])
expect("approval text logged", events().find((e) => e.event === "stage_status_changed")?.approval, "Ship the plan.")

n = events().length
const v3: any = {
  ...v2, findings: [{ ...v2.findings[0], status: "accepted", decision: "Budget is TBD by finance; accepted." }],
  stages: { ...v2.stages, develop: { status: "in-progress", slices: [{ id: "S-1", status: "in-progress" }] } }, history: [h1, h2],
}
await writeState(v3)
expect("v3 events", names(n), ["stage_status_changed", "slice_status_changed", "finding_status_changed"])
expect("decision logged", events().at(-1)?.decision, "Budget is TBD by finance; accepted.")

n = events().length
const r4 = await writeState({ ...v3, history: [h2] })
expect("history rewrite blocked", r4.decision, "block")
expect("history rewrite logged", names(n), ["history_rewritten"])

n = events().length
const r5 = await writeState(v3)
expect("restoring history accepted", r5.decision ?? "allow", "allow")
expect("restore logs nothing", names(n), [])

n = events().length
await writeState({ ...v3, baseline: { command: "npm test", recordedAt: "2026-10-12", passed: 3, failed: 0, skipped: 0, failing: [] } })
expect("baseline event", names(n), ["baseline_recorded"])

n = events().length
await run("audit-events.ts", { hook_event_name: "SubagentStart", cwd: P, agent_id: "a9", agent_type: "tomdlc:reviewer" })
await run("audit-events.ts", { hook_event_name: "SubagentStop", cwd: P, agent_id: "a9", agent_type: "tomdlc:reviewer",
  last_assistant_message: "Done.\n### Summary\nNOT READY: 1 critical, 2 high\n### Findings\n..." })
expect("subagent events", names(n), ["agent_dispatched", "agent_stopped"])
expect("reviewer verdict", events().at(-1)?.verdict, "NOT READY")
expect("summary line", events().at(-1)?.summary, "NOT READY: 1 critical, 2 high")

n = events().length
writeFileSync(join(DIR, "docs/sdlc/decisions.md"), "# Decisions\n")
await run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/docs/sdlc/decisions.md` } })
expect("decisions event", names(n), ["decisions_recorded"])

n = events().length
const pg = await run("prod-guard.ts", { cwd: P, tool_name: "Bash", tool_input: { command: "terraform apply -auto-approve" } })
expect("prod guard asks", pg.hookSpecificOutput?.permissionDecision, "ask")
expect("prod guard logged", names(n), ["production_command"])
expect("prod guard log detail", events().at(-1)?.decision, "asked user")

// chain verification via session start
const ss = async () => (await run("on-session-start.ts", { cwd: P, source: "startup" })).hookSpecificOutput?.additionalContext ?? ""
expect("chain intact", /Audit log: \d+ entries, chain intact\./.test(await ss()), true)
expect("session_started logged", events().at(-1)?.event, "session_started")
const all = readFileSync(AUDIT, "utf8").split("\n").filter(Boolean)
const target = all.findIndex((l) => l.includes("Ship the plan."))
writeFileSync(AUDIT, all.map((l, i) => (i === target ? l.replace("Ship the plan.", "Ship it.") : l)).join("\n") + "\n")
expect("edited line detected", (await ss()).includes(`line ${target + 2} doesn't chain`), true)
writeFileSync(AUDIT, all.slice(0, -3).join("\n") + "\n")
expect("truncation detected", /truncated/.test(await ss()), true)
writeFileSync(AUDIT, all.join("\n") + "\n")

// concurrent writers (parallel agents, several hooks per event) must not break the chain
{
  const CON = join(SP, "proj-concurrent")
  mkdirSync(join(CON, "docs/sdlc"), { recursive: true })
  const conP = CON.replaceAll("\\", "/")
  const procs = Array.from({ length: 24 }, (_, i) =>
    Bun.spawn([process.execPath, join(H, "audit-prompt.ts")], { stdin: new TextEncoder().encode(JSON.stringify({ cwd: conP, prompt: `prompt ${i}` })), stdout: "pipe" }),
  )
  await Promise.all(procs.map((p) => p.exited))
  const conLines = readFileSync(join(CON, "docs/sdlc/audit.jsonl"), "utf8").split("\n").filter(Boolean)
  expect("all concurrent events written", conLines.length, 24)
  const { verifyAudit } = await import(join(H, "lib", "audit.ts"))
  expect("chain intact after concurrent writes", verifyAudit(CON).problem, null)
  expect("lock released", existsSync(join(CON, "docs/sdlc/.audit.lock")), false)
}

// protections
const og = (ev: object, tool: string, input: object) =>
  run("ownership-guard.ts", { cwd: P, ...ev, tool_name: tool, tool_input: input }).then((o) => o.hookSpecificOutput?.permissionDecision ?? "allow")
const AG = { agent_id: "a1", agent_type: "tomdlc:developer" }
expect("main Write audit denied", await og({}, "Write", { file_path: `${P}/docs/sdlc/audit.jsonl` }), "deny")
expect("main Edit snapshot denied", await og({}, "Edit", { file_path: `${P}/docs/sdlc/.audit-state.json` }), "deny")
expect("main shell append denied", await og({}, "Bash", { command: "echo x >> docs/sdlc/audit.jsonl" }), "deny")
expect("main shell sed denied", await og({}, "Bash", { command: "sed -i 1d docs/sdlc/audit.jsonl" }), "deny")
expect("main shell read allowed", await og({}, "Bash", { command: "cat docs/sdlc/audit.jsonl" }), "allow")
expect("main git add allowed", await og({}, "Bash", { command: "git add docs/sdlc/audit.jsonl" }), "allow")

// Bash has no NUL device: redirecting to it creates a file named NUL
for (const c of ["bun test 2>nul", "ls > NUL", "cmd &>nul", "x 2>> nul; echo ok"])
  expect(`bash NUL redirect denied: ${c}`, await og(AG, "Bash", { command: c }), "deny")
for (const c of ["bun test 2>/dev/null", "echo nul > out.txt", "cat null.txt", "grep -r nullable src"])
  expect(`bash without a NUL redirect allowed: ${c}`, await og({}, "Bash", { command: c }), "allow")
expect("PowerShell NUL not judged by the Bash rule", await og({}, "PowerShell", { command: "bun test 2>$null" }), "allow")
expect("agent audit denied", await og(AG, "Write", { file_path: `${P}/docs/sdlc/audit.jsonl` }), "deny")
expect("agent decisions denied", await og(AG, "Write", { file_path: `${P}/docs/sdlc/decisions.md` }), "deny")
expect("main decisions allowed", await og({}, "Write", { file_path: `${P}/docs/sdlc/decisions.md` }), "allow")

// the main session writes state.json with Write/Edit only, so the checker and approval guard see it
expect("main shell redirect to state denied", await og({}, "Bash", { command: "echo {} > docs/sdlc/state.json" }), "deny")
expect("main Set-Content on dispatch denied", await og({}, "PowerShell", { command: "Set-Content docs/sdlc/.dispatch.json '{}'" }), "deny")
expect("main inline script writing state denied", await og({}, "Bash", { command: `python -c "import json;json.dump({}, open('docs/sdlc/state.json','w'))"` }), "deny")
expect("main shell read of state allowed", await og({}, "Bash", { command: "cat docs/sdlc/state.json 2>/dev/null" }), "allow")
expect("main script read of state allowed", await og({}, "Bash", { command: `python -c "import json;print(json.load(open('docs/sdlc/state.json'))['currentStage'])"` }), "allow")
expect("main git add of state allowed", await og({}, "Bash", { command: "git add docs/sdlc/state.json" }), "allow")

// a script that rewrote state.json without showing it is caught after the command
{
  const before = readFileSync(STATE, "utf8")
  const shellPost = () => run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, tool_name: "Bash", tool_input: { command: "bun tools/update.ts" } })
  expect("unchanged state: shell command passes", (await shellPost()).decision ?? "allow", "allow")
  writeFileSync(STATE, JSON.stringify({ ...JSON.parse(before), currentStage: "test" }))
  const caught = await shellPost()
  expect("script-written state is blocked back to Claude", caught.decision, "block")
  expect("and logged", events().at(-1)?.event, "state_changed_outside_tools")
  await shellPost()
  expect("logged once while unresolved", events().filter((e) => e.event === "state_changed_outside_tools").length, 1)
  writeFileSync(STATE, before)
  expect("restored state passes", (await shellPost()).decision ?? "allow", "allow")
}

// questions-mode dispatch entry blocks all writes
writeFileSync(join(DIR, "docs/sdlc/.dispatch.json"), JSON.stringify({ agents: { planner: { stage: "plan", owns: ["<none>"] } } }))
expect("questions mode write denied", await og({ agent_id: "a2", agent_type: "tomdlc:planner" }, "Write", { file_path: `${P}/docs/sdlc/01-plan.md` }), "deny")
const vd = await run("validate-state.ts", { cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/docs/sdlc/.dispatch.json` } })
expect("<none> dispatch entry valid", vd.decision ?? "allow", "allow")
rmSync(join(DIR, "docs/sdlc/.dispatch.json"))

// rotation: the live log moves to an archive segment, the chain continues, archives are protected
{
  const RD = join(SP, "proj-rotate"); mkdirSync(join(RD, "docs/sdlc"), { recursive: true })
  const RP = RD.replaceAll("\\", "/")
  const rotEnv = { ...process.env, TOMDLC_AUDIT_ROTATE_LINES: "5" }
  const promptR = async (text: string) => {
    const p = Bun.spawn([process.execPath, join(H, "audit-prompt.ts")], { stdin: new TextEncoder().encode(JSON.stringify({ cwd: RP, prompt: text })), stdout: "pipe", env: rotEnv })
    await p.exited
  }
  for (let i = 1; i <= 12; i++) await promptR(`prompt ${i}`)
  const { verifyAudit, readAudit, readSnapshot } = await import(join(H, "lib", "audit.ts"))
  const snap = readSnapshot(RD)
  expect("two segments archived", snap.segments.map((s: any) => [s.file, s.entries]), [["docs/sdlc/audit-archive/audit-0001.jsonl", 5], ["docs/sdlc/audit-archive/audit-0002.jsonl", 5]])
  const live = readFileSync(join(RD, "docs/sdlc/audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
  expect("live log starts with log_rotated", [live[0].event, live[0].archived], ["log_rotated", "docs/sdlc/audit-archive/audit-0002.jsonl"])
  expect("chain intact across segments", verifyAudit(RD).problem, null)
  const all = readAudit(RD)
  expect("reading spans every segment", [all.filter((e: any) => e.event === "user_prompt").length, all.filter((e: any) => e.event === "log_rotated").length], [12, 2])
  expect("archived events stay visible to the guards", all.some((e: any) => e.event === "user_prompt" && e.text === "prompt 1"), true)
  const seg1 = join(RD, "docs/sdlc/audit-archive/audit-0001.jsonl")
  const original = readFileSync(seg1, "utf8")
  writeFileSync(seg1, original.replace("prompt 1", "prompt X"))
  expect("an edited archive is detected", String(verifyAudit(RD).problem).includes("audit-0001.jsonl was changed"), true)
  rmSync(seg1)
  expect("a deleted archive is detected", String(verifyAudit(RD).problem).includes("audit-0001.jsonl is missing"), true)
  writeFileSync(seg1, original)
  expect("restored archive verifies", verifyAudit(RD).problem, null)
  const ogR = (input: object, tool = "Write") => run("ownership-guard.ts", { cwd: RP, tool_name: tool, tool_input: input }).then((o) => o.hookSpecificOutput?.permissionDecision ?? "allow")
  expect("archive write denied", await ogR({ file_path: `${RP}/docs/sdlc/audit-archive/audit-0001.jsonl` }), "deny")
  expect("archive shell delete denied", await ogR({ command: "rm docs/sdlc/audit-archive/audit-0001.jsonl" }, "Bash"), "deny")
}

// non-TomDLC project: nothing written
const OTHER = join(SP, "plain-proj")
rmSync(OTHER, { recursive: true, force: true }); mkdirSync(OTHER)
await run("audit-events.ts", { hook_event_name: "SubagentStart", cwd: OTHER.replaceAll("\\", "/"), agent_id: "x", agent_type: "Explore" })
expect("no audit outside TomDLC projects", existsSync(join(OTHER, "docs")), false)

console.log(`${total} checks, ${fails} failures`)

process.exitCode = fails > 0 ? 1 : 0
