#!/usr/bin/env bun
// SessionStart hook handler. Reads the event from stdin, writes a JSON result
// to stdout. If the project has a TomDLC state file, tells Claude which stage
// the project is in and flags expired waivers. Swap "bun" for "node" or
// "python3" in hooks/hooks.json if your users' environment lacks bun.
import { ENV_SETS } from "./lib/environments.ts"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { appendAudit, drift, verifyAudit } from "./lib/audit.ts"

const STAGES = ["plan", "requirements", "design", "develop", "test", "deploy", "maintain"]

function context(cwd: string): string | null {
  const statePath = join(cwd, "docs", "sdlc", "state.json")
  if (!existsSync(statePath)) return null

  const state = JSON.parse(readFileSync(statePath, "utf8"))
  const current: string = state.currentStage ?? "plan"
  const statuses = STAGES.map((s) => `${s}=${state.stages?.[s]?.status ?? "not-started"}`).join(", ")

  const today = new Date().toISOString().slice(0, 10)
  const expired = (state.waivers ?? []).filter((w: { expires?: string }) => w.expires && w.expires < today)

  const change = state.change
  const slices: { id: string; status: string }[] = state.stages?.develop?.slices ?? []
  const lines = [
    `TomDLC: project "${state.project ?? "unnamed"}" is in stage ${STAGES.indexOf(current) + 1}/7 (${current}).`,
    change ? `Active change: ${change.id} (${change.shape}): ${change.title}.` : "No active change recorded.",
    `Stage status: ${statuses}.`,
    `Risk tier: ${state.riskTier ?? "not set"}. Scale: ${change?.scale ?? state.scale ?? "not set"} (see reference/tuning.md for questions, review rounds and findings handling).`,
    ...(state.platform ? [`Platform: ${state.platform.cloud ?? "?"}, IaC ${state.platform.iac ?? "not chosen yet"} (platform-engineer owns infra/**).`] : []),
    ...(state.platform && !state.environments
      ? ["No `environments` recorded for this cloud project, so the environment gate is off: deploys aren't checked against dev, stage or prod. Ask the environment and HA/DR questions (set, account and profile per environment, regions, DR strategy) and record them before the next deploy."]
      : []),
    ...(state.environments?.set
      ? [
          `Environments (${state.environments.set}): ` +
            (ENV_SETS[state.environments.set] ?? [])
              .map((n: string) => {
                const e = state.environments[n] ?? {}
                const ps = (state.environments.promotions ?? []).filter((p: any) => p.to === n && p.status === "approved")
                const devs = (state.environments.devDeploys ?? []).filter((d: any) => d?.smoke === "passed")
                const promoted = n === "dev"
                  ? devs.length > 0 ? `deployed by Develop; last smoke-tested build ${String(devs.at(-1).build).slice(0, 12)}` : "deployed by Develop; no dev deploy recorded yet"
                  : ps.some((p: any) => p.checks?.deployedBuild === p.build) ? "promoted and verified"
                  : ps.length > 0 ? "promotion approved, not verified yet: record its checks"
                  : "not promoted yet"
                return `${n} = ${e.profile ?? "?"} / ${e.account ?? "?"}${e.region ? ` / ${e.region}` : ""}${e.drRegion ? ` (DR ${e.drRegion})` : ""} (${promoted})`
              })
              .join("; ") +
            (state.environments.dr?.strategy ? `. DR strategy: ${state.environments.dr.strategy}` : "") +
            ". Develop deploys only to dev; stage and prod need a promotion the user approves with the single word \"Approve\".",
        ]
      : []),
    `Stage outputs live in docs/sdlc/. Continue with /tomdlc, the orchestrator that dispatches the stage agents.`,
  ]
  if (slices.length > 0) lines.push(`Develop slices: ${slices.map((s) => `${s.id}=${s.status}`).join(", ")}.`)
  if (state.baseline) {
    const b = state.baseline
    lines.push(`Test baseline (${b.recordedAt}): ${b.passed} passed, ${b.failed} failed, ${b.skipped} skipped, via \`${b.command}\`.`)
  }

  const resume = state.resume ?? {}
  if (resume.nextAction) lines.push(`Next action: ${resume.nextAction}`)
  const questions: string[] = resume.openQuestions ?? []
  if (questions.length > 0) lines.push(`Questions waiting for the user: ${questions.map((q) => `"${q}"`).join("; ")}`)
  const loops = Object.entries<number>(resume.loops ?? {}).filter(([, n]) => n > 0)
  if (loops.length > 0) lines.push(`Fix loops used (max 3): ${loops.map(([k, n]) => `${k}=${n}`).join(", ")}.`)

  const open = (state.findings ?? []).filter((f: { status?: string }) => f.status === "open")
  if (open.length > 0) {
    const bySeverity = ["critical", "high", "medium", "low"]
      .map((sev) => [sev, open.filter((f: { severity?: string }) => f.severity === sev).length] as const)
      .filter(([, n]) => n > 0)
      .map(([sev, n]) => `${n} ${sev}`)
    lines.push(`Open findings: ${bySeverity.join(", ")} (${open.map((f: { id: string }) => f.id).join(", ")}).`)
  }

  try {
    const dispatchPath = join(cwd, "docs", "sdlc", ".dispatch.json")
    const leftover = existsSync(dispatchPath) ? Object.keys(JSON.parse(readFileSync(dispatchPath, "utf8")).agents ?? {}) : []
    if (leftover.length > 0)
      lines.push(`.dispatch.json still lists ${leftover.join(", ")}: a session likely ended mid-dispatch. Check what they left behind before re-dispatching.`)
  } catch {
    // A malformed dispatch file is reported by validate-state when it's next written.
  }
  if (expired.length > 0) {
    lines.push(
      `${expired.length} waiver(s) have expired: ${expired.map((w: { stage: string; criterion: string }) => `${w.stage}: ${w.criterion}`).join("; ")}. Raise this with the user.`,
    )
  }
  const changed = drift(cwd)
  const gateDrift = changed.filter((d) => d.kind === "gate")
  const reviewDrift = changed.filter((d) => d.kind === "review")
  if (gateDrift.length > 0)
    lines.push(
      `Approved documents changed since their gate: ${gateDrift.map((d) => `${d.file} (${d.stage}, approved ${d.since.slice(0, 10)})`).join("; ")}. ` +
        "Show the user what changed and record their re-approval; no later stage can pass until then.",
    )
  if (reviewDrift.length > 0)
    lines.push(`Documents changed since the reviewer's READY verdict: ${reviewDrift.map((d) => `${d.file} (${d.stage})`).join("; ")}.`)

  const audit = verifyAudit(cwd)
  lines.push(
    audit.problem
      ? `WARNING: the audit log docs/sdlc/audit.jsonl failed its integrity check: ${audit.problem}. Tell the user; don't try to repair it.`
      : `Audit log: ${audit.entries} entries, chain intact.`,
  )
  return lines.join("\n")
}

const event = JSON.parse(await new Response(Bun.stdin.stream()).text())
let additionalContext: string | null = null
try {
  additionalContext = context(event.cwd ?? process.cwd())
  if (additionalContext) appendAudit(event.cwd ?? process.cwd(), "session_started", "user", { source: event.source })
} catch (err) {
  additionalContext = `TomDLC: docs/sdlc/state.json exists but could not be read (${err}). Offer to repair it with /tomdlc.`
}

process.stdout.write(
  JSON.stringify(
    additionalContext ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } } : {},
  ),
)
