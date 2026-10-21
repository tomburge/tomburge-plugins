#!/usr/bin/env bun
// PreToolUse hook for Write/Edit/MultiEdit. Shift-left secrets scanning: denies
// the edit when the new content contains a high-confidence credential pattern
// (see lib/secrets.ts).
import { readEvent, respond } from "./lib/hook.ts"
import { findSecrets } from "./lib/secrets.ts"

const event = await readEvent()
const input = event.tool_input ?? {}

const texts: string[] = []
if (typeof input.content === "string") texts.push(input.content)
if (typeof input.new_string === "string") texts.push(input.new_string)
if (Array.isArray(input.edits)) for (const e of input.edits) if (typeof e?.new_string === "string") texts.push(e.new_string)

const hits = [...new Set(texts.flatMap(findSecrets))]

if (hits.length > 0) {
  respond({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `TomDLC secrets guard: the content for ${input.file_path ?? "this file"} appears to contain a ${hits.join(", ")}. ` +
        "Secrets must not be committed to source. Load it from an environment variable or the secret manager instead, " +
        "or use an obvious placeholder. If this is a false positive, tell the user and let them make the edit.",
    },
  })
} else {
  respond()
}
