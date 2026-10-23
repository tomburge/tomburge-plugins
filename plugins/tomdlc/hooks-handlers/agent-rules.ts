#!/usr/bin/env bun
// SubagentStart hook. Adds the rules every TomDLC agent shares
// (skills/orchestrator/reference/agent-rules.md) to the start of each TomDLC
// agent's context, so the agent prompts hold only their role's own rules.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readEvent, respond, tomdlcAgent } from "./lib/hook.ts"

const RULES = join(import.meta.dir, "..", "skills", "orchestrator", "reference", "agent-rules.md")

const event = await readEvent()
respond(
  tomdlcAgent(event)
    ? { hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: readFileSync(RULES, "utf8") } }
    : {},
)
