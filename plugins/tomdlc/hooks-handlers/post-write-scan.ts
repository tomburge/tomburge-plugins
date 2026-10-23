#!/usr/bin/env bun
// PostToolUse hook for Write/Edit/MultiEdit. Shift-left scanning: runs
// gitleaks (any file) and semgrep (code and IaC files) on just the file that
// was written, if those tools are installed, and reports findings back to
// Claude. Silent when the tools are missing or nothing is found.
// semgrep config: a .semgrep.yml / .semgrep.yaml / .semgrep/ in the project,
// else $TOMDLC_SEMGREP_CONFIG, else the p/default registry ruleset.
import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { filePathOf, projectPath, projectRoot, readEvent, respond } from "./lib/hook.ts"

const CODE =
  /\.(js|jsx|ts|tsx|mjs|cjs|py|go|java|kt|kts|rb|php|cs|c|cc|cpp|h|hpp|rs|swift|scala|sh|bash|ps1|tf|hcl|ya?ml|json|tpl)$/i
const SKIP = /(^|\/)(node_modules|\.git|vendor|dist|build|\.tomdlc)\//
const MAX_BYTES = 1_000_000
const MAX_FINDINGS = 15

function gitleaks(file: string): string[] {
  if (!Bun.which("gitleaks")) return []
  const report = join(tmpdir(), `tomdlc-gitleaks-${process.pid}.json`)
  try {
    Bun.spawnSync(
      ["gitleaks", "dir", file, "--no-banner", "--log-level", "error", "--exit-code", "0", "--report-format", "json", "--report-path", report],
      { timeout: 20_000, stdout: "ignore", stderr: "ignore" },
    )
    if (!existsSync(report)) return []
    const results: any[] = JSON.parse(readFileSync(report, "utf8") || "[]")
    // Never echo the secret itself; rule and line are enough to find it.
    return results.map((r) => `[secret] gitleaks ${r.RuleID} at line ${r.StartLine}: ${r.Description}`)
  } catch {
    return []
  } finally {
    rmSync(report, { force: true })
  }
}

function semgrep(file: string, root: string): string[] {
  if (!Bun.which("semgrep")) return []
  const local = [".semgrep.yml", ".semgrep.yaml", ".semgrep"].map((c) => join(root, c)).find((c) => existsSync(c))
  const config = local ?? process.env.TOMDLC_SEMGREP_CONFIG ?? "p/default"
  try {
    const run = Bun.spawnSync(["semgrep", "scan", "--config", config, "--json", "--quiet", "--metrics", "off", "--timeout", "20", file], {
      timeout: 45_000,
      stderr: "ignore",
    })
    const results: any[] = JSON.parse(run.stdout.toString() || "{}").results ?? []
    return results.map((r) => `[${r.extra?.severity ?? "INFO"}] semgrep ${r.check_id} at line ${r.start?.line}: ${String(r.extra?.message ?? "").trim()}`)
  } catch {
    return []
  }
}

const event = await readEvent()
const file = filePathOf(event.tool_input)
const root = projectRoot(event.cwd ?? process.cwd())
const rel = file ? projectPath(event.cwd ?? process.cwd(), file) : null
const abs = file ? resolve(event.cwd ?? process.cwd(), file) : ""

if (!rel || SKIP.test(rel) || !existsSync(abs) || statSync(abs).size > MAX_BYTES) {
  respond()
} else {
  const isCode = CODE.test(rel) || /^dockerfile/i.test(basename(rel))
  const findings = [...gitleaks(abs), ...(isCode ? semgrep(abs, root) : [])]
  if (findings.length === 0) {
    respond()
  } else {
    const shown = findings.slice(0, MAX_FINDINGS)
    const more = findings.length > shown.length ? `\n(${findings.length - shown.length} more not shown)` : ""
    respond({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          `TomDLC scan of ${rel} found ${findings.length} issue(s):\n${shown.map((f) => `- ${f}`).join("\n")}${more}\n` +
          "Fix these before moving on. A false positive should be noted with its justification (under Findings, for a stage agent).",
      },
    })
  }
}
