#!/usr/bin/env bun
// Audit hook for SubagentStart, SubagentStop and PostToolUse (Write/Edit/
// MultiEdit). Appends events to docs/sdlc/audit.jsonl in TomDLC projects:
//  - agent_dispatched / agent_stopped for every subagent
//  - decisions_recorded when docs/sdlc/decisions.md is written
//  - for each write to state.json, events derived from what changed: changes
//    approved and archived, stage and slice status changes (with the user's
//    approval text), waivers, findings and their decisions, the baseline, and
//    settings. Rewriting earlier `history` entries is logged and reported back.
//  - fingerprints of a stage's documents when its gate is approved (or
//    re-approved) and when the reviewer returns READY; later writes to a
//    fingerprinted document are logged and reported as needing re-approval.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { appendAudit, drift, fingerprint, readAudit, sha256, isTomdlcProject, readSnapshot, rememberState, setFingerprint, stageDocs } from "./lib/audit.ts"
import { envNames, sharedAccounts } from "./lib/environments.ts"
import { DECISIONS_FILE, REPORTS_DIR, STAGES, STATE_FILE, dispatchKey, filePathOf, finalReport, projectPath, projectRoot, readEvent, respond, samePath, workRoot } from "./lib/hook.ts"

type Obj = Record<string, any>

// Generated, vendored and hook-owned paths aren't worth an audit line per write.
const SKIP_ARTIFACTS = /(^|\/)(node_modules|\.git|dist|build|vendor|\.venv|venv|__pycache__|coverage)\/|^docs\/sdlc\/(audit\.jsonl|\.audit-state\.json|reports\/)/i
type Ev = [event: string, data: Obj]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const byId = (xs: unknown): Map<string, Obj> =>
  new Map((Array.isArray(xs) ? xs : []).filter((x) => x && typeof x === "object").map((x: Obj, i) => [String(x.id ?? `#${i}`), x]))
const firstLine = (s: unknown, max = 200) => String(s ?? "").trim().split("\n")[0].slice(0, max)

function diffState(prev: Obj | undefined, next: Obj): Ev[] {
  if (!prev) {
    const init: Ev[] = [["state_initialized", { project: next.project, codebase: next.codebase, riskTier: next.riskTier }]]
    // A project whose state is created together with its first change: that change is proposed (or,
    // from an older flow, approved) at this point too.
    if (next.change?.id)
      init.push([next.change.approval?.text ? "change_approved" : "change_proposed", {
        id: next.change.id, shape: next.change.shape, title: next.change.title,
        ...(next.change.approval?.text ? { approval: next.change.approval.text } : {}),
        plan: Object.fromEntries(STAGES.map((s) => [s, next.change.plan?.[s]?.action])),
      }])
    return init
  }
  const out: Ev[] = []

  for (const field of ["project", "codebase", "ui", "riskTier"])
    if (!same(prev[field], next[field])) out.push(["setting_changed", { field, from: prev[field], to: next[field] }])

  if (next.change && prev.change?.id !== next.change.id && !next.change.approval?.text)
    out.push(["change_proposed", {
      id: next.change.id, shape: next.change.shape, title: next.change.title,
      plan: Object.fromEntries(STAGES.map((s) => [s, next.change.plan?.[s]?.action])),
    }])
  else if (next.change && (prev.change?.id !== next.change.id || prev.change?.approval?.text !== next.change.approval?.text))
    out.push(["change_approved", {
      id: next.change.id, shape: next.change.shape, title: next.change.title, approval: next.change.approval?.text,
      plan: Object.fromEntries(STAGES.map((s) => [s, next.change.plan?.[s]?.action])),
    }])
  else if (next.change && !same(prev.change?.plan, next.change.plan)) out.push(["change_plan_updated", { id: next.change.id, plan: next.change.plan }])

  const prevArchived = byId(prev.completedChanges)
  for (const [id, c] of byId(next.completedChanges)) if (!prevArchived.has(id)) out.push(["change_archived", { id, outcome: c.outcome }])

  for (const stage of STAGES) {
    const a = prev.stages?.[stage] ?? {}
    const b = next.stages?.[stage] ?? {}
    if (a.status !== b.status) {
      const data: Obj = { stage, from: a.status, to: b.status }
      if (String(b.status).startsWith("passed")) Object.assign(data, { approval: b.approval?.text, revisions: b.revisions ?? 0, ...(b.approval?.conditional ? { conditional: true, changesAfterApproval: b.approval.changes } : {}) })
      out.push(["stage_status_changed", data])
    } else if ((b.revisions ?? 0) > (a.revisions ?? 0)) {
      out.push(["gate_changes_requested", { stage, revisions: b.revisions }])
    } else if (String(b.status).startsWith("passed") && (a.approval?.text !== b.approval?.text || a.approval?.at !== b.approval?.at)) {
      out.push(["stage_reapproved", { stage, approval: b.approval?.text, ...(b.approval?.conditional ? { conditional: true, changesAfterApproval: b.approval.changes } : {}) }])
    }
  }

  const prevSlices = byId(prev.stages?.develop?.slices)
  for (const [id, s] of byId(next.stages?.develop?.slices))
    if (prevSlices.get(id)?.status !== s.status) out.push(["slice_status_changed", { id, from: prevSlices.get(id)?.status, to: s.status }])

  const prevWaivers = byId(prev.waivers)
  const nextWaivers = byId(next.waivers)
  for (const [id, w] of nextWaivers) {
    const old = prevWaivers.get(id)
    if (!old) out.push(["waiver_granted", { id: w.id, stage: w.stage, criterion: w.criterion, reason: w.reason, owner: w.owner, expires: w.expires }])
    else if (!same(old, w)) out.push(["waiver_changed", { id: w.id, from: old, to: w }])
  }
  for (const [id, w] of prevWaivers) if (!nextWaivers.has(id)) out.push(["waiver_removed", { id: w.id, stage: w.stage, criterion: w.criterion }])

  const prevFindings = byId(prev.findings)
  for (const [id, f] of byId(next.findings)) {
    const old = prevFindings.get(id)
    if (!old) out.push(["finding_recorded", { id, stage: f.stage, severity: f.severity, source: f.source, summary: f.summary, status: f.status }])
    else if (old.status !== f.status) out.push(["finding_status_changed", { id, from: old.status, to: f.status, decision: f.decision, waiver: f.waiver }])
  }

  // Environments: the definition (set, accounts, profiles, regions), shared-account approvals and promotions.
  const envDef = (e: Obj | undefined) =>
    e ? { set: e.set, dr: e.dr?.strategy, ...Object.fromEntries(envNames(e).map((n) => [n, { account: e[n]?.account, profile: e[n]?.profile, region: e[n]?.region, drRegion: e[n]?.drRegion }])) } : undefined
  if (!same(envDef(prev.environments), envDef(next.environments)) && next.environments)
    out.push(["environments_set", { ...envDef(next.environments), sharedAccounts: sharedAccounts(next.environments).map(([acct, ns]) => ({ account: acct, environments: ns })) }])
  if (next.environments?.sharedAccountsApproval?.text && next.environments.sharedAccountsApproval.text !== prev.environments?.sharedAccountsApproval?.text)
    out.push(["shared_accounts_approved", { approval: next.environments.sharedAccountsApproval.text, sharedAccounts: sharedAccounts(next.environments).map(([acct, ns]) => ({ account: acct, environments: ns })) }])
  const devKey = (d: Obj) => `${d?.build}@${d?.at}`
  const prevDev = new Set((Array.isArray(prev.environments?.devDeploys) ? prev.environments.devDeploys : []).map(devKey))
  for (const d of Array.isArray(next.environments?.devDeploys) ? next.environments.devDeploys : [])
    if (!prevDev.has(devKey(d))) out.push(["dev_deployed", { build: d?.build, account: d?.account, smoke: d?.smoke, at: d?.at }])
  const prevPromotions = byId(prev.environments?.promotions)
  for (const [id, p] of byId(next.environments?.promotions)) {
    const old = prevPromotions.get(id)
    if (!old || old.status !== p.status) {
      const name = p.status === "requested" ? "promotion_requested" : p.status === "approved" ? "promotion_approved" : "promotion_rejected"
      out.push([name, { id, to: p.to, build: p.build, ...(p.approval?.text ? { approval: p.approval.text } : {}) }])
    }
  }

  const prevRisks = byId(prev.risks)
  for (const [id, r] of byId(next.risks)) {
    const old = prevRisks.get(id)
    if (!old) out.push(["risk_added", { id, type: r.type, description: r.description, likelihood: r.likelihood, impact: r.impact, treatment: r.treatment, owner: r.owner, decision: r.decision }])
    else if (!same(old, r)) out.push(["risk_changed", { id, from: { status: old.status, treatment: old.treatment, likelihood: old.likelihood, impact: old.impact }, to: { status: r.status, treatment: r.treatment, likelihood: r.likelihood, impact: r.impact }, decision: r.decision }])
  }

  const prevSpikes = byId(prev.spikes)
  for (const [id, x] of byId(next.spikes)) {
    const old = prevSpikes.get(id)
    if (!old || old.status !== x.status) out.push(["spike_status_changed", { id, from: old?.status, to: x.status, outcome: x.outcome, decision: x.decision }])
  }

  const dep = next.stages?.deploy?.deployment
  if (dep && !same(prev.stages?.deploy?.deployment, dep)) out.push(["deployment_recorded", { ...dep }])

  if (next.baseline && !same(prev.baseline, next.baseline)) {
    const b = next.baseline
    out.push(["baseline_recorded", { command: b.command, commit: b.commit, passed: b.passed, failed: b.failed, skipped: b.skipped, coverage: b.coverage }])
  }

  const ph: unknown[] = Array.isArray(prev.history) ? prev.history : []
  const nh: unknown[] = Array.isArray(next.history) ? next.history : []
  if (nh.length < ph.length || ph.some((h, i) => !same(h, nh[i]))) out.push(["history_rewritten", { before: ph.length, after: nh.length }])

  return out
}

const event = await readEvent()
const root = projectRoot(event.cwd ?? process.cwd())
const readState = (): Obj | null => {
  try {
    return JSON.parse(readFileSync(join(root, STATE_FILE), "utf8"))
  } catch {
    return null
  }
}
const actor = event.agent_type ? String(event.agent_type) : "orchestrator"

if (!isTomdlcProject(root)) {
  respond()
} else if (event.hook_event_name === "SubagentStart") {
  const key = dispatchKey(event)
  appendAudit(root, "agent_dispatched", "orchestrator", {
    agent: event.agent_type, agentId: event.agent_id, ...(key && key.includes("#") ? { key } : {}),
  })
  respond()
} else if (event.hook_event_name === "SubagentStop") {
  const message = finalReport(event) ?? ""
  const summary = message.split(/^\s*#{1,6}\s*Summary\s*$/im)[1]
  const verdict = message.match(/\b(NOT READY|READY)\b/)?.[1]
  // Keep the full report of every TomDLC agent as evidence, one file per agent run.
  let reportFile: string | undefined
  if (String(event.agent_type ?? "").startsWith("tomdlc:") && message.trim()) {
    const stage = String(readState()?.currentStage ?? "orient")
    const name = String(event.agent_type).slice("tomdlc:".length)
    // One file per stop, so a re-dispatched agent never overwrites its earlier report.
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)
    // Monthly folders keep any one folder small; files are never moved, so audit references stay valid.
    const month = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}`
    reportFile = `${REPORTS_DIR}/${month}/${stamp}-${stage}-${name}-${String(event.agent_id ?? "x").slice(0, 8)}.md`
    mkdirSync(join(root, REPORTS_DIR, month), { recursive: true })
    writeFileSync(join(root, reportFile), `<!-- TomDLC agent report: ${event.agent_type} (${event.agent_id}), stage ${stage}. Written by a hook; do not edit. -->\n\n${message}\n`)
  }
  // The instance's dispatch key is only reliably readable now: at SubagentStart the
  // agent's own transcript (which holds its brief) may not exist yet. Found in a live run.
  const stopKey = dispatchKey(event)
  appendAudit(root, "agent_stopped", "orchestrator", {
    agent: event.agent_type, agentId: event.agent_id, ...(stopKey && stopKey.includes("#") ? { key: stopKey } : {}),
    summary: summary ? firstLine(summary.trim()) : undefined,
    verdict: event.agent_type === "tomdlc:reviewer" ? verdict : undefined,
    ...(reportFile ? { report: reportFile, reportSha256: sha256(readFileSync(join(root, reportFile))) } : {}),
  })
  if (event.agent_type === "tomdlc:reviewer" && verdict === "READY") {
    const state = readState()
    const stage = state?.currentStage
    if (typeof stage === "string") {
      const fp = fingerprint(root, stageDocs(state, stage))
      setFingerprint(root, "reviews", stage, fp)
      appendAudit(root, "review_fingerprinted", "orchestrator", { stage, files: fp.files })
    }
  }
  respond()
} else {
  // Bind a parallel agent's instance key to its ID the first time it writes. At
  // SubagentStart its transcript (holding the brief's "Dispatch key:" line) may not
  // exist yet; by its first write it always does.
  const instance = dispatchKey(event)
  if (instance && instance.includes("#") && event.agent_id) {
    const bound = readAudit(root).some((e) => e.event === "agent_instance" && e.agentId === event.agent_id)
    if (!bound) appendAudit(root, "agent_instance", "orchestrator", { agent: event.agent_type, agentId: event.agent_id, key: instance })
  }
  const file = filePathOf(event.tool_input)
  const rel = file ? projectPath(event.cwd ?? process.cwd(), file) : null
  const isShell = event.tool_name === "Bash" || event.tool_name === "PowerShell"
  // A shell command or script that rewrote state.json skipped the state checker and the
  // approval guard. The command text can't always show it, so compare the file with the
  // last state the hooks recorded. Found live: an orchestrator updated state.json with a script.
  const recorded = isShell ? (readSnapshot(root)?.state as Obj | undefined) : undefined
  let onDisk: Obj | null = null
  if (recorded && existsSync(join(root, STATE_FILE))) {
    try {
      onDisk = JSON.parse(readFileSync(join(root, STATE_FILE), "utf8"))
    } catch {
      onDisk = {} // Unparseable counts as changed.
    }
  }
  if (recorded && onDisk && JSON.stringify(onDisk) !== JSON.stringify(recorded)) {
    const logged = readAudit(root).at(-1)
    if (logged?.event !== "state_changed_outside_tools")
      appendAudit(root, "state_changed_outside_tools", actor, { tool: event.tool_name, changes: diffState(recorded, onDisk).map(([name]) => name) })
    respond({
      decision: "block",
      reason:
        "TomDLC: docs/sdlc/state.json was changed by a shell command or script, which skips the state checker and the approval guard. " +
        "Make state changes with the Write or Edit tool only. Re-apply this change with Edit (the approval guard checks it against the last recorded state); " +
        "if the change was a mistake, restore the file. This has been recorded in docs/sdlc/audit.jsonl.",
    })
  } else if (rel && samePath(rel, DECISIONS_FILE)) {
    appendAudit(root, "decisions_recorded", actor, { file: DECISIONS_FILE })
    respond()
  } else if (rel && samePath(rel, STATE_FILE) && existsSync(join(root, STATE_FILE))) {
    let next: Obj | null = null
    try {
      next = JSON.parse(readFileSync(join(root, STATE_FILE), "utf8"))
    } catch {
      // Invalid JSON: validate-state reports it; audit waits for a valid write.
    }
    if (!next) {
      respond()
    } else {
      const prev = readSnapshot(root)?.state as Obj | undefined
      const events = diffState(prev, next)
      const rewritten = events.some(([name]) => name === "history_rewritten")
      // After a rewrite, keep remembering the original history so restoring it is accepted silently.
      const remembered = rewritten ? { ...next, history: prev?.history } : next
      if (events.length === 0) rememberState(root, remembered)
      events.forEach(([name, data], i) => appendAudit(root, name, actor, data, i === events.length - 1 ? remembered : undefined))
      for (const [name, data] of events) {
        const passed = name === "stage_status_changed" && String(data.to).startsWith("passed")
        if (passed || name === "stage_reapproved") {
          const fp = fingerprint(root, stageDocs(next, data.stage))
          setFingerprint(root, "gates", data.stage, fp)
          appendAudit(root, "stage_fingerprinted", actor, { stage: data.stage, files: fp.files })
        }
      }
      if (rewritten) {
        respond({
          decision: "block",
          reason:
            "TomDLC audit: earlier `history` entries in state.json were changed or removed. History is append-only: restore the earlier entries and only add new ones. The rewrite has been recorded in docs/sdlc/audit.jsonl.",
        })
      } else {
        respond()
      }
    }
  } else if (rel) {
    const cwd = event.cwd ?? process.cwd()
    const abs = resolve(cwd, file as string)
    const worktree = workRoot(cwd) !== root ? workRoot(cwd) : undefined
    if (!SKIP_ARTIFACTS.test(rel) && existsSync(abs) && statSync(abs).isFile())
      appendAudit(root, "artifact_written", actor, { file: rel, tool: event.tool_name, sha256: sha256(readFileSync(abs)), ...(worktree ? { worktree } : {}) })
    const hits = drift(root).filter((d) => d.file.toLowerCase() === rel.toLowerCase())
    // Log the first change to each document per approval or review; later edits add nothing new.
    const logged = new Set(
      readAudit(root)
        .filter((e) => e.event === "approved_document_changed" || e.event === "reviewed_document_changed")
        .map((e) => `${e.event}|${e.file}|${e.since}`),
    )
    for (const d of hits) {
      const name = d.kind === "gate" ? "approved_document_changed" : "reviewed_document_changed"
      if (!logged.has(`${name}|${d.file}|${d.since}`)) appendAudit(root, name, actor, { file: d.file, stage: d.stage, since: d.since })
    }
    const gates = hits.filter((d) => d.kind === "gate")
    if (gates.length > 0) {
      respond({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            `TomDLC: ${rel} was approved at the ${gates.map((d) => d.stage).join(" and ")} gate, and it has now changed. ` +
            `Before the next gate passes, show the user what changed and record their re-approval in stages.<stage>.approval (their words, with a new date). ` +
            "The approval guard won't let a later stage pass until then.",
        },
      })
    } else {
      respond()
    }
  } else {
    respond()
  }
}
