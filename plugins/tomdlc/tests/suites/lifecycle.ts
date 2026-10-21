import { join } from "node:path"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { H, SP, SCRIPTS } from "../lib/harness.ts"
const DIR = join(SP, "proj5"), P = DIR.replaceAll("\\", "/")
rmSync(DIR, { recursive: true, force: true })
mkdirSync(join(DIR, "docs/sdlc"), { recursive: true })
const STATE = join(DIR, "docs/sdlc/state.json"), AUDIT = join(DIR, "docs/sdlc/audit.jsonl")
let fails = 0, total = 0
async function run(hook: string, ev: object) {
  const p = Bun.spawn([process.execPath, join(H, hook)], { stdin: new TextEncoder().encode(JSON.stringify(ev)), stdout: "pipe" })
  const out = await new Response(p.stdout).text()
  return out ? JSON.parse(out) : {}
}
async function script(name: string, ...args: string[]) {
  const p = Bun.spawn([process.execPath, join(SCRIPTS, name), ...args], { stdout: "pipe", stderr: "pipe" })
  return await new Response(p.stdout).text()
}
function expect(name: string, got: unknown, want: unknown) {
  total++
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }
}
const events = () => (existsSync(AUDIT) ? readFileSync(AUDIT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [])
const validate = async (s: any) => {
  writeFileSync(STATE, JSON.stringify(s))
  return run("validate-state.ts", { cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/docs/sdlc/state.json` } })
}
const audit = async (s: any) => {
  writeFileSync(STATE, JSON.stringify(s))
  return run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/docs/sdlc/state.json` } })
}
const dec = (o: any) => o.decision ?? o.hookSpecificOutput?.permissionDecision ?? "allow"

const STAGES = ["plan", "requirements", "design", "develop", "test", "deploy", "maintain"]
const plan = (overrides: Record<string, string>) =>
  Object.fromEntries(STAGES.map((s) => [s, overrides[s] ? { action: overrides[s], reason: overrides[s] === "run" ? undefined : "because" } : { action: "run" }]))
const base = (shape: string, p: any, tier = "moderate") => ({
  project: "demo", riskTier: tier, currentStage: "develop",
  change: { id: "CH-2", title: "x", shape, plan: p },
  stages: Object.fromEntries(STAGES.map((s) => [s, { status: p[s].action === "skip" ? "skipped" : "not-started" }])),
  waivers: [], history: [],
})

// ---- A1: skipped-stage dependencies
const bugfix = plan({ plan: "skip", requirements: "light", design: "skip", deploy: "light", maintain: "skip" })
let r = await validate(base("bugfix", bugfix))
expect("bugfix with nothing to build on is blocked", dec(r), "block")
expect("names develop and design", String(r.reason).includes("runs develop but skips design"), true)
writeFileSync(join(DIR, "docs/sdlc/01-plan.md"), "# Plan\n")
writeFileSync(join(DIR, "docs/sdlc/03-design.md"), "# Design\n")
expect("bugfix with existing plan and design allowed", dec(await validate(base("bugfix", bugfix))), "allow")
rmSync(join(DIR, "docs/sdlc/03-design.md"))
writeFileSync(join(DIR, "docs/sdlc/00-codebase.md"), "# Codebase\n")
expect("codebase analysis stands in for design", dec(await validate(base("bugfix", bugfix))), "allow")
expect("high tier code change can't skip design", String((await validate(base("bugfix", bugfix, "high"))).reason).includes("must not skip design"), true)
expect("docs-only is exempt", dec(await validate(base("docs-only", plan({ plan: "skip", requirements: "skip", design: "skip", develop: "light", test: "skip", deploy: "skip", maintain: "skip" }), "high"))), "allow")
const noTest = plan({ test: "skip" })
expect("deploy without test report blocked", String((await validate(base("feature", noTest))).reason).includes("runs deploy but skips test"), true)
rmSync(join(DIR, "docs/sdlc/00-codebase.md"))

// ---- risk register and deployment record schemas
const ok: any = { ...base("feature", plan({})), currentStage: "deploy",
  risks: [
    { id: "R-1", type: "risk", description: "Vendor API in beta", likelihood: "medium", impact: "high", treatment: "mitigate", action: "Contract tests", owner: "tom", status: "open", review: "2026-11-01" },
    { id: "R-2", type: "assumption", description: "Single currency", owner: "tom", status: "open" },
    { id: "R-3", type: "risk", description: "Cost spike", likelihood: "low", impact: "low", treatment: "accept", decision: 'User: "fine"', owner: "tom", status: "open" },
  ] }
ok.stages.deploy = { status: "in-progress", deployment: { at: "2026-10-12", version: "1.0.0", environment: "production", outcome: "succeeded" } }
writeFileSync(join(DIR, "docs/sdlc/05-test-report.md"), "# Tests\n")
writeFileSync(join(DIR, "docs/sdlc/02-requirements.md"), "# Req\n")
expect("valid risks and deployment", dec(await validate(ok)), "allow")
const bad = async (name: string, s: any, frag: string) => {
  const res = await validate(s)
  expect(`${name}: blocked`, dec(res), "block")
  expect(`${name}: mentions ${frag}`, String(res.reason ?? "").includes(frag), true)
}
await bad("risk without rating", { ...ok, risks: [{ ...ok.risks[0], likelihood: undefined }] }, "needs `likelihood` and `impact`")
await bad("accepted risk without decision", { ...ok, risks: [{ ...ok.risks[2], decision: undefined }] }, "accepted and needs the user's `decision`")
await bad("bad risk id", { ...ok, risks: [{ ...ok.risks[1], id: "risk1" }] }, "risks[0].id")
await bad("bad treatment", { ...ok, risks: [{ ...ok.risks[0], treatment: "ignore" }] }, "treatment")
const multi: any = { ...ok, waivers: [{ id: "W-1", stage: "develop", stages: ["test"], criterion: "CI green", reason: "no repo", owner: "tom", expires: "2026-12-31" }] }
multi.stages = { ...ok.stages, test: { status: "passed-with-waivers", passedAt: "2026-10-12", approval: { at: "2026-10-12", text: "ok" } } }
expect("waiver covering a later stage", dec(await validate(multi)), "allow")
await bad("bad waiver stages", { ...multi, waivers: [{ ...multi.waivers[0], stages: ["testing"] }] }, "waivers[0].stages")
const withSpikes: any = { ...ok, spikes: [
  { id: "SP-1", question: "Does the stdlib engine meet the accuracy target?", status: "done", outcome: "fail", decision: 'User: "(A) fix the scoring"' },
  { id: "SP-2", question: "Can support install it?", status: "planned" },
] }
expect("spikes accepted", dec(await validate(withSpikes)), "allow")
await bad("done spike without decision", { ...withSpikes, spikes: [{ ...withSpikes.spikes[0], decision: undefined }] }, "needs the user's `decision`")
await bad("done spike without outcome", { ...withSpikes, spikes: [{ ...withSpikes.spikes[0], outcome: "meh" }] }, "needs `outcome`")
await bad("bad spike status", { ...withSpikes, spikes: [{ ...withSpikes.spikes[1], status: "started" }] }, "spikes[0].status")
await bad("bad outcome", { ...ok, stages: { ...ok.stages, deploy: { status: "in-progress", deployment: { ...ok.stages.deploy.deployment, outcome: "ok" } } } }, "stages.deploy.deployment")
await bad("deployment on wrong stage", { ...ok, stages: { ...ok.stages, test: { status: "not-started", deployment: ok.stages.deploy.deployment } } }, "only allowed on deploy")

// ---- audit events: risks, deployment, artifacts, reports
rmSync(AUDIT, { force: true }); rmSync(join(DIR, "docs/sdlc/.audit-state.json"), { force: true })
const s1: any = { ...ok, risks: [ok.risks[0]], stages: { ...ok.stages, deploy: { status: "in-progress" } } }
await audit(s1)
let n = events().length
const s2 = { ...s1, risks: [{ ...ok.risks[0], status: "closed" }, ok.risks[1]] }
await audit(s2)
expect("risk events", events().slice(n).map((e) => e.event), ["risk_changed", "risk_added"])
n = events().length
await audit({ ...s2, stages: { ...s2.stages, deploy: { status: "in-progress", deployment: ok.stages.deploy.deployment } } })
expect("deployment recorded", events().slice(n).map((e) => e.event), ["deployment_recorded"])
n = events().length
await audit({ ...s2, stages: { ...s2.stages, deploy: { status: "in-progress", deployment: ok.stages.deploy.deployment } }, spikes: [{ id: "SP-1", question: "q", status: "running" }] })
expect("spike event", events().slice(n).map((e) => [e.event, e.to]), [["spike_status_changed", "running"]])

mkdirSync(join(DIR, "src"), { recursive: true }); mkdirSync(join(DIR, "node_modules/x"), { recursive: true })
writeFileSync(join(DIR, "src/app.py"), "print(1)\n"); writeFileSync(join(DIR, "node_modules/x/i.js"), "1")
n = events().length
await run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, agent_id: "d1", agent_type: "tomdlc:developer", tool_name: "Write", tool_input: { file_path: `${P}/src/app.py` } })
await run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/node_modules/x/i.js` } })
const art = events().slice(n)
expect("artifact logged once (node_modules skipped)", art.map((e) => e.event), ["artifact_written"])
expect("artifact author", art[0]?.actor, "tomdlc:developer")
expect("artifact hash", typeof art[0]?.sha256 === "string" && art[0].sha256.length === 64, true)

const report = "Done.\n### Summary\nNOT READY: 1 high\n### Files changed\nNone.\n### Gate self-assessment\nx\n### Questions for the user\nNone.\n### Handoffs\nNone.\n### Findings\n- high: missing authz check"
await run("audit-events.ts", { hook_event_name: "SubagentStop", cwd: P, agent_id: "abcdef123456", agent_type: "tomdlc:reviewer", last_assistant_message: report })
const stopped = events().at(-1)
expect("report path logged", typeof stopped.report === "string" && stopped.report.startsWith("docs/sdlc/reports/"), true)
expect("report saved with stage and agent", /-deploy-reviewer-abcdef12\.md$/.test(stopped.report ?? ""), true)
expect("report content kept", readFileSync(join(DIR, stopped.report), "utf8").includes("missing authz check"), true)
await run("audit-events.ts", { hook_event_name: "SubagentStop", cwd: P, agent_id: "zz", agent_type: "Explore", last_assistant_message: "hi" })
expect("non-TomDLC agents get no report", readdirSync(join(DIR, "docs/sdlc/reports"), { recursive: true }).filter((f) => String(f).endsWith(".md")).length, 1)
expect("reports go in a monthly folder", /^docs\/sdlc\/reports\/\d{4}-\d{2}\/\d{8}-/.test(String(stopped.report)), true)

// ---- reports are hook-only
const og = (ev: object, tool: string, input: object) => run("ownership-guard.ts", { cwd: P, ...ev, tool_name: tool, tool_input: input }).then(dec)
expect("main can't edit a report", await og({}, "Edit", { file_path: `${P}/${stopped.report}` }), "deny")
expect("agent can't write a report", await og({ agent_id: "a", agent_type: "tomdlc:reviewer" }, "Write", { file_path: `${P}/docs/sdlc/reports/fake.md` }), "deny")
expect("shell write to reports denied", await og({}, "Bash", { command: "echo x > docs/sdlc/reports/fake.md" }), "deny")
expect("reading reports allowed", await og({}, "Bash", { command: "cat docs/sdlc/reports/*.md" }), "allow")
expect("agents can't write traceability.md", await og({ agent_id: "a", agent_type: "tomdlc:tester" }, "Write", { file_path: `${P}/docs/sdlc/traceability.md` }), "deny")
expect("the orchestrator can", await og({}, "Write", { file_path: `${P}/docs/sdlc/traceability.md` }), "allow")

// ---- accepted risks need the user's words
const guard = async (prev: any, next: any) => {
  writeFileSync(STATE, JSON.stringify(prev))
  return dec(await run("approval-guard.ts", { cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/docs/sdlc/state.json`, content: JSON.stringify(next) } }))
}
await run("audit-prompt.ts", { cwd: P, prompt: "Accept the cost risk, it's tiny." })
const risky = { ...s1, risks: [{ ...ok.risks[0], treatment: "accept", decision: "User accepted it" }] }
expect("paraphrased risk acceptance denied", await guard(s1, risky), "deny")
expect("quoted risk acceptance allowed", await guard(s1, { ...risky, risks: [{ ...risky.risks[0], decision: 'User: "Accept the cost risk, it\'s tiny."' }] }), "allow")

// ---- check-trace on a synthetic project
const T = join(SP, "proj6"); rmSync(T, { recursive: true, force: true }); mkdirSync(join(T, "docs/sdlc"), { recursive: true }); mkdirSync(join(T, "tests"))
writeFileSync(join(T, "docs/sdlc/02-requirements.md"), [
  "### FR-1 Convert — Must", "### FR-2 Help — Must", "### FR-3 Version — Should", "### FR-2 Help again — Must",
  "| ID | Req |", "|---|---|", "| SR-1 | Validate input (Must) |", "| SR-2 | Escape output |",
  "## Traceability", "| SR-1 | V5 | unit |", "- AC-1.2 criterion detail (not an abuse case)",
].join("\n"))
writeFileSync(join(T, "docs/sdlc/03-design.md"), "# Design\nCovers FR-1 and SR-1, SR-9.\n## Delivery Slices\n| S-1 | delivers FR-1 |\n## Other\nFR-2 mentioned outside slices\n")
writeFileSync(join(T, "tests/test_convert.py"), "# FR-1 SR-1\ndef test_x(): pass\n")
const tr = JSON.parse(await script("check-trace.ts", T.replaceAll("\\", "/"), "--json"))
expect("undefined SR-9", tr.undefined.map((u: any) => u.id), ["SR-9"])
expect("duplicate heading FR-2", tr.duplicates.map((d: any) => d.id), ["FR-2"])
expect("table rows aren't duplicates", tr.duplicates.some((d: any) => d.id === "SR-1"), false)
expect("AC-1.2 not treated as AC-1", tr.undefined.some((u: any) => u.id === "AC-1"), false)
expect("all Must FRs in design", tr.mustFRsNotInDesign, [])
expect("FR-2 in no slice", tr.mustFRsNotInSlices, ["FR-2"])
expect("not verified", tr.notVerified, ["FR-2", "SR-2"])
expect("text report readable", (await script("check-trace.ts", T.replaceAll("\\", "/"))).includes("Undefined IDs: SR-9"), true)

// sub-parts, Delivers rows, ranges and the matrix
writeFileSync(join(T, "docs/sdlc/03-design.md"), [
  "# Design", "Covers FR-1, FR-2, FR-3 and SR-1, SR-2. SR-1a is split out.",
  "## Delivery Slices",
  "### S-1 Core", "| Field | Content |", "|---|---|", "| Delivers | FR-1..FR-2; SR-1a |", "| Done when | FR-3 tests pass too |",
  "### S-2 Extra", "| Field | Content |", "|---|---|", "| Delivers | FR-3, SR-2 |",
  "## Other", "Nothing.",
].join("\n"))
writeFileSync(join(T, "docs/sdlc/05-security-test.md"), "SR-2 verified by fuzzing; SR-1b checked.\n")
const tr2 = JSON.parse(await script("check-trace.ts", T.replaceAll("\\", "/"), "--json"))
expect("part reference SR-1a isn't undefined", tr2.undefined.some((u: any) => u.id === "SR-1a"), false)
expect("SR-9 no longer referenced", tr2.undefined.length, 0)
const mx = await script("check-trace.ts", T.replaceAll("\\", "/"), "--matrix")
const row = (id: string) => mx.split("\n").find((l) => l.startsWith(`| ${id} |`)) ?? ""
expect("matrix header", mx.includes("| ID | Must | Design | Slices | Tests | Test report |"), true)
expect("range expanded into S-1", row("FR-2").includes("| S-1 |"), true)
expect("Done-when mention doesn't count as delivery", row("FR-3").includes("| S-2 |"), true)
expect("part delivery credits the whole SR", row("SR-1").includes("| S-1 |"), true)
expect("any 05-* document counts as test evidence", row("SR-2").endsWith("| yes |"), true)
expect("tests column lists the test file", row("FR-1").includes("tests/test_convert.py"), true)
expect("missing evidence is flagged", row("FR-3").includes("**missing**"), true)

// slice field tables: the template's "| ID | S-n |" row, and "| Field | S-n |" headers
writeFileSync(join(T, "docs/sdlc/03-design.md"), [
  "# Design", "Covers FR-1, FR-2, FR-3 and SR-1, SR-2.",
  "## Delivery Slices",
  "| Field | Content |", "|---|---|", "| ID | `S-1` |", "| Delivers | FR-1, FR-2 |", "| Depends on | — |",
  "", "| Field | S-2 |", "|---|---|", "| Delivers | FR-3, SR-2 |", "| Depends on | S-1 |",
  "## Other", "Nothing.",
].join("\n"))
const tr3 = JSON.parse(await script("check-trace.ts", T.replaceAll("\\", "/"), "--json"))
expect("slice IDs in field tables are defined", tr3.undefined.map((u: any) => u.id), [])
const mx3 = await script("check-trace.ts", T.replaceAll("\\", "/"), "--matrix")
const row3 = (id: string) => mx3.split("\n").find((l) => l.startsWith(`| ${id} |`)) ?? ""
expect("ID row opens S-1's block", row3("FR-2").includes("| S-1 |"), true)
expect("Field header opens S-2's block", row3("FR-3").includes("| S-2 |"), true)
expect("Depends-on mention isn't a delivery", row3("FR-1").includes("S-2"), false)
expect("Must FRs present: no warning", tr3.noMustFRs, false)

// no FR marked Must: the Must checks are vacuous, so warn
writeFileSync(join(T, "docs/sdlc/02-requirements.md"), "| ID | Req |\n|---|---|\n| FR-1 | Convert |\n| FR-2 | Help |\n| FR-3 | Version |\n| SR-1 | Validate |\n| SR-2 | Escape |\n")
expect("no Must FRs flagged", JSON.parse(await script("check-trace.ts", T.replaceAll("\\", "/"), "--json")).noMustFRs, true)
expect("text report warns", (await script("check-trace.ts", T.replaceAll("\\", "/"))).includes("WARNING: no FR is marked Must"), true)

// a saved matrix that no longer matches the documents is flagged
const TRACE_MD = join(T, "docs/sdlc/traceability.md")
writeFileSync(TRACE_MD, (await script("check-trace.ts", T.replaceAll("\\", "/"), "--matrix")).replace(/\n$/, "").replace(/on \d{4}-\d{2}-\d{2}/, "on 2001-01-01") + "\n")
expect("fresh matrix (different date) isn't stale", JSON.parse(await script("check-trace.ts", T.replaceAll("\\", "/"), "--json")).matrixStale, false)
writeFileSync(join(T, "docs/sdlc/02-requirements.md"), "| ID | Req |\n|---|---|\n| FR-1 | Convert (Must) |\n| FR-2 | Help |\n| FR-3 | Version |\n| SR-1 | Validate |\n| SR-2 | Escape |\n")
expect("matrix stale after the documents change", (await script("check-trace.ts", T.replaceAll("\\", "/"))).includes("traceability.md is out of date"), true)
rmSync(TRACE_MD)

// ---- import-findings

const sar = JSON.parse(await script("import-findings.ts", join(SP, "scans", "sarif.json")))
expect("sarif high from security-severity", sar.findings[0].severity, "high")
const gl = await script("import-findings.ts", join(SP, "scans", "gitleaks.json"))
expect("secret value never printed", gl.includes("SHOULDNOTPRINT"), false)
expect("secrets aren't auto-fixable", JSON.parse(gl).findings[0].autoFixable, false)
const pip = JSON.parse(await script("import-findings.ts", join(SP, "scans", "pip.json")))
expect("pip-audit fix version auto-fixable", [pip.findings[0].fixedIn, pip.findings[0].autoFixable], ["2.11.3", true])

console.log(`${total} checks, ${fails} failures`)

process.exitCode = fails > 0 ? 1 : 0
