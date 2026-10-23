#!/usr/bin/env bun
// PreToolUse hook for Write/Edit/MultiEdit on .tomdlc/state.json. Makes
// recorded approvals provable and stops approvals going stale:
//  1. A stage gate passing (or being re-approved), a new change plan, a
//     finding the user accepted or rejected, an accepted risk, and a waiver
//     granted or widened must carry the user's own words,
//     and those words must appear in a prompt the user submitted (recorded by
//     audit-prompt.ts) after the item came up. Text in double quotes is
//     checked; with no quotes, the whole text is.
//  2. A stage can't pass while a document approved at an earlier gate has
//     changed since its approval, unless that earlier stage is re-approved in
//     the same write. At the high tier, a stage also can't pass if its
//     documents changed after the reviewer's READY verdict.
//  3. History is append-only (checked even when no prompts are recorded).
// If no prompts have been recorded at all (e.g. the prompt hook isn't
// active), approvals can't be checked and are allowed.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isApproveWord, sharedAccounts } from "./lib/environments.ts"
import { type AuditEntry, appendAudit, drift, readAudit, readSnapshot, stageDocs } from "./lib/audit.ts"
import { STAGES, STATE_FILE, filePathOf, isAgentMessage, projectPath, projectRoot, readEvent, respond, samePath } from "./lib/hook.ts"

type Obj = Record<string, any>

/** Apply the tool's edit to the current content; null if it can't be determined. */
function nextContent(tool: string | undefined, input: Obj, current: string | null): string | null {
  const replaceOnce = (s: string, oldS: string, newS: string, all: boolean) => {
    if (all) return s.split(oldS).join(newS)
    const i = s.indexOf(oldS)
    return i < 0 ? s : s.slice(0, i) + newS + s.slice(i + oldS.length)
  }
  if (tool === "Write") return typeof input.content === "string" ? input.content : null
  if (current === null) return null
  if (tool === "Edit") return replaceOnce(current, String(input.old_string ?? ""), String(input.new_string ?? ""), !!input.replace_all)
  if (tool === "MultiEdit" && Array.isArray(input.edits))
    return input.edits.reduce((s: string, e: Obj) => replaceOnce(s, String(e.old_string ?? ""), String(e.new_string ?? ""), !!e.replace_all), current)
  return null
}

const norm = (s: string) =>
  s.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase()

/** The parts of the text that must be the user's words: quoted spans if any, else the whole text. */
function userWords(text: string): string[] {
  const t = text.replace(/[“”]/g, '"')
  const quoted = [...t.matchAll(/"([^"]{2,})"/g)].map((m) => m[1])
  return quoted.length > 0 ? quoted : [t]
}

const isPassed = (s: unknown) => typeof s === "string" && s.startsWith("passed")

const event = await readEvent()
const root = projectRoot(event.cwd ?? process.cwd())
const file = filePathOf(event.tool_input)
const rel = file ? projectPath(event.cwd ?? process.cwd(), file) : null

if (!rel || !samePath(rel, STATE_FILE)) {
  respond()
} else {
  const statePath = join(root, STATE_FILE)
  const current = existsSync(statePath) ? readFileSync(statePath, "utf8") : null
  let prev: Obj = {}
  let next: Obj | null = null
  try {
    prev = current ? JSON.parse(current) : {}
    // Judge the write against the last state the hooks recorded, not the file on disk, so an
    // approval slipped in by a shell command or script is still checked on the next real write.
    const recorded = readSnapshot(root)?.state
    if (recorded && typeof recorded === "object") prev = recorded as Obj
    const content = nextContent(event.tool_name, event.tool_input ?? {}, current)
    next = content === null ? null : JSON.parse(content)
  } catch {
    next = null // Unparseable: validate-state reports it after the write.
  }

  if (!next) {
    respond()
  } else {
    const log = readAudit(root)
    // Agent hand-backs logged as prompts by older versions of the prompt hook carry no user authority.
    const prompts = log.map((e, i) => [e, i] as const).filter(([e]) => e.event === "user_prompt" && !isAgentMessage(String(e.text ?? "")))
    const lastIndex = (pred: (e: AuditEntry) => boolean) => {
      for (let i = log.length - 1; i >= 0; i--) if (pred(log[i])) return i
      return -1
    }
    /** Does every required part of `text` appear in a user prompt recorded after log index `after`? */
    const fromUser = (text: unknown, after: number) =>
      typeof text === "string" && text.trim() !== "" &&
      userWords(text).every((w) => prompts.some(([p, i]) => i > after && norm(String(p.text ?? "")).includes(norm(w))))

    const problems: string[] = []
    const checking = prompts.length > 0

    // 1a. Stage approvals (new passes and re-approvals).
    const approved = new Set<string>()
    for (const stage of STAGES) {
      const a = prev.stages?.[stage] ?? {}
      const b = next.stages?.[stage] ?? {}
      if (!isPassed(b.status)) continue
      const newlyPassed = !isPassed(a.status)
      const reapproved = !newlyPassed && (a.approval?.text !== b.approval?.text || a.approval?.at !== b.approval?.at)
      if (!newlyPassed && !reapproved) continue
      approved.add(stage)
      if (!checking) continue
      const after = newlyPassed
        ? lastIndex((e) => e.event === "stage_status_changed" && e.stage === stage && e.to === "in-progress")
        : lastIndex((e) => e.event === "stage_fingerprinted" && e.stage === stage)
      if (!fromUser(b.approval?.text, after)) {
        problems.push(
          `stages.${stage}.approval.text isn't the user's words: it must match (or quote, in double quotes) something the user typed after the ${stage} gate came up. Show the gate and ask the user to approve or request changes.`,
        )
        continue
      }
      // The words must also postdate the last change to the stage's documents, or the user approved
      // something they haven't seen in its final form ("make these edits, then approved").
      const docs = new Set(stageDocs(next, stage).map((d) => d.toLowerCase()))
      const lastEdit = lastIndex((e) => e.event === "artifact_written" && docs.has(String(e.file ?? "").toLowerCase()))
      if (lastEdit > after && !fromUser(b.approval?.text, lastEdit)) {
        const conditional = b.approval?.conditional === true && typeof b.approval?.changes === "string" && b.approval.changes.trim() !== ""
        if (next.riskTier === "high")
          problems.push(
            `stages.${stage}: the user's approval came before the last change to ${[...docs].join(", ")}. At the high tier, show the user the final documents (or the diff) and ask them to approve again.`,
          )
        else if (!conditional)
          problems.push(
            `stages.${stage}: the user's approval came before the last change to ${[...docs].join(", ")}. Either ask them to approve the final version, or, if the changes were only the edits they asked for, record a conditional approval: approval.conditional = true and approval.changes = what changed after their words. Tell them what changed in your reply.`,
          )
      }
    }

    // 1b. A change plan needs the user's approval, given after the plan was proposed. The plan is
    // recorded first without `approval` (logged as change_proposed), shown to the user, and only
    // then approved, so words typed before the plan existed can't count as approving it.
    if (checking && next.change?.id) {
      const isNew = next.change.id !== prev.change?.id
      const text = next.change.approval?.text
      const changed = isNew || text !== prev.change?.approval?.text
      if (text && changed) {
        // A change recorded before the proposal step existed has only a change_approved event.
        // Re-approving it (an existing change, new words) needs words from after that event.
        const legacy = isNew ? -1 : lastIndex((e) => e.event === "change_approved" && e.id === next.change.id)
        // Before the initial-state fix, a change created with the state file was logged only as
        // state_initialized: if it's the same unapproved change, that's when it was proposed.
        const atInit = !isNew && !prev.change?.approval?.text ? lastIndex((e) => e.event === "state_initialized") : -1
        const proposed = Math.max(lastIndex((e) => e.event === "change_proposed" && e.id === next.change.id), legacy, atInit)
        if (proposed < 0)
          problems.push(
            `change ${next.change.id}: record the change as proposed first (write \`change\` without \`approval\`), show the user the stage plan, and add their approval only after they reply.`,
          )
        else if (!fromUser(text, proposed))
          problems.push(
            `change.approval.text for ${next.change.id} isn't the user's words from after the plan was proposed: show the stage plan and record their approval verbatim in change.approval { text, at }.`,
          )
      }
    }
    // No stage passes under a change plan the user hasn't approved.
    if (checking && next.change?.id && !next.change.approval?.text)
      for (const stage of STAGES)
        if (isPassed(next.stages?.[stage]?.status) && !isPassed(prev.stages?.[stage]?.status))
          problems.push(`stages.${stage} can't pass: change ${next.change.id} is only proposed. Get the user's approval of the stage plan first.`)

    // 1b2. Lightening the plan of the active change (run → light → skip) for a stage that hasn't
    // passed removes protection, so it needs the user's words in change.plan.<stage>.decision.
    // Escalating adds protection and needs none.
    if (checking && next.change?.id && next.change.id === prev.change?.id) {
      const weight: Record<string, number> = { skip: 0, light: 1, run: 2 }
      const after = lastIndex((e) => e.event === "change_approved" && e.id === next.change.id)
      for (const stage of STAGES) {
        const was = prev.change?.plan?.[stage], now = next.change?.plan?.[stage]
        if (!was || !now || isPassed(next.stages?.[stage]?.status)) continue
        if ((weight[now.action] ?? 2) >= (weight[was.action] ?? 2)) continue
        if (now.decision === was.decision && now.action === was.action) continue
        if (!fromUser(now.decision, after))
          problems.push(
            `change.plan.${stage}: lightening ${stage} from ${was.action} to ${now.action} removes protection, so change.plan.${stage}.decision must quote (in double quotes) the user agreeing to it. Show them the reason and ask first.`,
          )
      }
    }

    // 1c. Findings the user accepted or rejected.
    if (checking) {
      const before = new Map<string, Obj>((Array.isArray(prev.findings) ? prev.findings : []).map((f: Obj) => [f.id, f]))
      for (const f of Array.isArray(next.findings) ? next.findings : []) {
        if (f?.status !== "accepted" && f?.status !== "rejected") continue
        const old = before.get(f.id)
        if (old && old.status === f.status && old.decision === f.decision) continue
        const after = lastIndex((e) => e.event === "finding_recorded" && e.id === f.id)
        if (!fromUser(f.decision, after))
          problems.push(`findings ${f.id}.decision isn't the user's words: quote what the user said (in double quotes) when they ${f.status} it.`)
      }
    }

    // 1d. Risks the user accepted.
    if (checking) {
      const before = new Map<string, Obj>((Array.isArray(prev.risks) ? prev.risks : []).map((r: Obj) => [r.id, r]))
      for (const r of Array.isArray(next.risks) ? next.risks : []) {
        if (r?.treatment !== "accept") continue
        const old = before.get(r.id)
        if (old && old.treatment === "accept" && old.decision === r.decision) continue
        const after = lastIndex((e) => e.event === "risk_added" && e.id === r.id)
        if (!fromUser(r.decision, after)) problems.push(`risks ${r.id}.decision isn't the user's words: quote what the user said (in double quotes) when they accepted it.`)
      }
    }

    // 1e. Waivers granted or widened (more stages, a later expiry, another criterion) accept a
    // risk, so they need the user's words too. Narrowing or removing one doesn't.
    if (checking) {
      const key = (w: Obj) => String(w?.id ?? `${w?.stage}:${w?.criterion}`)
      const covers = (w: Obj) => new Set<string>([w?.stage, ...(Array.isArray(w?.stages) ? w.stages : [])])
      const before = new Map<string, Obj>((Array.isArray(prev.waivers) ? prev.waivers : []).map((w: Obj) => [key(w), w]))
      for (const w of Array.isArray(next.waivers) ? next.waivers : []) {
        const old = before.get(key(w))
        const widened = !old ||
          [...covers(w)].some((s) => !covers(old).has(s)) ||
          String(w.expires ?? "") > String(old.expires ?? "") ||
          w.criterion !== old.criterion
        if (!widened) continue
        const after = old ? lastIndex((e) => (e.event === "waiver_granted" || e.event === "waiver_changed") && e.id === w.id) : -1
        if (!fromUser(w.decision, after))
          problems.push(
            `waivers ${key(w)}: ${old ? "widening a waiver" : "a new waiver"} accepts a risk, so \`decision\` must quote (in double quotes) what the user said when they agreed to it${old ? " after it was first granted" : ""}. Ask the user first.`,
          )
      }
    }

    // 1f. Promotions between environments: approved only by the user replying with the single word
    // "Approve", in a prompt after the promotion was requested (so they saw what's being promoted).
    if (checking) {
      const before = new Map<string, Obj>((Array.isArray(prev.environments?.promotions) ? prev.environments.promotions : []).map((p: Obj) => [p.id, p]))
      for (const p of Array.isArray(next.environments?.promotions) ? next.environments.promotions : []) {
        if (p?.status !== "approved" || before.get(p.id)?.status === "approved") continue
        const requested = lastIndex((e) => e.event === "promotion_requested" && e.id === p.id)
        const replied = requested >= 0 && prompts.some(([e, i]) => i > requested && isApproveWord(String(e.text ?? "")))
        if (requested < 0)
          problems.push(`promotion ${p.id}: record it as requested first (status "requested", with what's promoted), show the user, and ask them to reply "Approve".`)
        else if (!replied)
          problems.push(`promotion ${p.id} to ${p.to}: approval needs the user's one-word reply "Approve" after the promotion was requested. Ask them; anything else (even "approved, go ahead") doesn't count.`)
      }
    }

    // 1g. Environments sharing an AWS account: allowed only with the user's own words, given after the
    // environments were defined. The orchestrator must tell them it's not recommended.
    if (checking && sharedAccounts(next.environments).length > 0) {
      const text = next.environments?.sharedAccountsApproval?.text
      if (text && text !== prev.environments?.sharedAccountsApproval?.text) {
        const after = lastIndex((e) => e.event === "environments_set")
        if (!fromUser(text, after))
          problems.push(
            "environments.sharedAccountsApproval isn't the user's words: tell them sharing an account between environments is not recommended, name the environments and account, and quote their approval.",
          )
      }
    }

    // 1h. History is a log: new entries go at the end, and recorded ones never change.
    const ph: unknown[] = Array.isArray(prev.history) ? prev.history : []
    const nh: unknown[] = Array.isArray(next.history) ? next.history : []
    const firstDiff = ph.findIndex((h, i) => JSON.stringify(h) !== JSON.stringify(nh[i]))
    if (firstDiff >= 0)
      problems.push(
        `history[${firstDiff}] was changed, removed or pushed down by an insertion. History is append-only: add new entries (corrections too) at the end of the array, and leave recorded entries as they are.`,
      )

    // 2. Approved or reviewed documents that changed afterwards.
    const changed = drift(root, readSnapshot(root))
    const newlyPassed = [...approved].filter((s) => !isPassed(prev.stages?.[s]?.status))
    for (const stage of newlyPassed) {
      const stale = changed.filter((d) => d.kind === "gate" && d.stage !== stage && !approved.has(d.stage))
      for (const d of stale)
        problems.push(
          `${d.file} changed after the ${d.stage} gate was approved (${d.since}). Show the user what changed and record their re-approval in stages.${d.stage}.approval before passing ${stage}.`,
        )
      if (next.riskTier === "high")
        for (const d of changed.filter((d) => d.kind === "review" && d.stage === stage))
          problems.push(`${d.file} changed after the reviewer's READY verdict for ${stage} (${d.since}). Re-run the reviewer before passing ${stage} at the high tier.`)
    }

    if (problems.length === 0) {
      respond()
    } else {
      appendAudit(root, "approval_rejected", "orchestrator", { problems })
      respond({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `TomDLC approval guard:\n- ${problems.join("\n- ")}`,
        },
      })
    }
  }
}
