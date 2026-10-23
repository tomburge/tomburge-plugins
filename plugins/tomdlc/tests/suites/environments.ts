// Deployment environments: the chosen set, an account and profile per environment,
// separate accounts unless the user approves sharing, and promotions approved with
// the single word "Approve". The production guard blocks deploys to stage or prod
// until their promotion is approved.
import { join } from "node:path"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
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
const dec = (o: any) => o.hookSpecificOutput?.permissionDecision ?? o.decision ?? "allow"

const DIR = join(SP, "proj-env"); mkdirSync(join(DIR, ".tomdlc"), { recursive: true })
const P = DIR.replaceAll("\\", "/"), STATE = join(DIR, ".tomdlc/state.json"), AUDIT = join(DIR, ".tomdlc/audit.jsonl")
const events = () => readFileSync(AUDIT, "utf8").trim().split("\n").map((l) => JSON.parse(l))
const prompt = (text: string) => run("audit-prompt.ts", { hook_event_name: "UserPromptSubmit", cwd: P, prompt: text })
let lastReason = ""
/** Guard, then (if allowed) write, validate and audit, like Claude Code would. */
async function writeState(s: unknown): Promise<string> {
  const content = JSON.stringify(s, null, 2)
  const g = await run("approval-guard.ts", { hook_event_name: "PreToolUse", cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/.tomdlc/state.json`, content } })
  lastReason = g.hookSpecificOutput?.permissionDecisionReason ?? ""
  if (dec(g) !== "allow") return "deny"
  writeFileSync(STATE, content)
  await run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/.tomdlc/state.json` } })
  return "allow"
}
const validate = async (s: unknown) => {
  writeFileSync(STATE, JSON.stringify(s, null, 2))
  const v = await run("validate-state.ts", { cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/.tomdlc/state.json` } })
  return { d: dec(v), reason: String(v.reason ?? "") }
}

const STAGES = ["plan", "requirements", "design", "develop", "test", "deploy", "maintain"]
const plan = Object.fromEntries(STAGES.map((s) => [s, { action: "run" }]))
const stages = (passedUpTo: string) =>
  Object.fromEntries(STAGES.map((s, i) => [s, i <= STAGES.indexOf(passedUpTo) ? { status: "passed", passedAt: "2026-10-14", approval: { at: "2026-10-14", text: "ok" } } : { status: "not-started" }]))
const env = (extra: object = {}) => ({
  set: "dev-stage-prod",
  dev: { account: "111111111111", profile: "acme-dev", region: "us-east-1" },
  stage: { account: "222222222222", profile: "acme-stage", region: "us-east-1" },
  prod: { account: "333333333333", profile: "acme-prod", region: "us-east-1" },
  devDeploys: ["abc123", "aaa", "bbb"].map((build) => ({ build, account: "111111111111", at: "2026-10-14", smoke: "passed" })),
  ...extra,
})
const base: any = { project: "demo", riskTier: "low", currentStage: "deploy", platform: { cloud: "aws", iac: "cdk-ts" },
  change: { id: "CH-1", title: "Initial build", shape: "new-project", plan, approval: { at: "2026-10-14", text: "Go." } },
  stages: stages("develop"), waivers: [], history: [] }

// ---- schema (validator)
expect("valid three-environment set", (await validate({ ...base, environments: env() })).d, "allow")
expect("dev only set is valid", (await validate({ ...base, environments: { set: "dev", dev: { profile: "acme-dev" } } })).d, "allow")
expect("dev-prod set is valid", (await validate({ ...base, environments: { set: "dev-prod", dev: { profile: "acme-dev" }, prod: { profile: "acme-prod" } } })).d, "allow")
expect("unknown set rejected", (await validate({ ...base, environments: { set: "qa", dev: { profile: "x" } } })).d, "block")
expect("missing environment rejected", (await validate({ ...base, environments: { set: "dev-prod", dev: { profile: "acme-dev" } } })).d, "block")
expect("environment outside the set rejected", (await validate({ ...base, environments: { set: "dev", dev: { profile: "a" }, prod: { profile: "b" } } })).d, "block")
expect("bad account ID rejected", (await validate({ ...base, environments: env({ dev: { account: "1234", profile: "acme-dev" } }) })).d, "block")
expect("bad region rejected", (await validate({ ...base, environments: env({ dev: { profile: "acme-dev", region: "east" } }) })).d, "block")

// ---- separate accounts per environment
const shared = env({ stage: { account: "333333333333", profile: "acme-stage" } })
const sh = await validate({ ...base, environments: shared })
expect("shared account without approval rejected", sh.d, "block")
expect("reason says it's not recommended", sh.reason.includes("strongly recommended") && sh.reason.includes("stage and prod share account 333333333333"), true)
expect("shared account with approval valid", (await validate({ ...base, environments: { ...shared, sharedAccountsApproval: { at: "2026-10-14", text: "ok" } } })).d, "allow")

// ---- promotions (validator rules)
const prom = (ps: object[], extra: object = {}) => ({ ...base, ...extra, environments: env({ promotions: ps }) })
const ok = (id: string, to: string, build = "abc123") => ({ id, to, build, status: "approved", requestedAt: "2026-10-14", approval: { at: "2026-10-14", text: "Approve" } })
const acct: Record<string, string> = { stage: "222222222222", prod: "333333333333" }
const checked = (id: string, to: string, build = "abc123") => ({ ...ok(id, to, build), checks: { accountBeforeDeploy: acct[to], deployedBuild: build, at: "2026-10-14" } })
expect("promotion to dev rejected", (await validate(prom([{ id: "P-1", to: "dev", build: "a", status: "requested" }]))).d, "block")
expect("approved promotion needs the word Approve", (await validate(prom([{ ...ok("P-1", "stage"), approval: { at: "2026-10-14", text: "Looks good" } }]))).d, "block")
expect("stage promotion needs Develop passed", (await validate(prom([ok("P-1", "stage")], { stages: stages("design") }))).d, "block")
expect("prod promotion needs Test passed", (await validate(prom([checked("P-1", "stage"), ok("P-2", "prod")], { stages: stages("develop") }))).d, "block")
expect("prod needs the same build approved for stage", (await validate(prom([checked("P-1", "stage", "aaa"), ok("P-2", "prod", "bbb")], { stages: stages("test") }))).d, "block")
expect("stage then prod with the same build valid", (await validate(prom([checked("P-1", "stage", "aaa"), ok("P-2", "prod", "aaa")], { stages: stages("test") }))).d, "allow")

// ---- the first promotion out of dev needs that build deployed and smoke-tested in dev
const devs = (...ds: object[]) => ({ devDeploys: ds })
const dd = (build: string, smoke = "passed", account = "111111111111") => ({ build, account, at: "2026-10-14", smoke })
const noDev = await validate({ ...base, environments: env({ ...devs(), promotions: [ok("P-1", "stage", "fff")] }) })
expect("stage promotion of a build never deployed to dev rejected", [noDev.d, noDev.reason.includes("deployed to dev and its smoke test passed")], ["block", true])
expect("stage promotion of a build whose dev smoke failed rejected",
  (await validate({ ...base, environments: env({ ...devs(dd("fff", "failed")), promotions: [ok("P-1", "stage", "fff")] }) })).d, "block")
expect("stage promotion of a dev-smoke-tested build valid",
  (await validate({ ...base, environments: env({ ...devs(dd("eee"), dd("fff")), promotions: [ok("P-1", "stage", "fff")] }) })).d, "allow")
expect("a requested promotion doesn't need the dev deploy yet",
  (await validate({ ...base, environments: env({ ...devs(), promotions: [{ id: "P-1", to: "stage", build: "fff", status: "requested", requestedAt: "2026-10-14" }] }) })).d, "allow")
const devProd = (ds: object[]) => ({ ...base, stages: stages("test"),
  environments: { set: "dev-prod", dev: { account: "111111111111", profile: "acme-dev" }, prod: { account: "333333333333", profile: "acme-prod" }, devDeploys: ds, promotions: [ok("P-1", "prod", "fff")] } })
expect("dev-prod: prod promotion needs the dev deploy", (await validate(devProd([]))).d, "block")
expect("dev-prod: prod promotion with the dev deploy valid", (await validate(devProd([dd("fff")]))).d, "allow")
const wrongDev = await validate({ ...base, environments: env({ ...devs(dd("fff", "passed", "222222222222")) }) })
expect("dev deploy recorded in the wrong account rejected", [wrongDev.d, wrongDev.reason.includes("not dev's account 111111111111")], ["block", true])
expect("dev deploy without a smoke result rejected", (await validate({ ...base, environments: env({ ...devs({ build: "fff", at: "2026-10-14" }) }) })).d, "block")

// ---- promotions are verified: the right account before the deploy, the promoted build after it
const tested = { stages: stages("test") }
const t1 = await validate(prom([ok("P-1", "stage")], tested))
expect("Test passed without a verified stage promotion rejected", [t1.d, t1.reason.includes("no stage promotion has `checks`")], ["block", true])
expect("Test passed with a verified stage promotion valid", (await validate(prom([checked("P-1", "stage")], tested))).d, "allow")
const wrongAcct = await validate(prom([{ ...checked("P-1", "stage"), checks: { accountBeforeDeploy: "333333333333", deployedBuild: "abc123", at: "2026-10-14" } }], tested))
expect("deploy session in the wrong account rejected", [wrongAcct.d, wrongAcct.reason.includes("may have gone to the wrong environment")], ["block", true])
expect("wrong build running after the deploy rejected", (await validate(prom([{ ...checked("P-1", "stage"), checks: { accountBeforeDeploy: "222222222222", deployedBuild: "zzz", at: "2026-10-14" } }], tested))).d, "block")
expect("Deploy passed without a verified prod promotion rejected", (await validate(prom([checked("P-1", "stage"), ok("P-2", "prod")], { stages: stages("deploy") }))).d, "block")
expect("Deploy passed with verified stage and prod promotions valid", (await validate(prom([checked("P-1", "stage"), checked("P-2", "prod")], { stages: stages("deploy") }))).d, "allow")

// ---- the guard: "Approve", after the promotion was requested
writeFileSync(STATE, JSON.stringify({ ...base, environments: env() }, null, 2))
await run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/.tomdlc/state.json` } })
await prompt("Set up the environments as discussed.")
let state: any = { ...base, environments: env() }
const withPromotions = (ps: object[]) => ({ ...state, environments: { ...state.environments, promotions: ps } })
const requested = { id: "P-1", to: "stage", build: "abc123", status: "requested", requestedAt: "2026-10-14" }
await prompt("Approve")   // typed before the promotion was requested: doesn't count
expect("approving before the request denied", await writeState(withPromotions([ok("P-1", "stage")])), "deny")
expect("requesting a promotion allowed", await writeState(withPromotions([requested])), "allow")
expect("request audited", events().at(-1)?.event, "promotion_requested")
expect("adding a dev deploy allowed", await writeState({ ...withPromotions([requested]), environments: { ...withPromotions([requested]).environments, devDeploys: [...state.environments.devDeploys, dd("ggg")] } }), "allow")
expect("dev deploy audited", [events().at(-1)?.event, events().at(-1)?.build, events().at(-1)?.smoke], ["dev_deployed", "ggg", "passed"])
state = withPromotions([requested])
await prompt("Approved, go ahead with stage.")
expect("anything but the one word denied", await writeState(withPromotions([ok("P-1", "stage")])), "deny")
expect("reason asks for Approve", lastReason.includes('"Approve"'), true)
await prompt("approve.")
expect("the one word after the request allowed", await writeState(withPromotions([ok("P-1", "stage")])), "allow")
expect("approval audited", events().at(-1)?.event, "promotion_approved")
state = withPromotions([ok("P-1", "stage")])

// ---- the guard: sharing an account needs the user's words
const sharedEnv = { ...state.environments, stage: { account: "333333333333", profile: "acme-stage" } }
writeFileSync(STATE, JSON.stringify({ ...state, environments: sharedEnv }, null, 2))
await run("audit-events.ts", { hook_event_name: "PostToolUse", cwd: P, tool_name: "Write", tool_input: { file_path: `${P}/.tomdlc/state.json` } })
expect("environments_set notes the shared account", events().at(-1)?.sharedAccounts?.[0]?.environments, ["stage", "prod"])
state = { ...state, environments: sharedEnv }
expect("invented shared-account approval denied",
  await writeState({ ...state, environments: { ...sharedEnv, sharedAccountsApproval: { at: "2026-10-14", text: "User agreed." } } }), "deny")
await prompt("I understand it's not recommended; stage and prod may share account 333333333333.")
expect("user's words approve sharing",
  await writeState({ ...state, environments: { ...sharedEnv, sharedAccountsApproval: { at: "2026-10-14", text: 'User: "stage and prod may share account 333333333333"' } } }), "allow")
expect("shared-account approval audited", events().at(-1)?.event, "shared_accounts_approved")
state = { ...state, environments: env({ promotions: [ok("P-1", "stage")] }) }
writeFileSync(STATE, JSON.stringify(state, null, 2))

// ---- the production guard's environment gate
const pg = (command: string, agent = false) =>
  run("prod-guard.ts", { cwd: P, tool_name: "Bash", tool_input: { command }, ...(agent ? { agent_id: "a1", agent_type: "tomdlc:platform-engineer" } : {}) }).then(dec)
expect("deploy to dev asks the user", await pg("npx cdk deploy --app cdk.out Demo-dev --profile acme-dev"), "ask")
expect("deploy to stage after its approved promotion asks", await pg("npx cdk deploy --app cdk.out Demo-stage --profile acme-stage"), "ask")
expect("deploy to prod before its promotion denied", await pg("npx cdk deploy --app cdk.out Demo-prod --profile acme-prod"), "deny")
expect("AWS_PROFILE form also gated", await pg("AWS_PROFILE=acme-prod npx cdk deploy --all"), "deny")
expect("prod var file gated", await pg("terraform -chdir=infra apply -var-file=env/prod.tfvars"), "deny")
expect("read-only commands to prod pass", await pg("npx cdk diff --profile acme-prod"), "allow")
expect("agents still can't deploy at all", await pg("npx cdk deploy --profile acme-dev", true), "deny")
writeFileSync(STATE, JSON.stringify({ ...state, environments: env({ promotions: [ok("P-1", "stage"), ok("P-2", "prod")] }) }, null, 2))
expect("deploy to prod after its approved promotion asks", await pg("npx cdk deploy --app cdk.out Demo-prod --profile acme-prod"), "ask")
writeFileSync(STATE, JSON.stringify({ ...state, environments: { set: "dev", dev: { profile: "acme-dev" } } }, null, 2))
expect("a dev-only project can't deploy to prod", await pg("terraform apply -var-file=env/prod.tfvars"), "deny")
writeFileSync(STATE, JSON.stringify(state, null, 2))   // stage approved, prod not
for (const c of ["npx cdk deploy -c env=prod", "npx cdk deploy --context environment=production", "TF_WORKSPACE=prod terraform apply",
  "terraform workspace select prod && terraform apply tfplan", "npx cdk deploy App_prod", "npx cdk deploy AppProd", "npx cdk deploy app.prod"])
  expect(`prod target detected: ${c}`, await pg(c), "deny")
for (const c of ["npx cdk deploy -c env=stage", "npx cdk deploy AppStage", "npx cdk deploy App-dev", "npx cdk deploy MyStack"])
  expect(`non-prod or unnamed target asks: ${c}`, await pg(c), "ask")
expect("words like reproduce aren't a prod target", await pg("npx cdk deploy ReproduceStack"), "ask")
{
  const D3 = join(SP, "proj-noenv"); mkdirSync(join(D3, ".tomdlc"), { recursive: true })
  writeFileSync(join(D3, ".tomdlc/state.json"), JSON.stringify({ project: "x", currentStage: "develop", platform: { cloud: "aws", iac: "terraform" } }))
  const c3: string = (await run("on-session-start.ts", { cwd: D3.replaceAll("\\", "/"), source: "startup" })).hookSpecificOutput?.additionalContext ?? ""
  expect("session start prompts a cloud project with no environments", c3.includes("No `environments` recorded for this cloud project"), true)
}

// ---- HA/DR: strategy and a second region
const withDr = (dr: object | undefined, prodExtra: object = {}) =>
  ({ ...base, environments: env({ prod: { account: "333333333333", profile: "acme-prod", region: "us-east-1", ...prodExtra }, ...(dr ? { dr } : {}) }) })
expect("backup-restore needs no second region", (await validate(withDr({ strategy: "backup-restore" }))).d, "allow")
expect("unknown DR strategy rejected", (await validate(withDr({ strategy: "hope" }))).d, "block")
const noDrRegion = await validate(withDr({ strategy: "warm-standby" }))
expect("warm standby without a DR region rejected", [noDrRegion.d, noDrRegion.reason.includes("environments.prod.drRegion")], ["block", true])
expect("warm standby with a DR region valid", (await validate(withDr({ strategy: "warm-standby" }, { drRegion: "us-west-2" }))).d, "allow")
expect("DR region equal to the region rejected", (await validate(withDr({ strategy: "pilot-light" }, { drRegion: "us-east-1" }))).d, "block")
expect("malformed DR region rejected", (await validate(withDr({ strategy: "pilot-light" }, { drRegion: "west" }))).d, "block")
const devOnlyDr = { ...base, environments: { set: "dev", dev: { profile: "acme-dev", region: "us-east-1" }, dr: { strategy: "pilot-light" } } }
expect("DR region is required on the last environment in the set", (await validate(devOnlyDr)).reason.includes("environments.dev.drRegion"), true)

// ---- session start shows the environments
writeFileSync(STATE, JSON.stringify({ ...state, environments: { ...state.environments, prod: { ...state.environments.prod, drRegion: "us-west-2" }, dr: { strategy: "pilot-light" } } }, null, 2))
const ctx: string = (await run("on-session-start.ts", { cwd: P, source: "startup" })).hookSpecificOutput?.additionalContext ?? ""
expect("session start lists environments and promotions",
  ctx.includes("Environments (dev-stage-prod): dev = acme-dev / 111111111111 / us-east-1 (deployed by Develop; last smoke-tested build bbb); stage = acme-stage") && ctx.includes("(promotion approved, not verified yet: record its checks)") && ctx.includes("prod = acme-prod / 333333333333 / us-east-1 (DR us-west-2) (not promoted yet)") && ctx.includes("DR strategy: pilot-light"), true)

console.log(`${total} checks, ${fails} failures`)
process.exitCode = fails > 0 ? 1 : 0
