#!/usr/bin/env bun
// SubagentStop hook. TomDLC agents must end with the six result sections the
// orchestrator reviews. If any are missing, the agent is sent back to add
// them, once; on the retry (stop_hook_active) it is allowed to stop.
import { finalReport, readEvent, respond, tomdlcAgent } from "./lib/hook.ts"

const SECTIONS = ["Summary", "Files changed", "Gate self-assessment", "Questions for the user", "Handoffs", "Findings"]

const event = await readEvent()
const message = finalReport(event)

if (!tomdlcAgent(event) || event.stop_hook_active || typeof message !== "string") {
  respond()
} else {
  // Accept a Markdown heading ("### Summary") or a bold label ("**Summary**").
  const missing = SECTIONS.filter((s) => !new RegExp(`^\\s*(#{1,6}\\s*|\\*\\*)${s}\\b`, "im").test(message))
  if (missing.length === 0) {
    respond()
  } else {
    respond({
      decision: "block",
      reason:
        `Your result is missing these required sections: ${missing.join(", ")}. ` +
        `End your final message with all six sections as headings, in order: ${SECTIONS.join(", ")}. ` +
        'Write "None." under any section with nothing to report. Don\'t redo the work; just restate the result in this format.',
    })
  }
}
