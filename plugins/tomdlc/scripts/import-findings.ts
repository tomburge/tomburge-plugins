#!/usr/bin/env bun
// Normalizes a scanner report into TomDLC finding candidates, so the
// orchestrator can load them into the findings register and plan a
// security-patch change.
//
//   bun import-findings.ts <report-file> [--format <format>]
//
// Formats (auto-detected): sarif, semgrep, gitleaks, npm-audit, pip-audit,
// osv-scanner, trivy, sonar, dependabot. Prints JSON:
//   { format, findings: [{ tool, kind, rule, severity, title, location,
//     package, installed, fixedIn, autoFixable, fingerprint }], summary }
// kind is code | dependency | secret | config. autoFixable is true only for
// dependency findings with a known fixed version; secrets always need
// rotation, and code findings need a human-reviewed fix.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

type Severity = "critical" | "high" | "medium" | "low"
interface Finding {
  tool: string
  kind: "code" | "dependency" | "secret" | "config"
  rule: string
  severity: Severity
  severityKnown: boolean
  title: string
  location?: string
  package?: string
  installed?: string
  fixedIn?: string
  autoFixable: boolean
  fingerprint: string
}
type Obj = Record<string, any>

const fromCvss = (score: number): Severity => (score >= 9 ? "critical" : score >= 7 ? "high" : score >= 4 ? "medium" : "low")
function fromWord(word: unknown): Severity | null {
  const w = String(word ?? "").toLowerCase()
  if (["critical", "blocker"].includes(w)) return "critical"
  if (["high", "error", "major_high"].includes(w)) return "high"
  if (["medium", "moderate", "warning", "major"].includes(w)) return "medium"
  if (["low", "minor", "info", "note", "informational", "negligible"].includes(w)) return "low"
  const n = Number.parseFloat(w)
  return Number.isFinite(n) ? fromCvss(n) : null
}

function make(f: Omit<Finding, "fingerprint" | "severity" | "severityKnown"> & { severity: Severity | null }): Finding {
  const fingerprint = createHash("sha256").update([f.tool, f.rule, f.location ?? "", f.package ?? "", f.installed ?? ""].join("|")).digest("hex").slice(0, 16)
  return { ...f, severity: f.severity ?? "medium", severityKnown: f.severity !== null, fingerprint }
}

function detect(d: any): string {
  if (Array.isArray(d)) {
    if (d.some((x) => x?.security_advisory)) return "dependabot"
    if (d.some((x) => x?.RuleID !== undefined)) return "gitleaks"
  } else if (d && typeof d === "object") {
    if (Array.isArray(d.runs) && (String(d.version ?? "").startsWith("2") || String(d.$schema ?? "").includes("sarif"))) return "sarif"
    if (d.auditReportVersion && d.vulnerabilities) return "npm-audit"
    if (Array.isArray(d.dependencies) && d.dependencies.some((x: Obj) => Array.isArray(x?.vulns))) return "pip-audit"
    if (Array.isArray(d.Results)) return "trivy"
    if (Array.isArray(d.results) && d.results.some((x: Obj) => Array.isArray(x?.packages))) return "osv-scanner"
    if (Array.isArray(d.results) && d.results.some((x: Obj) => x?.check_id)) return "semgrep"
    if (Array.isArray(d.issues) && d.issues.some((x: Obj) => x?.rule && x?.component !== undefined)) return "sonar"
  }
  throw new Error("unrecognized report format; pass --format")
}

const parsers: Record<string, (d: any) => Finding[]> = {
  sarif: (d) =>
    d.runs.flatMap((run: Obj) => {
      const tool = run.tool?.driver?.name ?? "sarif"
      const rules = new Map<string, Obj>((run.tool?.driver?.rules ?? []).map((r: Obj) => [r.id, r]))
      return (run.results ?? []).map((r: Obj) => {
        const rule = rules.get(r.ruleId) ?? {}
        const score = Number.parseFloat(r.properties?.["security-severity"] ?? rule.properties?.["security-severity"])
        const loc = r.locations?.[0]?.physicalLocation
        return make({
          tool, kind: /secret|leak/i.test(`${tool} ${r.ruleId}`) ? "secret" : "code", rule: r.ruleId ?? "unknown",
          severity: Number.isFinite(score) ? fromCvss(score) : fromWord(r.level ?? rule.defaultConfiguration?.level),
          title: r.message?.text ?? rule.shortDescription?.text ?? r.ruleId,
          location: loc ? `${loc.artifactLocation?.uri ?? "?"}:${loc.region?.startLine ?? "?"}` : undefined, autoFixable: false,
        })
      })
    }),
  semgrep: (d) =>
    d.results.map((r: Obj) =>
      make({
        tool: "semgrep", kind: "code", rule: r.check_id, severity: fromWord(r.extra?.severity), title: String(r.extra?.message ?? r.check_id).trim(),
        location: `${r.path}:${r.start?.line}`, autoFixable: false,
      }),
    ),
  gitleaks: (d) =>
    d.map((r: Obj) =>
      make({ tool: "gitleaks", kind: "secret", rule: r.RuleID, severity: "high", title: `${r.Description ?? r.RuleID} (rotate it; removing it from history isn't enough)`,
        location: `${r.File}:${r.StartLine}`, autoFixable: false }),
    ),
  "npm-audit": (d) =>
    Object.entries<Obj>(d.vulnerabilities).map(([name, v]) => {
      const via = (v.via ?? []).find((x: unknown) => typeof x === "object") as Obj | undefined
      const fix = v.fixAvailable
      return make({
        tool: "npm audit", kind: "dependency", rule: via?.url ?? via?.source?.toString() ?? `npm:${name}`, severity: fromWord(v.severity),
        title: via?.title ?? `Vulnerable dependency ${name}`, package: name, installed: v.range,
        fixedIn: typeof fix === "object" ? `${fix.name}@${fix.version}` : undefined, autoFixable: fix === true || (typeof fix === "object" && !fix.isSemVerMajor),
      })
    }),
  "pip-audit": (d) =>
    d.dependencies.flatMap((dep: Obj) =>
      (dep.vulns ?? []).map((v: Obj) =>
        make({
          tool: "pip-audit", kind: "dependency", rule: v.id, severity: null, title: String(v.description ?? v.id).split("\n")[0].slice(0, 200),
          package: dep.name, installed: dep.version, fixedIn: v.fix_versions?.[0], autoFixable: (v.fix_versions ?? []).length > 0,
        }),
      ),
    ),
  "osv-scanner": (d) =>
    d.results.flatMap((res: Obj) =>
      (res.packages ?? []).flatMap((p: Obj) =>
        (p.vulnerabilities ?? []).map((v: Obj) => {
          const group = (p.groups ?? []).find((g: Obj) => (g.ids ?? []).includes(v.id))
          const fixed = (v.affected ?? []).flatMap((a: Obj) => (a.ranges ?? []).flatMap((r: Obj) => (r.events ?? []).map((e: Obj) => e.fixed))).find(Boolean)
          return make({
            tool: "osv-scanner", kind: "dependency", rule: v.id, severity: fromWord(v.database_specific?.severity) ?? fromWord(group?.max_severity),
            title: v.summary ?? v.id, location: res.source?.path, package: p.package?.name, installed: p.package?.version, fixedIn: fixed, autoFixable: !!fixed,
          })
        }),
      ),
    ),
  trivy: (d) =>
    d.Results.flatMap((res: Obj) => [
      ...(res.Vulnerabilities ?? []).map((v: Obj) =>
        make({ tool: "trivy", kind: "dependency", rule: v.VulnerabilityID, severity: fromWord(v.Severity), title: v.Title ?? v.VulnerabilityID,
          location: res.Target, package: v.PkgName, installed: v.InstalledVersion, fixedIn: v.FixedVersion || undefined, autoFixable: !!v.FixedVersion }),
      ),
      ...(res.Misconfigurations ?? []).map((m: Obj) =>
        make({ tool: "trivy", kind: "config", rule: m.ID, severity: fromWord(m.Severity), title: m.Title ?? m.ID, location: res.Target, autoFixable: false }),
      ),
      ...(res.Secrets ?? []).map((s: Obj) =>
        make({ tool: "trivy", kind: "secret", rule: s.RuleID, severity: fromWord(s.Severity) ?? "high", title: s.Title ?? s.RuleID,
          location: `${res.Target}:${s.StartLine}`, autoFixable: false }),
      ),
    ]),
  sonar: (d) =>
    d.issues.map((i: Obj) =>
      make({
        tool: "sonar", kind: "code", rule: i.rule, severity: fromWord(i.impacts?.[0]?.severity) ?? fromWord(i.severity), title: i.message ?? i.rule,
        location: `${String(i.component).split(":").pop()}:${i.line ?? "?"}`, autoFixable: false,
      }),
    ),
  dependabot: (d) =>
    d.map((a: Obj) =>
      make({
        tool: "dependabot", kind: "dependency", rule: a.security_advisory?.ghsa_id ?? a.number?.toString(), severity: fromWord(a.security_advisory?.severity),
        title: a.security_advisory?.summary ?? "Dependabot alert", location: a.dependency?.manifest_path, package: a.dependency?.package?.name,
        fixedIn: a.security_vulnerability?.first_patched_version?.identifier, autoFixable: !!a.security_vulnerability?.first_patched_version,
      }),
    ),
}

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith("--"))
const fi = args.indexOf("--format")
if (!file) {
  console.error("usage: bun import-findings.ts <report-file> [--format sarif|semgrep|gitleaks|npm-audit|pip-audit|osv-scanner|trivy|sonar|dependabot]")
  process.exit(2)
}
try {
  const data = JSON.parse(readFileSync(file, "utf8"))
  const format = fi >= 0 ? args[fi + 1] : detect(data)
  const parse = parsers[format]
  if (!parse) throw new Error(`unknown format ${format}`)
  const seen = new Set<string>()
  const findings = parse(data).filter((f) => !seen.has(f.fingerprint) && !!seen.add(f.fingerprint))
  const order: Severity[] = ["critical", "high", "medium", "low"]
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
  const summary = Object.fromEntries(order.map((s) => [s, findings.filter((f) => f.severity === s).length]))
  console.log(JSON.stringify({ format, findings, summary: { ...summary, autoFixable: findings.filter((f) => f.autoFixable).length } }, null, 2))
} catch (err) {
  console.error(`import-findings: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
