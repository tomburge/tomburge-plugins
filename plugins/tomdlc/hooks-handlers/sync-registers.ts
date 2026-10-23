#!/usr/bin/env bun
// PostToolUse hook for Write/Edit/MultiEdit. Keeps the markdown views of the
// state.json registers in sync (see lib/registers.ts):
//  - after .tomdlc/state.json is written, regenerates risks.md, findings.md,
//    waivers.md, spikes.md, promotions.md, decisions.md and the rule sections
//    of practices.md from their registers;
//  - after practices.md is written (the planner drafting it, or a hand edit),
//    puts the generated rule sections back, and says so if the edit changed them.
// It also tells the orchestrator when a decisions.md or practices.md written
// before the registers existed still needs migrating into state.json.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DECISIONS_FILE, STATE_FILE, filePathOf, projectPath, projectRoot, readEvent, respond, samePath } from "./lib/hook.ts"
import { PRACTICES_FILE, handWrittenRules, syncPractices, syncRegisters } from "./lib/registers.ts"

const event = await readEvent()
const cwd = event.cwd ?? process.cwd()
const root = projectRoot(cwd)
const file = filePathOf(event.tool_input)
const rel = file ? projectPath(cwd, file) : null
const isState = !!rel && samePath(rel, STATE_FILE)
const isPractices = !!rel && samePath(rel, PRACTICES_FILE)

let state: Record<string, any> | null = null
if ((isState || isPractices) && existsSync(join(root, STATE_FILE))) {
  try {
    state = JSON.parse(readFileSync(join(root, STATE_FILE), "utf8"))
  } catch {
    // Invalid JSON: validate-state reports it, and the views wait for a valid write.
  }
}

const notes: string[] = []
if (state && typeof state === "object" && isState) {
  syncRegisters(root, state)
  const read = (f: string) => (existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : "")
  if (!Array.isArray(state.decisions) && read(DECISIONS_FILE).trim())
    notes.push(
      `${DECISIONS_FILE} predates the \`decisions\` register. Copy each recorded answer into \`decisions\` in state.json (D-n, keeping the user's words verbatim) in the write that creates the register; the hook then regenerates the file from it.`,
    )
  if (!Array.isArray(state.practices) && handWrittenRules(read(PRACTICES_FILE)))
    notes.push(
      `${PRACTICES_FILE} has Mandated, Forbidden, Stage plan presets or Learned rules entries written by hand. Copy them into \`practices\` in state.json (RULE-n) in the write that creates the register; the hook then generates those sections.`,
    )
} else if (state && typeof state === "object" && isPractices) {
  // A first draft simply gains the block; only an edit to the rule sections needs telling.
  const before = existsSync(join(root, PRACTICES_FILE)) ? readFileSync(join(root, PRACTICES_FILE), "utf8") : ""
  const touchedRules = before.includes("<!-- tomdlc:generated practices") || handWrittenRules(before)
  if (syncPractices(root, state) && touchedRules) notes.push(
    `The Mandated, Forbidden, Stage plan presets and Learned rules sections of ${PRACTICES_FILE} are generated from \`practices\` in state.json, so they were restored from the register. ` +
      "Agents: leave them alone. Orchestrator: record a rule the user agreed to in `practices` (RULE-n) instead.",
  )
}

respond(notes.length ? { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `TomDLC: ${notes.join(" ")}` } } : {})
