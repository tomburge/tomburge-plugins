// Web guard: secrets in queries and URLs, private addresses for agents, audit logging.
import { join } from "node:path"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
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
const dec = (o: any) => o.hookSpecificOutput?.permissionDecision ?? "allow"

const DIR = join(SP, "webproj")
mkdirSync(join(DIR, ".tomdlc"), { recursive: true })
const P = DIR.replaceAll("\\", "/")
const AG = { cwd: P, agent_id: "p1", agent_type: "tomdlc:planner" }
const fetch = (url: string, ev: object = AG) => run("web-guard.ts", { ...ev, tool_name: "WebFetch", tool_input: { url, prompt: "summarize" } }).then(dec)
const search = (query: string, ev: object = AG) => run("web-guard.ts", { ...ev, tool_name: "WebSearch", tool_input: { query } }).then(dec)

// public research is allowed
expect("public search", await search("GDPR breach notification deadline"), "allow")
expect("public https page", await fetch("https://gdpr-info.eu/art-33-gdpr/"), "allow")
expect("public http page", await fetch("http://example.com/pricing"), "allow")

// secrets never leave
expect("secret in a query", await search("is AKIAABCDEFGHIJKLMNOP a valid key"), "deny")
expect("secret in a URL", await fetch("https://example.com/?token=ghp_" + "a".repeat(36)), "deny")
expect("secret blocked for the main session too", await search("check AKIAABCDEFGHIJKLMNOP", { cwd: P }), "deny")

// agents can't reach internal systems
for (const url of [
  "http://localhost:8080/admin", "http://127.0.0.1/", "http://10.0.0.5/", "http://172.20.1.1/", "http://192.168.1.1/",
  "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[fd00::1]/", "http://intranet/", "http://wiki.corp.internal/",
  "http://printer.local/", "http://2130706433/", "http://0x7f000001/", "file:///etc/passwd", "ftp://example.com/x",
])
  expect(`agent blocked: ${url}`, await fetch(url), "deny")
expect("main session may fetch an internal page", await fetch("http://wiki.corp.internal/", { cwd: P }), "allow")
expect("public host that only looks private", await fetch("https://10.example.com/"), "allow")

// research is audited
const log = readFileSync(join(DIR, ".tomdlc/audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
const research = log.filter((e) => e.event === "web_research")
expect("allowed queries and fetches logged", research.length, 5)
expect("logged with the agent", research[0].actor, "tomdlc:planner")
expect("query recorded", research[0].query, "GDPR breach notification deadline")
expect("denied requests not logged as research", research.some((e) => String(e.url ?? "").includes("localhost")), false)

// outside a TomDLC project nothing is written
const PLAIN = join(SP, "plainweb")
mkdirSync(PLAIN, { recursive: true })
await search("anything", { cwd: PLAIN.replaceAll("\\", "/") })
expect("no audit outside TomDLC projects", existsSync(join(PLAIN, ".tomdlc")), false)

console.log(`${total} checks, ${fails} failures`)
process.exitCode = fails > 0 ? 1 : 0
