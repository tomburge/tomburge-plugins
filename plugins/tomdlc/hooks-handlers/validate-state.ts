#!/usr/bin/env bun
// PostToolUse hook for Write/Edit/MultiEdit. After docs/sdlc/state.json or
// docs/sdlc/.dispatch.json is written, checks it against the schema in the
// orchestrator skill and reports problems back to Claude.
import { validateEnvironments } from "./lib/environments.ts"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DISPATCH_FILE, STAGES, STATE_FILE, filePathOf, projectPath, projectRoot, readEvent, respond, samePath } from "./lib/hook.ts"

const STATUSES = ["not-started", "in-progress", "passed", "passed-with-waivers", "skipped"]
const TIERS = ["low", "moderate", "high"]
const SCALES = ["small", "medium", "large"]
const CLOUDS = ["aws"]
const IAC = ["terraform", "cdk-ts", "cdk-python"]
const SHAPES = ["new-project", "feature", "bugfix", "security-patch", "refactor", "infra-change", "incident-fix", "docs-only"]
const ACTIONS = ["run", "light", "skip"]
const SLICE_STATUSES = ["pending", "in-progress", "done", "dropped"]
const SEVERITIES = ["critical", "high", "medium", "low"]
const FINDING_STATUSES = ["open", "fixed", "waived", "accepted", "rejected"]
const RISK_TYPES = ["risk", "assumption", "issue", "dependency"]
const LEVELS = ["low", "medium", "high"]
const TREATMENTS = ["mitigate", "transfer", "accept", "avoid"]
const OUTCOMES = ["succeeded", "rolled-back", "failed"]

// What each stage needs from earlier stages: if the producer is skipped in this change,
// at least one of these documents must already exist from an earlier change.
const NEEDS: Record<string, { producer: string; docs: string[] }> = {
  requirements: { producer: "plan", docs: ["01-plan.md", "00-codebase.md"] },
  design: { producer: "requirements", docs: ["02-requirements.md", "00-codebase.md"] },
  develop: { producer: "design", docs: ["03-design.md", "00-codebase.md"] },
  test: { producer: "requirements", docs: ["02-requirements.md", "00-codebase.md"] },
  deploy: { producer: "test", docs: ["05-test-report.md"] },
  maintain: { producer: "deploy", docs: ["06-release.md", "07-operations.md"] },
}
const DATE = /^\d{4}-\d{2}-\d{2}/

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v)
const isStr = (v: unknown) => typeof v === "string" && v.trim().length > 0
const stageName = (v: unknown) => STAGES.includes(v as any)

function validateState(s: any, root: string): string[] {
  const errors: string[] = []
  if (!isObj(s)) return ["the top level must be an object"]
  if (!isStr(s.project)) errors.push("`project` must be a non-empty string")
  if (s.riskTier != null && !TIERS.includes(s.riskTier)) errors.push(`\`riskTier\` must be one of ${TIERS.join(", ")} (or absent until Plan sets it)`)
  if (s.scale != null && !SCALES.includes(s.scale)) errors.push(`\`scale\` must be one of ${SCALES.join(", ")} (or absent until Plan sets it)`)
  if (!stageName(s.currentStage)) errors.push(`\`currentStage\` must be one of ${STAGES.join(", ")}`)
  if (s.platform != null) {
    if (!isObj(s.platform)) errors.push("`platform` must be an object: { cloud, iac }")
    else {
      if (!CLOUDS.includes(s.platform.cloud)) errors.push(`\`platform.cloud\` must be one of ${CLOUDS.join(", ")}`)
      if (s.platform.iac != null && !IAC.includes(s.platform.iac)) errors.push(`\`platform.iac\` must be one of ${IAC.join(", ")} (or absent until Design chooses it)`)
    }
  }
  if (s.codebase != null && !["new", "existing"].includes(s.codebase)) errors.push("`codebase` must be `new` or `existing`")
  if (s.ui != null && typeof s.ui !== "boolean") errors.push("`ui` must be true or false")
  errors.push(...validateChange(s.change))

  if (!isObj(s.stages)) {
    errors.push("`stages` must be an object with all seven stages")
  } else {
    for (const stage of STAGES) {
      const st = s.stages[stage]
      if (!isObj(st)) {
        errors.push(`\`stages.${stage}\` is missing`)
        continue
      }
      if (!STATUSES.includes(st.status)) errors.push(`\`stages.${stage}.status\` must be one of ${STATUSES.join(", ")}`)
      if (String(st.status).startsWith("passed") && !DATE.test(String(st.passedAt ?? "")))
        errors.push(`\`stages.${stage}\` is ${st.status} but has no ISO \`passedAt\` date`)
      if (String(st.status).startsWith("passed") && (!isObj(st.approval) || !isStr(st.approval.text) || !DATE.test(String(st.approval.at ?? ""))))
        errors.push(`\`stages.${stage}\` is ${st.status} but has no \`approval\` with the user's words (\`text\`) and a date (\`at\`)`)
      if (isObj(st.approval) && st.approval.conditional != null && (st.approval.conditional !== true || !isStr(st.approval.changes)))
        errors.push(`\`stages.${stage}.approval\`: \`conditional\` must be true and come with \`changes\` (what changed after the user's words)`)
      if (st.deployment != null) {
        const dep = st.deployment
        if (stage !== "deploy") errors.push(`\`stages.${stage}.deployment\` is only allowed on deploy`)
        else if (!isObj(dep) || !DATE.test(String(dep.at ?? "")) || !isStr(dep.version) || !isStr(dep.environment) || !OUTCOMES.includes(dep.outcome))
          errors.push(`\`stages.deploy.deployment\` needs \`at\` (ISO date), \`version\`, \`environment\` and \`outcome\` (${OUTCOMES.join(", ")})`)
      }
      if (st.outputs != null && !(Array.isArray(st.outputs) && st.outputs.every((p: unknown) => isStr(p) && !String(p).startsWith("/") && !/^[A-Za-z]:/.test(String(p)))))
        errors.push(`\`stages.${stage}.outputs\` must be an array of paths relative to the project root`)
      if (st.revisions != null && (!Number.isInteger(st.revisions) || st.revisions < 0))
        errors.push(`\`stages.${stage}.revisions\` must be a non-negative integer`)
      if (st.status === "skipped" && s.change?.plan?.[stage]?.action !== "skip")
        errors.push(`\`stages.${stage}\` is skipped, but the change plan doesn't say \`skip\` for it`)
      if (st.slices != null) {
        if (stage !== "develop") errors.push(`\`stages.${stage}.slices\` is only allowed on develop`)
        else if (!Array.isArray(st.slices)) errors.push("`stages.develop.slices` must be an array")
        else
          st.slices.forEach((sl: any, i: number) => {
            if (!isObj(sl) || !/^S-\d+$/.test(String(sl.id ?? "")) || !SLICE_STATUSES.includes(sl.status))
              errors.push(`\`stages.develop.slices[${i}]\` needs \`id\` (S-n) and \`status\` (${SLICE_STATUSES.join(", ")})`)
            else if (sl.lessons != null && !(Array.isArray(sl.lessons) && sl.lessons.every((x: unknown) => typeof x === "string")))
              errors.push(`\`stages.develop.slices[${i}].lessons\` must be an array of strings`)
          })
      }
    }
    if (s.stages[s.currentStage]?.status === "skipped") errors.push(`\`currentStage\` is ${s.currentStage}, which this change skips`)
    for (const key of Object.keys(s.stages)) if (!stageName(key)) errors.push(`\`stages.${key}\` is not a TomDLC stage`)
  }

  if (!Array.isArray(s.waivers)) {
    errors.push("`waivers` must be an array")
  } else {
    s.waivers.forEach((w: any, i: number) => {
      if (!isObj(w)) return errors.push(`\`waivers[${i}]\` must be an object`)
      if (!stageName(w.stage)) errors.push(`\`waivers[${i}].stage\` must be a stage name`)
      if (w.stages != null && !(Array.isArray(w.stages) && w.stages.every(stageName)))
        errors.push(`\`waivers[${i}].stages\` must be an array of stage names (extra stages the waiver also covers)`)
      for (const f of ["criterion", "reason", "owner"]) if (!isStr(w[f])) errors.push(`\`waivers[${i}].${f}\` is required`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(w.expires ?? ""))) errors.push(`\`waivers[${i}].expires\` must be YYYY-MM-DD`)
      if (w.id != null && !/^W-\d+$/.test(String(w.id))) errors.push(`\`waivers[${i}].id\` must look like W-n`)
    })
    const ids = s.waivers.map((w: any) => w?.id).filter((id: unknown) => id != null)
    for (const id of new Set(ids)) if (ids.filter((x: unknown) => x === id).length > 1) errors.push(`waiver ID ${id} is used more than once`)
    if (isObj(s.stages))
      for (const stage of STAGES)
        if (s.stages[stage]?.status === "passed-with-waivers" && !s.waivers.some((w: any) => w?.stage === stage || (Array.isArray(w?.stages) && w.stages.includes(stage))))
          errors.push(`\`stages.${stage}\` is passed-with-waivers but no waiver names that stage`)
  }

  errors.push(...validateBaseline(s.baseline))
  errors.push(...validateFindings(s.findings, Array.isArray(s.waivers) ? s.waivers : []))
  errors.push(...validateEnvironments(s.environments, s.stages))
  errors.push(...validateResume(s.resume))
  errors.push(...validateRisks(s.risks))
  errors.push(...validateSpikes(s.spikes))
  errors.push(...validatePlanDependencies(s, root))

  if (s.completedChanges != null && !Array.isArray(s.completedChanges)) {
    errors.push("`completedChanges` must be an array")
  } else {
    ;(s.completedChanges ?? []).forEach((c: any, i: number) => {
      if (!isObj(c) || !/^CH-\d+$/.test(String(c.id ?? "")) || !isStr(c.title) || !SHAPES.includes(c.shape) ||
          !["completed", "abandoned"].includes(c.outcome) || !DATE.test(String(c.completedAt ?? "")) || !isObj(c.stages))
        errors.push(`\`completedChanges[${i}]\` needs \`id\` (CH-n), \`title\`, \`shape\`, \`outcome\` (completed or abandoned), \`completedAt\` and \`stages\``)
    })
  }

  if (s.history != null && !Array.isArray(s.history)) {
    errors.push("`history` must be an array")
  } else {
    ;(s.history ?? []).forEach((h: any, i: number) => {
      if (!isObj(h) || !DATE.test(String(h.date ?? "")) || !(stageName(h.stage) || h.stage === "orient") || !isStr(h.agent) || !isStr(h.outcome))
        errors.push(`\`history[${i}]\` needs \`date\` (ISO), \`stage\` (a stage or \`orient\`), \`agent\` and \`outcome\``)
    })
  }
  return errors
}

function validateSpikes(sp: any): string[] {
  if (sp == null) return []
  if (!Array.isArray(sp)) return ["`spikes` must be an array"]
  const errors: string[] = []
  sp.forEach((x: any, i: number) => {
    if (!isObj(x)) return errors.push(`\`spikes[${i}]\` must be an object`)
    if (!/^SP-\d+$/.test(String(x.id ?? ""))) errors.push(`\`spikes[${i}].id\` must look like SP-n`)
    if (!isStr(x.question)) errors.push(`\`spikes[${i}].question\` is required`)
    if (!["planned", "running", "done", "waived"].includes(x.status)) errors.push(`\`spikes[${i}].status\` must be planned, running, done or waived`)
    if (x.status === "done") {
      if (!["pass", "fail", "inconclusive"].includes(x.outcome)) errors.push(`\`spikes[${i}]\` is done and needs \`outcome\` (pass, fail or inconclusive)`)
      if (!isStr(x.decision)) errors.push(`\`spikes[${i}]\` is done and needs the user's \`decision\``)
    }
  })
  return errors
}

function validateRisks(r: any): string[] {
  if (r == null) return []
  if (!Array.isArray(r)) return ["`risks` must be an array"]
  const errors: string[] = []
  const seen = new Set<string>()
  r.forEach((x: any, i: number) => {
    if (!isObj(x)) return errors.push(`\`risks[${i}]\` must be an object`)
    if (!/^R-\d+$/.test(String(x.id ?? ""))) errors.push(`\`risks[${i}].id\` must look like R-n`)
    else if (seen.has(x.id)) errors.push(`risk ID ${x.id} is used more than once`)
    else seen.add(x.id)
    if (!RISK_TYPES.includes(x.type)) errors.push(`\`risks[${i}].type\` must be one of ${RISK_TYPES.join(", ")}`)
    if (!isStr(x.description) || !isStr(x.owner)) errors.push(`\`risks[${i}]\` needs \`description\` and \`owner\``)
    if (!["open", "closed"].includes(x.status)) errors.push(`\`risks[${i}].status\` must be open or closed`)
    if (x.type === "risk") {
      if (!LEVELS.includes(x.likelihood) || !LEVELS.includes(x.impact)) errors.push(`\`risks[${i}]\` needs \`likelihood\` and \`impact\` (${LEVELS.join(", ")})`)
      if (!TREATMENTS.includes(x.treatment)) errors.push(`\`risks[${i}].treatment\` must be one of ${TREATMENTS.join(", ")}`)
      if (x.treatment === "accept" && !isStr(x.decision)) errors.push(`\`risks[${i}]\` is accepted and needs the user's \`decision\` recorded`)
    }
    if (x.review != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(x.review))) errors.push(`\`risks[${i}].review\` must be YYYY-MM-DD`)
  })
  return errors
}

function validatePlanDependencies(s: any, root: string): string[] {
  const plan = s?.change?.plan
  if (!isObj(plan) || s.change.shape === "docs-only") return []
  const errors: string[] = []
  const runs = (stage: string) => ["run", "light"].includes(plan[stage]?.action)
  const exists = (doc: string) => existsSync(join(root, "docs", "sdlc", doc))
  for (const [stage, need] of Object.entries(NEEDS)) {
    if (runs(stage) && plan[need.producer]?.action === "skip" && !need.docs.some(exists))
      errors.push(`the change plan runs ${stage} but skips ${need.producer}, and none of ${need.docs.map((x) => "docs/sdlc/" + x).join(" or ")} exists yet; run ${need.producer} (at least light) or adjust the plan`)
  }
  if (s.riskTier === "high" && runs("develop") && plan.design?.action === "skip")
    errors.push("at the high tier, a change that runs develop must not skip design: run it at least light so the threat model is checked")
  return errors
}

function validateChange(c: any): string[] {
  if (c == null) return []
  if (!isObj(c)) return ["`change` must be an object"]
  const errors: string[] = []
  if (!/^CH-\d+$/.test(String(c.id ?? ""))) errors.push("`change.id` must look like CH-n")
  if (!isStr(c.title)) errors.push("`change.title` is required")
  if (!SHAPES.includes(c.shape)) errors.push(`\`change.shape\` must be one of ${SHAPES.join(", ")}`)
  if (c.scale != null && !SCALES.includes(c.scale)) errors.push(`\`change.scale\` must be one of ${SCALES.join(", ")}`)
  if (c.approvedAt != null && !DATE.test(String(c.approvedAt))) errors.push("`change.approvedAt` must be an ISO date")
  if (c.approval != null && (!isObj(c.approval) || !isStr(c.approval.text) || !DATE.test(String(c.approval.at ?? ""))))
    errors.push("`change.approval` needs the user's words (`text`) and a date (`at`)")
  if (!isObj(c.plan)) return [...errors, "`change.plan` must have an entry for every stage"]
  for (const stage of STAGES) {
    const p = c.plan[stage]
    if (!isObj(p) || !ACTIONS.includes(p.action)) errors.push(`\`change.plan.${stage}.action\` must be one of ${ACTIONS.join(", ")}`)
    else if (p.action !== "run" && !isStr(p.reason)) errors.push(`\`change.plan.${stage}\` is ${p.action} and needs a \`reason\``)
  }
  return errors
}

function validateBaseline(b: any): string[] {
  if (b == null) return []
  const errors: string[] = []
  if (!isObj(b)) return ["`baseline` must be an object"]
  if (!isStr(b.command)) errors.push("`baseline.command` is required")
  if (!DATE.test(String(b.recordedAt ?? ""))) errors.push("`baseline.recordedAt` must be an ISO date")
  for (const f of ["passed", "failed", "skipped"]) if (!Number.isInteger(b[f]) || b[f] < 0) errors.push(`\`baseline.${f}\` must be a non-negative integer`)
  if (!Array.isArray(b.failing)) errors.push("`baseline.failing` must be an array of test names")
  else if (Number.isInteger(b.failed) && b.failing.length > b.failed) errors.push("`baseline.failing` lists more tests than `baseline.failed`")
  if (b.coverage != null && (typeof b.coverage !== "number" || b.coverage < 0 || b.coverage > 100)) errors.push("`baseline.coverage` must be a percentage")
  return errors
}

function validateFindings(f: any, waivers: any[]): string[] {
  if (f == null) return []
  if (!Array.isArray(f)) return ["`findings` must be an array"]
  const errors: string[] = []
  const seen = new Set<string>()
  f.forEach((x: any, i: number) => {
    if (!isObj(x)) return errors.push(`\`findings[${i}]\` must be an object`)
    if (!/^F-\d+$/.test(String(x.id ?? ""))) errors.push(`\`findings[${i}].id\` must look like F-n`)
    else if (seen.has(x.id)) errors.push(`finding ID ${x.id} is used more than once`)
    else seen.add(x.id)
    if (!stageName(x.stage)) errors.push(`\`findings[${i}].stage\` must be a stage name`)
    if (!SEVERITIES.includes(x.severity)) errors.push(`\`findings[${i}].severity\` must be one of ${SEVERITIES.join(", ")}`)
    if (!FINDING_STATUSES.includes(x.status)) errors.push(`\`findings[${i}].status\` must be one of ${FINDING_STATUSES.join(", ")}`)
    if (!isStr(x.summary) || !isStr(x.source)) errors.push(`\`findings[${i}]\` needs \`summary\` and \`source\``)
    if (x.preexisting != null && typeof x.preexisting !== "boolean") errors.push(`\`findings[${i}].preexisting\` must be true or false`)
    if (x.slice != null && !/^S-\d+$/.test(String(x.slice))) errors.push(`\`findings[${i}].slice\` must look like S-n`)
    if ((x.status === "accepted" || x.status === "rejected") && !isStr(x.decision))
      errors.push(`\`findings[${i}]\` is ${x.status} and needs the user's \`decision\` recorded`)
    if (x.status === "waived" && !waivers.some((w: any) => w?.id != null && w.id === x.waiver))
      errors.push(`\`findings[${i}]\` is waived but \`waiver\` doesn't name an existing waiver ID`)
  })
  return errors
}

function validateResume(r: any): string[] {
  if (r == null) return []
  if (!isObj(r)) return ["`resume` must be an object"]
  const errors: string[] = []
  if (r.nextAction != null && typeof r.nextAction !== "string") errors.push("`resume.nextAction` must be a string")
  if (r.openQuestions != null && !(Array.isArray(r.openQuestions) && r.openQuestions.every((q: unknown) => typeof q === "string")))
    errors.push("`resume.openQuestions` must be an array of strings")
  if (r.loops != null) {
    if (!isObj(r.loops)) errors.push("`resume.loops` must map a stage or stage/slice to a count")
    else
      for (const [k, v] of Object.entries(r.loops)) {
        if (!/^[a-z]+(\/S-\d+)?$/.test(k) || !stageName(k.split("/")[0])) errors.push(`\`resume.loops\` key ${k} must be a stage or stage/S-n`)
        if (!Number.isInteger(v) || (v as number) < 0) errors.push(`\`resume.loops.${k}\` must be a non-negative integer`)
      }
  }
  return errors
}

function validateDispatch(d: any): string[] {
  if (!isObj(d) || !isObj(d.agents)) return ["the file must be { \"agents\": { \"<agent>\": { \"stage\", \"owns\": [globs], \"dispatchedAt\" } } }"]
  const errors: string[] = []
  for (const [agent, entry] of Object.entries<any>(d.agents)) {
    if (!/^[a-z][a-z-]*(#[A-Za-z0-9._-]+)?$/.test(agent))
      errors.push(`\`agents.${agent}\`: keys are an agent name, or <name>#<suffix> for parallel instances (e.g. developer#S-2)`)
    if (!isObj(entry)) {
      errors.push(`\`agents.${agent}\` must be an object`)
      continue
    }
    if (!stageName(entry.stage)) errors.push(`\`agents.${agent}.stage\` must be a stage name`)
    if (!Array.isArray(entry.owns) || entry.owns.length === 0 || !entry.owns.every(isStr))
      errors.push(`\`agents.${agent}.owns\` must be a non-empty array of glob patterns relative to the project root`)
    else if (entry.owns.some((g: string) => g.startsWith("/") || /^[A-Za-z]:/.test(g) || g.includes("\\")))
      errors.push(`\`agents.${agent}.owns\` patterns must be relative with forward slashes`)
  }
  return errors
}

const event = await readEvent()
const file = filePathOf(event.tool_input)
const root = projectRoot(event.cwd ?? process.cwd())
const rel = file ? projectPath(event.cwd ?? process.cwd(), file) : null
const target = rel && samePath(rel, STATE_FILE) ? STATE_FILE : rel && samePath(rel, DISPATCH_FILE) ? DISPATCH_FILE : null

if (!target) {
  respond()
} else {
  let errors: string[]
  try {
    const data = JSON.parse(readFileSync(join(root, target), "utf8"))
    errors = target === STATE_FILE ? validateState(data, root) : validateDispatch(data)
  } catch (err) {
    errors = [`it is not valid JSON (${err instanceof Error ? err.message : err})`]
  }
  if (errors.length === 0) {
    respond()
  } else {
    respond({
      decision: "block",
      reason: `${target} is invalid:\n${errors.map((e) => `- ${e}`).join("\n")}\nFix the file to match the schema in the TomDLC orchestrator skill.`,
    })
  }
}
