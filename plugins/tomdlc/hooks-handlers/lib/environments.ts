// Deployment environments for projects on a cloud platform: the chosen set, the
// account and profile each environment uses, and promotions between them.
//
//   "environments": {
//     "set": "dev-stage-prod",                        // "dev" | "dev-prod" | "dev-stage-prod"; local always exists
//     "dev":   { "account": "111111111111", "profile": "acme-dev",   "region": "us-east-1" },
//     "stage": { "account": "222222222222", "profile": "acme-stage", "region": "us-east-1" },
//     "prod":  { "account": "333333333333", "profile": "acme-prod",  "region": "us-east-1", "drRegion": "us-west-2" },
//     "dr": { "strategy": "pilot-light" },                     // backup-restore | pilot-light | warm-standby | active-active
//     "sharedAccountsApproval": { "text": "...", "at": "..." },   // only when two environments share an account
//     "devDeploys": [                                           // what the user deployed to dev, from their report
//       { "build": "<git SHA or artifact digest>", "account": "<from sts get-caller-identity>", "at": "<ISO>", "smoke": "passed" | "failed" }
//     ],
//     "promotions": [
//       { "id": "P-1", "to": "stage", "build": "<git SHA or artifact digest>", "status": "requested" | "approved" | "rejected",
//         "requestedAt": "<ISO>", "approval": { "text": "Approve", "at": "<ISO>" },
//         "checks": { "accountBeforeDeploy": "<from sts get-caller-identity>", "deployedBuild": "<what is running afterwards>", "at": "<ISO>" } }
//     ]
//   }
//
// Develop deploys only to dev. Stage and prod are reached only by promotion, each approved by the
// user replying with the single word "Approve". The first promotion out of dev needs the same build
// deployed to dev and smoke-tested there.

type Obj = Record<string, any>

export const ENV_SETS: Record<string, string[]> = {
  dev: ["dev"],
  "dev-prod": ["dev", "prod"],
  "dev-stage-prod": ["dev", "stage", "prod"],
}
const PROMOTION_STATUSES = ["requested", "approved", "rejected"]
/** Disaster-recovery strategies, cheapest and slowest first. */
export const DR_STRATEGIES = ["backup-restore", "pilot-light", "warm-standby", "active-active"]
const ACCOUNT = /^\d{12}$/
const REGION = /^[a-z]{2}(-gov)?-[a-z]+-\d$/
const DATE = /^\d{4}-\d{2}-\d{2}/

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

/** The environments in the project's chosen set, in promotion order (local is implicit). */
export const envNames = (e: unknown): string[] => (isObj(e) && ENV_SETS[e.set]) || []

/** The environment a promotion to `env` comes from: the one before it in the set. */
export const promotedFrom = (e: unknown, env: string): string | null => {
  const names = envNames(e)
  const i = names.indexOf(env)
  return i > 0 ? names[i - 1] : null
}

/** Accounts used by more than one environment: account → environment names. */
export function sharedAccounts(e: unknown): [string, string[]][] {
  const by = new Map<string, string[]>()
  for (const name of envNames(e)) {
    const account = (e as Obj)[name]?.account
    if (isStr(account)) by.set(account, [...(by.get(account) ?? []), name])
  }
  return [...by.entries()].filter(([, names]) => names.length > 1)
}

/** The single-word promotion approval: "Approve" (any case, optional trailing punctuation). */
export const isApproveWord = (text: unknown): boolean => typeof text === "string" && /^\s*approve[.!]?\s*$/i.test(text)

/** Has a promotion to `env` been approved? */
export const promotionApproved = (e: unknown, env: string): boolean =>
  isObj(e) && Array.isArray(e.promotions) && e.promotions.some((p: Obj) => p?.to === env && p?.status === "approved")

/** The environment a profile belongs to, if the project defines it. */
export function envForProfile(e: unknown, profile: string): string | null {
  for (const name of envNames(e)) if ((e as Obj)[name]?.profile === profile) return name
  return null
}

/** Has `build` been deployed to dev and passed its smoke test there? */
export const devVerified = (e: unknown, build: unknown): boolean =>
  isObj(e) && Array.isArray(e.devDeploys) && e.devDeploys.some((d: Obj) => d?.build === build && d?.smoke === "passed")

const passed = (s: unknown) => typeof s === "string" && s.startsWith("passed")
const SMOKE = ["passed", "failed"]

/** Schema and ordering errors for `environments` (state.json validator). */
export function validateEnvironments(e: unknown, stages: Obj | undefined): string[] {
  if (e == null) return []
  if (!isObj(e)) return ["`environments` must be an object"]
  const errors: string[] = []
  const names = ENV_SETS[e.set]
  if (!names) return [`\`environments.set\` must be one of ${Object.keys(ENV_SETS).join(", ")}`]

  for (const name of names) {
    const env = e[name]
    if (!isObj(env)) {
      errors.push(`\`environments.${name}\` is required for set ${e.set}: its AWS account and/or CLI profile`)
      continue
    }
    if (!isStr(env.account) && !isStr(env.profile)) errors.push(`\`environments.${name}\` needs an \`account\` (12 digits) or a \`profile\``)
    if (env.account != null && !ACCOUNT.test(String(env.account))) errors.push(`\`environments.${name}.account\` must be a 12-digit AWS account ID`)
    if (env.region != null && !REGION.test(String(env.region))) errors.push(`\`environments.${name}.region\` must look like us-east-1`)
    if (env.drRegion != null && !REGION.test(String(env.drRegion))) errors.push(`\`environments.${name}.drRegion\` must look like us-west-2`)
    if (env.drRegion != null && env.drRegion === env.region) errors.push(`\`environments.${name}.drRegion\` must differ from its region: a recovery region in the same region doesn't survive losing it`)
  }
  for (const other of ["dev", "stage", "prod"].filter((n) => !names.includes(n)))
    if (e[other] != null) errors.push(`\`environments.${other}\` is set but set ${e.set} doesn't include it`)

  if (e.dr != null) {
    if (!isObj(e.dr) || !DR_STRATEGIES.includes(e.dr.strategy)) errors.push(`\`environments.dr.strategy\` must be one of ${DR_STRATEGIES.join(", ")}`)
    else if (e.dr.strategy !== "backup-restore") {
      const top = names[names.length - 1]
      if (!isStr(e[top]?.drRegion)) errors.push(`DR strategy ${e.dr.strategy} needs \`environments.${top}.drRegion\`: the second region it fails over to`)
    }
  }

  const shared = sharedAccounts(e)
  const a = e.sharedAccountsApproval
  if (shared.length > 0 && (!isObj(a) || !isStr(a.text) || !DATE.test(String(a.at ?? ""))))
    errors.push(
      `environments ${shared.map(([acct, ns]) => `${ns.join(" and ")} share account ${acct}`).join("; ")}. ` +
        "Separate accounts per environment are strongly recommended; sharing one needs the user's explicit approval in `environments.sharedAccountsApproval` { text, at }.",
    )

  if (e.devDeploys != null && !Array.isArray(e.devDeploys)) errors.push("`environments.devDeploys` must be an array")
  for (const [i, d] of (Array.isArray(e.devDeploys) ? e.devDeploys : []).entries()) {
    const at = `\`environments.devDeploys[${i}]\``
    if (!isObj(d) || !isStr(d.build) || !DATE.test(String(d.at ?? "")) || !SMOKE.includes(d.smoke))
      errors.push(`${at} needs build, at and smoke ("passed" or "failed"), from what the user reported`)
    else if (d.account != null && isStr(e.dev?.account) && d.account !== e.dev.account)
      errors.push(`${at}: the deploy session was in account ${d.account}, not dev's account ${e.dev.account}. Stop: the deploy may have gone to the wrong environment`)
  }

  if (e.promotions != null && !Array.isArray(e.promotions)) return [...errors, "`environments.promotions` must be an array"]
  const seen = new Set<string>()
  const approvedTo = new Map<string, string[]>()
  for (const [i, p] of (e.promotions ?? []).entries()) {
    const at = `\`environments.promotions[${i}]\``
    if (!isObj(p)) {
      errors.push(`${at} must be an object`)
      continue
    }
    if (!/^P-\d+$/.test(String(p.id ?? ""))) errors.push(`${at}.id must look like P-n`)
    else if (seen.has(p.id)) errors.push(`promotion ID ${p.id} is used more than once`)
    else seen.add(p.id)
    if (!names.includes(p.to) || p.to === "dev") errors.push(`${at}.to must be ${names.filter((n) => n !== "dev").join(" or ") || "(none: set dev has no promotions)"}; Develop deploys to dev directly`)
    if (!isStr(p.build)) errors.push(`${at}.build must name what's promoted (git SHA or artifact digest)`)
    if (!PROMOTION_STATUSES.includes(p.status)) errors.push(`${at}.status must be one of ${PROMOTION_STATUSES.join(", ")}`)
    if (p.status === "approved") {
      if (!isObj(p.approval) || !isApproveWord(p.approval.text) || !DATE.test(String(p.approval.at ?? "")))
        errors.push(`${at} is approved, so \`approval\` must be { text: "Approve", at } (the user's one-word reply)`)
      const from = promotedFrom(e, p.to)
      if (from && from !== "dev" && !(approvedTo.get(from) ?? []).includes(p.build))
        errors.push(`${at}: ${p.to} can only receive build ${p.build} after the same build was approved for ${from}`)
      if (from === "dev" && !devVerified(e, p.build))
        errors.push(
          `${at}: ${p.to} can only receive build ${p.build} after it was deployed to dev and its smoke test passed there. ` +
            "Have the user deploy that build to dev and run the smoke test, then record it in `environments.devDeploys` { build, account, at, smoke }",
        )
      if (p.to === "stage" && !passed(stages?.develop?.status)) errors.push(`${at}: promoting to stage needs the Develop gate passed first`)
      if (p.to === "prod" && !passed(stages?.test?.status)) errors.push(`${at}: promoting to prod needs the Test gate passed first`)
      approvedTo.set(p.to, [...(approvedTo.get(p.to) ?? []), p.build])
    }
    if (p.checks != null) {
      const c = p.checks
      const account = e[p.to]?.account
      if (!isObj(c) || !isStr(c.accountBeforeDeploy) || !isStr(c.deployedBuild) || !DATE.test(String(c.at ?? "")))
        errors.push(`${at}.checks needs accountBeforeDeploy, deployedBuild and at`)
      else {
        if (isStr(account) && c.accountBeforeDeploy !== account)
          errors.push(`${at}: the deploy session was in account ${c.accountBeforeDeploy}, not ${p.to}'s account ${account}. Stop: the deploy may have gone to the wrong environment`)
        if (c.deployedBuild !== p.build) errors.push(`${at}: ${p.to} is running ${c.deployedBuild}, not the promoted build ${p.build}`)
      }
    }
  }
  // A stage passes only once its promotion was verified: the right account before, the right build after.
  const verified = (env: string) =>
    (e.promotions ?? []).some((p: Obj) => p?.to === env && p?.status === "approved" && isObj(p.checks) && p.checks.deployedBuild === p.build)
  if (names.includes("stage") && passed(stages?.test?.status) && !verified("stage"))
    errors.push("Test passed, but no stage promotion has `checks` showing the right account before the deploy and the promoted build running after it")
  if (names.includes("prod") && passed(stages?.deploy?.status) && !verified("prod"))
    errors.push("Deploy passed, but no prod promotion has `checks` showing the right account before the deploy and the promoted build running after it")
  return errors
}
