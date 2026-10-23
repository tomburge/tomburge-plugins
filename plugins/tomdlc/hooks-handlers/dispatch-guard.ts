#!/usr/bin/env bun
// PreToolUse hook for the Agent tool (Task in older Claude Code). In TomDLC
// projects, denies dispatching a TomDLC role by its bare name ("reviewer")
// instead of its plugin name ("tomdlc:reviewer"). A bare name can resolve to
// a project or user agent with the same name, which then reviews, builds or
// tests in TomDLC's place without its rules. Found live in GitHub Copilot CLI,
// which picked a repo's .github/agents copy over the plugin's agent.
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { isTomdlcProject } from "./lib/audit.ts"
import { projectRoot, readEvent, respond } from "./lib/hook.ts"

/** The plugin's own agents, by file name: agents/reviewer.md is "reviewer". */
const ROLES = new Set(
  readdirSync(join(import.meta.dir, "..", "agents"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/(\.agent)?\.md$/, "").toLowerCase()),
)

const event = await readEvent()
const input = event.tool_input ?? {}
// Claude Code names the agent in subagent_type; Copilot CLI in agent_type.
const type = String(input.subagent_type ?? input.agent_type ?? "").trim()
const root = projectRoot(event.cwd ?? process.cwd())

if (type && !type.includes(":") && ROLES.has(type.toLowerCase()) && isTomdlcProject(root)) {
  respond({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `TomDLC: dispatch the ${type} as "tomdlc:${type}", not "${type}". A bare name can pick a project or user agent ` +
        "with the same name instead of TomDLC's, which would then do this stage's work without TomDLC's rules.",
    },
  })
} else {
  respond()
}
