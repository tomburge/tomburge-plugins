#!/usr/bin/env bun
// PreToolUse hook for WebFetch and WebSearch.
//  - Everyone: a query or URL containing a secret is denied; queries go to an
//    external service.
//  - Agents: fetching anything but public http(s) is denied: localhost,
//    private, link-local and cloud-metadata addresses, internal-looking host
//    names, and file: and other schemes. This stops a prompt-injected page from
//    steering an agent at internal systems.
//  - In TomDLC projects, every query and fetch is logged in the audit log, so
//    the sources behind research can be traced.
import { appendAudit, isTomdlcProject } from "./lib/audit.ts"
import { isSubagent, projectRoot, readEvent, respond } from "./lib/hook.ts"
import { findSecrets } from "./lib/secrets.ts"

function privateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "")
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return true
  if (!h.includes(".") && !h.includes(":")) return true // single-label names resolve internally
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return true // integer or hex forms of an IP address
  if (h.includes(":")) return h === "::1" || h === "::" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:")
  return false
}

const deny = (reason: string) =>
  respond({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `TomDLC web guard: ${reason}` } })

const event = await readEvent()
const input = event.tool_input ?? {}
const query = typeof input.query === "string" ? input.query : ""
const url = typeof input.url === "string" ? input.url : ""
const prompt = typeof input.prompt === "string" ? input.prompt : ""
const root = projectRoot(event.cwd ?? process.cwd())

const secrets = findSecrets([query, url, prompt].join("\n"))
if (secrets.length > 0) {
  deny(`the ${event.tool_name === "WebSearch" ? "query" : "request"} contains a ${secrets.join(", ")}. Never send secrets to a web service.`)
} else {
  let blocked: string | null = null
  if (url && isSubagent(event)) {
    try {
      const u = new URL(url)
      if (u.protocol !== "https:" && u.protocol !== "http:") blocked = `only public http(s) pages can be fetched, not ${u.protocol} URLs.`
      else if (privateHost(u.hostname)) blocked = `${u.hostname} is a local, private or internal address. Agents may only fetch public web pages.`
    } catch {
      blocked = "that isn't a valid URL."
    }
  }
  if (blocked) {
    deny(blocked)
  } else {
    if (isTomdlcProject(root))
      appendAudit(root, "web_research", event.agent_type ? String(event.agent_type) : "orchestrator", {
        tool: event.tool_name, ...(query ? { query: query.slice(0, 300) } : {}), ...(url ? { url: url.slice(0, 500) } : {}),
      })
    respond()
  }
}
