// Parallel slices: per-instance dispatch keys, git worktree resolution, and
// unique report files.
import { join } from "node:path"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { H, SP } from "../lib/harness.ts"

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
const dec = (o: any) => o.decision ?? o.hookSpecificOutput?.permissionDecision ?? "allow"
const fwd = (p: string) => p.replaceAll("\\", "/")

// A main checkout with TomDLC state, and a linked worktree laid out the way git does it.
const MAIN = join(SP, "main"), WT = join(SP, "wt-s2")
mkdirSync(join(MAIN, ".git", "worktrees", "wt-s2"), { recursive: true })
mkdirSync(join(MAIN, "docs", "sdlc"), { recursive: true })
mkdirSync(join(WT, "src", "b"), { recursive: true })
writeFileSync(join(WT, ".git"), `gitdir: ${fwd(join(MAIN, ".git", "worktrees", "wt-s2"))}\n`)
writeFileSync(join(MAIN, "docs/sdlc/.dispatch.json"), JSON.stringify({
  agents: {
    "developer#S-2": { stage: "develop", owns: ["src/b/**"] },
    "developer#S-3": { stage: "develop", owns: ["src/c/**"] },
  },
}))
writeFileSync(join(MAIN, "docs/sdlc/state.json"), JSON.stringify({ project: "demo", currentStage: "develop" }))

// Transcripts: the main session's, and each agent's brief as the first message of its own transcript.
const TRANSCRIPTS = join(SP, "transcripts")
const MAIN_TRANSCRIPT = join(TRANSCRIPTS, "sess.jsonl")
mkdirSync(join(TRANSCRIPTS, "sess", "subagents"), { recursive: true })
writeFileSync(MAIN_TRANSCRIPT, "")
const brief = (agentId: string, text: string) =>
  writeFileSync(join(TRANSCRIPTS, "sess", "subagents", `agent-${agentId}.jsonl`),
    JSON.stringify({ type: "user", message: { role: "user", content: text } }) + "\n")
brief("dev2", "Stage: 4 – Develop    Risk tier: moderate\nDispatch key: developer#S-2\nSlice: S-2 ...")
brief("dev3", "Stage: 4 – Develop\nDispatch key: developer#S-3\n")
brief("devX", "Stage: 4 – Develop (no dispatch key line)\n")
brief("spoof", "Dispatch key: devsecops-engineer#S-9\n")

const agentEv = (agentId: string, cwd: string, file: string) => ({
  cwd: fwd(cwd), agent_id: agentId, agent_type: "tomdlc:developer", transcript_path: fwd(MAIN_TRANSCRIPT),
  tool_name: "Write", tool_input: { file_path: fwd(file), content: "x = 1\n" },
})
const og = (ev: object) => run("ownership-guard.ts", ev).then(dec)

// --- dispatch keys pick the instance's own globs
expect("S-2 writes its own file in its worktree", await og(agentEv("dev2", WT, join(WT, "src/b/x.py"))), "allow")
expect("S-2 can't write S-3's files", await og(agentEv("dev2", WT, join(WT, "src/c/y.py"))), "deny")
expect("S-3 writes its own file", await og(agentEv("dev3", MAIN, join(MAIN, "src/c/y.py"))), "allow")
expect("S-3 can't write S-2's files", await og(agentEv("dev3", MAIN, join(MAIN, "src/b/x.py"))), "deny")
const denied = await run("ownership-guard.ts", agentEv("dev2", WT, join(WT, "src/c/y.py")))
expect("denial names the instance", String(denied.hookSpecificOutput?.permissionDecisionReason).includes("developer#S-2"), true)

// --- fail closed when the instance can't be identified
expect("unidentified instance is blocked", await og(agentEv("devX", MAIN, join(MAIN, "src/b/x.py"))), "deny")
expect("a key for another agent type is ignored (blocked)", await og(agentEv("spoof", MAIN, join(MAIN, "src/b/x.py"))), "deny")

// --- the worktree resolves to the main checkout's state
expect("state file in the worktree copy is still protected",
  await og(agentEv("dev2", WT, join(WT, "docs/sdlc/state.json"))), "deny")
expect("writes outside both trees are allowed", await og(agentEv("dev2", WT, join(SP, "elsewhere.txt"))), "allow")

// --- audit from a worktree lands in the main checkout's log
writeFileSync(join(WT, "src/b/x.py"), "x = 1\n")
await run("audit-events.ts", { ...agentEv("dev2", WT, join(WT, "src/b/x.py")), hook_event_name: "PostToolUse" })
const audit = join(MAIN, "docs/sdlc/audit.jsonl")
const last = existsSync(audit) ? JSON.parse(readFileSync(audit, "utf8").trim().split("\n").at(-1)!) : {}
expect("artifact logged in the main log", last.event, "artifact_written")
expect("path relative to the worktree", last.file, "src/b/x.py")
expect("worktree recorded", fwd(String(last.worktree ?? "")).endsWith("wt-s2"), true)
expect("no audit log forked into the worktree", existsSync(join(WT, "docs/sdlc/audit.jsonl")), false)
const auditLines = () => readFileSync(audit, "utf8").trim().split("\n").map((l) => JSON.parse(l))
expect("first write binds the instance key", auditLines().filter((e) => e.event === "agent_instance").map((e) => [e.agentId, e.key]), [["dev2", "developer#S-2"]])
await run("audit-events.ts", { ...agentEv("dev2", WT, join(WT, "src/b/x.py")), hook_event_name: "PostToolUse" })
expect("binding logged once per agent", auditLines().filter((e) => e.event === "agent_instance").length, 1)

await run("audit-events.ts", { hook_event_name: "SubagentStart", cwd: fwd(MAIN), agent_id: "dev2", agent_type: "tomdlc:developer", transcript_path: fwd(MAIN_TRANSCRIPT) })
const started = JSON.parse(readFileSync(audit, "utf8").trim().split("\n").at(-1)!)
expect("dispatch logs the instance key", started.key, "developer#S-2")

// --- the key is also logged when the agent stops (its transcript always exists by then)
await run("audit-events.ts", {
  hook_event_name: "SubagentStop", cwd: fwd(MAIN), agent_id: "dev3", agent_type: "tomdlc:developer", transcript_path: fwd(MAIN_TRANSCRIPT),
  last_assistant_message: "### Summary\nS-3 done\n### Files changed\nx\n### Gate self-assessment\nx\n### Questions for the user\nNone\n### Handoffs\nNone\n### Findings\nNone",
})
const stopped = JSON.parse(readFileSync(audit, "utf8").trim().split("\n").at(-1)!)
expect("stop logs the instance key", [stopped.event, stopped.key], ["agent_stopped", "developer#S-3"])

// --- report files are unique per stop
const report = "### Summary\nDone\n### Files changed\nx\n### Gate self-assessment\nx\n### Questions for the user\nNone\n### Handoffs\nNone\n### Findings\nNone"
const stop = () => run("audit-events.ts", { hook_event_name: "SubagentStop", cwd: fwd(MAIN), agent_id: "dev2aaaa", agent_type: "tomdlc:developer", last_assistant_message: report })
await stop()
await Bun.sleep(1100)
await stop()
expect("two stops, two report files", readdirSync(join(MAIN, "docs/sdlc/reports"), { recursive: true }).filter((f) => String(f).includes("dev2aaaa")).length, 2)

// --- dispatch keys are validated
const vd = (agents: object) => {
  writeFileSync(join(MAIN, "docs/sdlc/.dispatch.json"), JSON.stringify({ agents }))
  return run("validate-state.ts", { cwd: fwd(MAIN), tool_name: "Write", tool_input: { file_path: fwd(join(MAIN, "docs/sdlc/.dispatch.json")) } }).then(dec)
}
expect("instance keys valid", await vd({ "developer#S-2": { stage: "develop", owns: ["src/b/**"] } }), "allow")
expect("bad key rejected", await vd({ "Developer S2": { stage: "develop", owns: ["src/b/**"] } }), "block")

console.log(`${total} checks, ${fails} failures`)
process.exitCode = fails > 0 ? 1 : 0
