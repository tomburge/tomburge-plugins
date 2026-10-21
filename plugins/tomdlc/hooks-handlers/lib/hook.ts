// Shared helpers for TomDLC hook handlers.
import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

export const STAGES = ["plan", "requirements", "design", "develop", "test", "deploy", "maintain"] as const

/** Orchestrator-only files under the project root. */
export const STATE_FILE = "docs/sdlc/state.json"
/** Archived segments of the audit log, written only by hooks when the live log rotates. */
export const AUDIT_ARCHIVE_DIR = "docs/sdlc/audit-archive"
export const DISPATCH_FILE = "docs/sdlc/.dispatch.json"
export const DECISIONS_FILE = "docs/sdlc/decisions.md"
export const TRACE_FILE = "docs/sdlc/traceability.md"

/** Hook-only files: nobody writes these with tools, not even the orchestrator. */
export const AUDIT_FILE = "docs/sdlc/audit.jsonl"
export const AUDIT_SNAPSHOT = "docs/sdlc/.audit-state.json"
export const AUDIT_LOCK = "docs/sdlc/.audit.lock"
export const REPORTS_DIR = "docs/sdlc/reports"

export interface HookEvent {
  cwd?: string
  agent_id?: string
  agent_type?: string
  tool_name?: string
  tool_input?: Record<string, any>
  last_assistant_message?: string
  stop_hook_active?: boolean
  [key: string]: unknown
}

export async function readEvent(): Promise<HookEvent> {
  return JSON.parse(await new Response(Bun.stdin.stream()).text())
}

let responded = false

export function respond(output: object = {}): void {
  responded = true
  process.stdout.write(JSON.stringify(output))
}

/** Whether this process has already written its hook output (used by fail-closed.ts). */
export const hasResponded = () => responded

/** True when the hook fired inside a subagent rather than the main session. */
export function isSubagent(event: HookEvent): boolean {
  return typeof event.agent_id === "string" && event.agent_id.length > 0
}

/** The bare agent name ("developer") for TomDLC plugin agents, else null. */
export function tomdlcAgent(event: HookEvent): string | null {
  const type = event.agent_type
  return isSubagent(event) && typeof type === "string" && type.startsWith("tomdlc:") ? type.slice("tomdlc:".length) : null
}

/** Nearest ancestor of `start` (inclusive) for which `test` holds, or null. */
function findUp(start: string, test: (dir: string) => boolean): string | null {
  let dir = resolve(start)
  for (;;) {
    if (test(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * When cwd is inside a linked git worktree (e.g. an agent dispatched with
 * worktree isolation), the main checkout's top directory; otherwise null.
 * Reads the worktree's `.git` file ("gitdir: <main>/.git/worktrees/<name>")
 * instead of running git, to keep hooks fast.
 */
export function mainCheckout(cwd: string): string | null {
  const top = findUp(cwd, (d) => existsSync(join(d, ".git")))
  if (!top) return null
  try {
    const dotGit = join(top, ".git")
    if (!statSync(dotGit).isFile()) return null
    const gitdir = readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)$/m)?.[1]?.trim()
    const m = gitdir ? resolve(top, gitdir).match(/^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/) : null
    return m ? m[1] : null
  } catch {
    return null
  }
}

/**
 * The project root that holds TomDLC's state (docs/sdlc): the nearest
 * ancestor of cwd with docs/sdlc, falling back to cwd. Inside a linked git
 * worktree it's the main checkout's, so every agent shares one
 * .dispatch.json, state and audit log.
 */
export function projectRoot(cwd: string): string {
  const base = mainCheckout(cwd) ?? cwd
  return findUp(base, (d) => existsSync(join(d, "docs", "sdlc"))) ?? resolve(base)
}

/** The tree the caller is working in: its git worktree's top when in one, else the project root. */
export function workRoot(cwd: string): string {
  return mainCheckout(cwd) ? (findUp(cwd, (d) => existsSync(join(d, ".git"))) as string) : projectRoot(cwd)
}

/** Path relative to root with forward slashes, or null when outside root. */
export function relToRoot(root: string, file: string): string | null {
  const rel = relative(root, resolve(root, file)).replaceAll("\\", "/")
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : rel
}

/** A file's project-relative path, judged against the caller's worktree first, then the project root. */
export function projectPath(cwd: string, file: string): string | null {
  return relToRoot(workRoot(cwd), resolve(cwd, file)) ?? relToRoot(projectRoot(cwd), resolve(cwd, file))
}

/**
 * The dispatch key for a TomDLC agent: the bare agent name, or the
 * `Dispatch key: <name>#<suffix>` line in its brief when the orchestrator runs
 * several instances of one agent (e.g. developers on parallel slices). The
 * brief is the first message of the agent's own transcript, which lives in
 * `<main transcript minus .jsonl>/subagents/agent-<agent_id>.jsonl`.
 */
export function dispatchKey(event: HookEvent): string | null {
  const name = tomdlcAgent(event)
  if (!name) return null
  const main = typeof event.transcript_path === "string" ? event.transcript_path.replace(/^~(?=[\\/])/, homedir()) : null
  const candidates = [
    typeof event.agent_transcript_path === "string" ? event.agent_transcript_path.replace(/^~(?=[\\/])/, homedir()) : null,
    main ? join(main.replace(/\.jsonl$/, ""), "subagents", `agent-${event.agent_id}.jsonl`) : null,
  ].filter((p): p is string => !!p && existsSync(p))
  for (const path of candidates) {
    try {
      const firstLine = readFileSync(path, "utf8").split("\n").find((l) => l.includes('"user"'))
      if (!firstLine) continue
      const content = JSON.parse(firstLine).message?.content
      const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.text ?? "").join("\n") : ""
      const key = text.match(/^\s*Dispatch key:\s*(\S+)/m)?.[1]
      if (key && key.split("#")[0] === name) return key
    } catch {
      // Unreadable transcript: fall back to the bare name.
    }
  }
  return name
}

/**
 * The agent's final report on SubagentStop. Agents may end with plain text
 * (`last_assistant_message`) or hand their report back through a tool call, in
 * which case it's only in the agent's own transcript. Returns the handback
 * message or the last text, preferring whichever contains a Summary heading.
 */
export function finalReport(event: HookEvent): string | undefined {
  const last = typeof event.last_assistant_message === "string" ? event.last_assistant_message : undefined
  if (last && /^\s*(#{1,6}\s*|\*\*)Summary\b/im.test(last)) return last
  const path = typeof event.agent_transcript_path === "string" ? event.agent_transcript_path.replace(/^~(?=[\\/])/, homedir()) : undefined
  if (!path || !existsSync(path)) return last
  try {
    let found: string | undefined
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line.trim()) continue
      const row = JSON.parse(line)
      if (row.type !== "assistant") continue
      for (const part of row.message?.content ?? []) {
        if (part.type === "tool_use" && typeof part.input?.message === "string" && /handback/i.test(part.name)) found = part.input.message
        else if (part.type === "text" && typeof part.text === "string" && part.text.trim()) found = part.text
      }
    }
    return found ?? last
  } catch {
    return last
  }
}

/**
 * True for prompts Claude Code injects on its own: subagent hand-backs
 * ("<agent-message from=...>") and system or task notifications. These reach
 * the UserPromptSubmit hook like typed prompts but carry no user authority.
 */
export function isAgentMessage(text: string): boolean {
  const t = text.trimStart()
  return (
    /^(Another Claude session sent a message:\s*)?<agent-message\b/.test(t) ||
    /^<(task-notification|system-reminder)\b/.test(t) ||
    /^\[SYSTEM NOTIFICATION\b/.test(t) ||
    /^\[Subagent hand-back\]/.test(t)
  )
}

export function filePathOf(input: Record<string, any> | undefined): string | undefined {
  return input?.file_path ?? input?.notebook_path
}

export function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
