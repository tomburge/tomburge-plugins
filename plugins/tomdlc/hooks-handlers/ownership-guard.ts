#!/usr/bin/env bun
// PreToolUse hook for file writes and shell commands, active only inside
// subagents. The main session (the orchestrator) is never restricted.
//  - No subagent may write docs/sdlc/state.json or docs/sdlc/.dispatch.json;
//    only the orchestrator records stage state and dispatches.
//  - A TomDLC agent with an entry in .dispatch.json may only write project
//    files matching its `owns` globs, whether with the file tools or through
//    shell commands whose targets can be read from the command (redirection,
//    tee, sed -i, cp/mv, PowerShell content cmdlets). Agents without an entry
//    are not restricted beyond the state files. Paths outside the project are
//    allowed. Scripts that write files internally can't be attributed; agent
//    prompts forbid writing files through the shell.
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  AUDIT_ARCHIVE_DIR, AUDIT_FILE, AUDIT_LOCK, AUDIT_SNAPSHOT, DECISIONS_FILE, TRACE_FILE, REPORTS_DIR, DISPATCH_FILE, STATE_FILE, dispatchKey, filePathOf, isSubagent, projectPath, projectRoot, readEvent, respond, samePath, tomdlcAgent,
} from "./lib/hook.ts"
import { simpleCommands, writeTargets } from "./lib/shell.ts"

// Fallback for state files: commands that mention them and look like they write.
const SHELL_WRITE =
  /(>|\btee\b|\bsed\s+-i|\b(mv|cp|rm|dd|truncate)\b|\b(Set|Add|Clear)-Content\b|\bOut-File\b|\b(Remove|Move|Copy|New)-Item\b|\b(python3?|node|bun|deno|perl|ruby)\b)/i

const STATE_REASON =
  "TomDLC: only the orchestrator writes docs/sdlc/state.json, docs/sdlc/.dispatch.json and docs/sdlc/decisions.md. " +
  "Report stage progress in your Gate self-assessment instead, and the orchestrator will record it."

function deny(reason: string): void {
  respond({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })
}

/** Owned globs for this agent instance: its dispatch key's entry, else its bare name's. */
function ownedGlobs(root: string, key: string | null, agent: string | null): string[] | undefined {
  try {
    const dispatchPath = join(root, DISPATCH_FILE)
    if (!agent || !existsSync(dispatchPath)) return undefined
    const agents = JSON.parse(readFileSync(dispatchPath, "utf8")).agents ?? {}
    // Parallel instances are registered as <name>#<suffix>. If this agent's instance can't be
    // identified, fail closed rather than let it write anywhere.
    if (!(key && agents[key]) && !agents[agent] && Object.keys(agents).some((k) => k.startsWith(`${agent}#`))) return ["<none>"]
    const owns = (key && agents[key] ? agents[key] : agents[agent])?.owns
    return Array.isArray(owns) && owns.length > 0 ? owns : undefined
  } catch {
    return undefined // An unreadable dispatch file leaves ownership unenforced; validate-state flags it.
  }
}

/** A directory target counts as owned when files inside it would be. */
const isOwned = (owns: string[], rel: string) => owns.some((g) => new Bun.Glob(g).match(rel) || new Bun.Glob(g).match(`${rel}/x`))

const isStateFile = (rel: string) => [STATE_FILE, DISPATCH_FILE, DECISIONS_FILE, TRACE_FILE].some((f) => samePath(rel, f))
const isAuditFile = (rel: string) =>
  samePath(rel, AUDIT_FILE) || samePath(rel, AUDIT_SNAPSHOT) || samePath(rel, AUDIT_LOCK) || rel.toLowerCase().startsWith(REPORTS_DIR.toLowerCase() + "/") ||
  rel.toLowerCase().startsWith(AUDIT_ARCHIVE_DIR.toLowerCase() + "/") || samePath(rel, AUDIT_ARCHIVE_DIR)

const AUDIT_REASON =
  "TomDLC: docs/sdlc/audit.jsonl, docs/sdlc/.audit-state.json and docs/sdlc/reports/ are written only by the plugin's hooks, so the audit trail stays append-only. " +
  "Nothing needs to edit them; if the log looks wrong, tell the user."

const outsideReason = (rels: string[], agent: string | null, owns: string[]) =>
  `TomDLC: ${rels.join(", ")} ${rels.length > 1 ? "are" : "is"} outside the files assigned to ${agent} (${owns.join(", ")}). ` +
  "Another agent may own it. Describe the change you need under Handoffs, naming the file and the owner if known, and the orchestrator will route it."

const event = await readEvent()
const input = event.tool_input ?? {}
const cwd = event.cwd ?? process.cwd()
const root = projectRoot(cwd)
const agent = tomdlcAgent(event)
const key = dispatchKey(event)
const isShell = event.tool_name === "Bash" || event.tool_name === "PowerShell"
const command = String(input.command ?? "")
const lowered = command.replaceAll("\\", "/").toLowerCase()

// Paths this call would write, relative to the caller's worktree or the project root (outside paths dropped).
const file = filePathOf(input)
const rels = (isShell ? simpleCommands(command).flatMap(writeTargets).map((t) => resolve(cwd, t)) : file ? [file] : [])
  .map((p) => projectPath(cwd, p))
  .filter((r): r is string => r !== null)

// Bash (Git Bash on Windows) has no NUL device: "2>nul" creates a file named NUL in the project,
// which Windows tools then struggle to delete. Found in a live run.
const NUL_REDIRECT = /(^|[^\w/])&?\d?>>?\s*nul(?=$|[\s;&|)])/i

if (event.tool_name === "Bash" && NUL_REDIRECT.test(command)) {
  deny("TomDLC: in Bash, discard output with /dev/null (e.g. 2>/dev/null), not NUL: Bash writes a file named NUL instead. In PowerShell, use $null.")
} else if (rels.some(isAuditFile) || (isShell && /audit\.jsonl|\.audit-state\.json|docs\/sdlc\/reports\/|docs\/sdlc\/audit-archive/.test(lowered) && SHELL_WRITE.test(lowered))) {
  deny(AUDIT_REASON)
} else if (!isSubagent(event)) {
  // The orchestrator writes state.json and .dispatch.json with Write or Edit, so the state checker
  // and approval guard see every change; a visible shell write skips them.
  const shellState = isShell &&
    (rels.some((r) => samePath(r, STATE_FILE) || samePath(r, DISPATCH_FILE)) ||
      (/docs\/sdlc\/(state|\.dispatch)\.json/.test(lowered) && /(\btee\b|\bsed\s+-i|\b(mv|cp)\b|\b(Set|Add)-Content\b|\bOut-File\b|\b(Move|Copy)-Item\b|writeFile|\.write\(|json\.dump\()/i.test(command)))
  // Scripts that write it without showing it are caught after the command by audit-events.ts.
  if (shellState)
    deny("TomDLC: write docs/sdlc/state.json and .dispatch.json with the Write or Edit tool, not a shell command or script, so the state checker and approval guard check the change.")
  else respond()
} else {
  const owns = ownedGlobs(root, key, agent)
  const mentionsState = [STATE_FILE, DISPATCH_FILE, DECISIONS_FILE].some((f) => lowered.includes(f.split("/").slice(-2).join("/")))

  if (rels.some(isStateFile) || (isShell && mentionsState && SHELL_WRITE.test(lowered))) {
    deny(STATE_REASON)
  } else if (owns && rels.some((r) => !(isShell ? isOwned(owns, r) : owns.some((g) => new Bun.Glob(g).match(r))))) {
    const outside = rels.filter((r) => !(isShell ? isOwned(owns, r) : owns.some((g) => new Bun.Glob(g).match(r))))
    deny(outsideReason(outside, key ?? agent, owns) + (isShell ? " Also: create and edit files with the Write and Edit tools, not shell commands." : ""))
  } else {
    respond()
  }
}
