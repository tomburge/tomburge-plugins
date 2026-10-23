#!/usr/bin/env bun
// UserPromptSubmit hook. In TomDLC projects, records what the user actually
// typed in docs/sdlc/audit.jsonl (with secrets redacted), so approvals and
// decisions that state.json attributes to the user can be checked against
// real prompts by the approval guard. Never blocks a prompt.
//
// Claude Code also delivers subagent hand-backs and system notifications to
// the main session as prompts, and GitHub Copilot CLI fires this hook for every
// subagent's brief and follow-up (with the subagent's agent_id). Those are
// logged as `agent_message`, never as `user_prompt`, so an agent's words, or
// the orchestrator's words in a brief, can't be mistaken for the user's.
import { appendAudit, isTomdlcProject, sha256 } from "./lib/audit.ts"
import { isAgentMessage, isSubagent, projectRoot, readEvent, respond } from "./lib/hook.ts"
import { redactSecrets } from "./lib/secrets.ts"

const MAX = 8000

const event = await readEvent()
const root = projectRoot(event.cwd ?? process.cwd())
const prompt = event.prompt

if (typeof prompt === "string" && isTomdlcProject(root)) {
  if (isSubagent(event) || isAgentMessage(prompt)) {
    const from = isSubagent(event) ? event.agent_type : prompt.match(/<agent-message from="([^"]+)"/)?.[1]
    appendAudit(root, "agent_message", "agent", { from, length: prompt.length, sha256: sha256(prompt) })
  } else {
    const text = redactSecrets(prompt)
    appendAudit(root, "user_prompt", "user", {
      text: text.slice(0, MAX),
      ...(text.length > MAX ? { truncated: true } : {}),
      sha256: sha256(prompt),
    })
  }
}
respond()
