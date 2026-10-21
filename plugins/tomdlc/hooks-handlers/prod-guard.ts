#!/usr/bin/env bun
// PreToolUse hook for Bash/PowerShell. Production-change guard: commands that
// change shared or production environments, publish artifacts or push code are
// denied for subagents, and need the user's confirmation ("ask") in the main
// session. Read-only and dry-run forms (terraform plan, kubectl diff,
// --dry-run, ansible --check) pass.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { appendAudit, isTomdlcProject } from "./lib/audit.ts"
import { envForProfile, envNames, promotionApproved } from "./lib/environments.ts"
import { STATE_FILE, isSubagent, projectRoot, readEvent, respond } from "./lib/hook.ts"
import { commandName, positionals, simpleCommands } from "./lib/shell.ts"

/** A matched command. `outward` ones (git push, PR comments) are only blocked for agents. */
type Hit = { what: string; outward?: boolean }

const set = (...xs: string[]) => new Set(xs)

const TF = set("apply", "destroy", "import", "taint", "untaint", "force-unlock")
const TF_STATE = set("rm", "mv", "push", "replace-provider")
const PULUMI = set("up", "update", "destroy", "import", "refresh", "cancel")
const KUBE = set(
  "apply", "create", "delete", "replace", "patch", "edit", "scale", "autoscale", "label", "annotate",
  "drain", "cordon", "uncordon", "taint", "exec", "cp", "debug", "run", "expose", "set",
)
const KUBE_ROLLOUT = set("restart", "undo", "pause", "resume")
const KUBE_VALUE_FLAGS = ["-n", "--namespace", "--context", "--kubeconfig", "--cluster", "--user", "-s", "--server", "--token", "--as"]
const HELM = set("install", "upgrade", "uninstall", "delete", "del", "un", "rollback", "push")
const HELM_VALUE_FLAGS = ["-n", "--namespace", "--kube-context", "--kubeconfig"]
const AWS_VALUE_FLAGS = ["--region", "--profile", "--output", "--endpoint-url", "--color", "--ca-bundle"]
const AWS_MUTATING =
  /^(create|delete|put|update|modify|terminate|run|start|stop|reboot|attach|detach|associate|disassociate|authorize|revoke|deregister|register|remove|add|tag|untag|set|enable|disable|import|invoke|publish|send|restore|reset|replace|copy|cancel|apply|execute|deploy|upload|change|purge|batch-write|batch-delete|rotate|schedule|reject|accept|release|allocate|assign|unassign|increase|decrease|promote|failover|reload|rebuild|resize|transact|write)(-|$)/
const GCLOUD_MUTATING = set(
  "create", "delete", "update", "deploy", "patch", "set-iam-policy", "add-iam-policy-binding",
  "remove-iam-policy-binding", "resize", "start", "stop", "reset", "import", "apply", "restore", "undelete",
  "enable", "disable", "rollback", "promote", "migrate", "set", "unset", "add", "remove", "rotate",
)
const GCLOUD_LOCAL = set("config", "auth", "components", "help", "info", "init", "version", "topic")
const AZ_MUTATING = set(
  "create", "delete", "update", "set", "deploy", "start", "stop", "restart", "purge", "add", "remove", "assign",
  "import", "up", "apply", "scale", "swap", "invoke", "reset", "upload", "rotate", "renew", "approve", "regenerate", "restore",
)
const AZ_LOCAL = set("login", "logout", "account", "config", "extension", "bicep", "version", "upgrade", "find", "interactive", "cloud", "feedback")
const AZ_CMDLET =
  /^(new|remove|set|update|start|stop|restart|publish|grant|revoke|add|import|invoke|move|rename|reset|register|unregister|enable|disable|suspend|resume|deploy|sync|backup|restore)-az/
const AZ_CMDLET_LOCAL = /^(set-azcontext|set-azdefault)/
const AWS_CMDLET =
  /^(new|remove|set|update|start|stop|restart|publish|write|register|unregister|grant|revoke|add|import|invoke|edit|reset|send|enable|disable|copy|move|restore)-(ec2|s3|iam|lm|cfn|ecs|eks|rds|ddb|sqs|sns|kms|ssm|sec|cwl?|r53|elb2?|as|cf|cb|cd|cp|ecr|eb|kin|sfn|cog|ag|apig|agv2|ses|sesv2|acm|waf2?|efs|ec|bat)[a-z]/
const DEPLOY_CLIS = set(
  "sam", "serverless", "sls", "netlify", "fly", "flyctl", "firebase", "eb", "wrangler", "copilot",
  "railway", "amplify", "heroku", "doctl", "kamal", "render",
)
const DEPLOY_VERBS = set("deploy", "destroy", "scale", "rollback", "release", "promote", "remove", "delete", "publish", "up", "create", "update")
const VERCEL_SAFE = set("dev", "build", "pull", "link", "login", "logout", "whoami", "ls", "list", "inspect", "logs", "env", "help", "init")
const GH_DANGER: Record<string, Set<string>> = {
  release: set("create", "delete", "upload", "edit", "delete-asset"),
  workflow: set("run", "enable", "disable"),
  run: set("rerun", "cancel", "delete"),
  pr: set("merge"),
  repo: set("delete", "edit", "archive", "unarchive", "rename"),
  secret: set("set", "delete", "remove"),
  variable: set("set", "delete"),
  "deploy-key": set("add", "delete"),
}
const GH_OUTWARD: Record<string, Set<string>> = {
  pr: set("create", "comment", "close", "edit", "review", "ready", "reopen"),
  issue: set("create", "comment", "close", "edit", "reopen", "delete", "transfer"),
  repo: set("create", "fork"),
  gist: set("create", "edit", "delete"),
  label: set("create", "edit", "delete"),
}

const dryRun = (args: string[]) => args.some((a) => /^--dry-run(=(client|server|true))?$/.test(a))

// CDK subcommands that change an account: bootstrap creates resources, watch deploys on every
// save, import adopts resources, gc deletes assets, refactor moves resources between stacks.
const CDK = set("deploy", "destroy", "bootstrap", "watch", "import", "gc", "refactor", "rollback")
// Packages whose executable has another name: `npx aws-cdk deploy` runs `cdk deploy`.
const PACKAGE_BIN: Record<string, string> = { "aws-cdk": "cdk", "cdktf-cli": "cdktf", "@aws-cdk/cli": "cdk" }
// Package scripts that by convention change an environment.
const RISKY_SCRIPT = /^(deploy|destroy|release|publish|rollback|bootstrap)([:_.-].*)?$/i

/** The command a launcher runs (npx cdk deploy → cdk deploy), or null if it isn't a launcher. */
function unwrapLauncher(name: string, args: string[]): string[] | null {
  const skipOptions = (xs: string[], valueFlags: string[]) => {
    let i = 0
    while (i < xs.length && xs[i].startsWith("-")) i += !xs[i].includes("=") && valueFlags.includes(xs[i]) ? 2 : 1
    return xs.slice(i)
  }
  let rest: string[] | null = null
  if (["npx", "bunx", "pnpx"].includes(name)) rest = skipOptions(args, ["-p", "--package", "-c", "--call"])
  else if (["npm", "pnpm", "yarn"].includes(name) && ["exec", "dlx", "x"].includes(args[0])) rest = skipOptions(args.slice(1), ["-p", "--package", "-c"])
  else if (["uv", "poetry", "pipenv", "pdm", "hatch", "pipx", "rye"].includes(name) && args[0] === "run") rest = skipOptions(args.slice(1), ["--with", "--python", "-p", "--env", "-e", "--spec"])
  if (!rest || rest.length === 0) return null
  const pkg = rest[0].replace(/(?<=.)@[^/@]*$/, "") // drop a version: aws-cdk@2.150.0, @aws-cdk/cli@2.1
  return [PACKAGE_BIN[pkg] ?? pkg, ...rest.slice(1)]
}

function check(w: string[]): Hit | null {
  const name = commandName(w[0])
  const args = w.slice(1)
  const p = positionals(args)
  const say = (...parts: (string | undefined)[]) => [name, ...parts].filter(Boolean).join(" ")

  const inner = unwrapLauncher(name, args)
  if (inner) return check(inner)
  // npm run deploy, pnpm deploy:prod, yarn release, bun run destroy
  if (["npm", "pnpm", "yarn", "bun"].includes(name)) {
    const script = p[0] === "run" || p[0] === "run-script" ? p[1] : name === "npm" || name === "bun" ? undefined : p[0]
    if (script && RISKY_SCRIPT.test(script)) return { what: say(p[0] === script ? undefined : p[0], script) }
  }

  switch (name) {
    case "cdk":
    case "cdktf": {
      if (args.includes("--help") || args.includes("-h")) return null
      const verb = p.find((t) => CDK.has(t))
      return verb ? { what: say(verb) } : null
    }
    case "terraform":
    case "tofu":
    case "terragrunt": {
      const q = p[0] === "run-all" || p[0] === "run" ? p.slice(1) : p
      if (TF.has(q[0]) || (q[0] === "state" && TF_STATE.has(q[1])) || (q[0] === "workspace" && q[1] === "delete"))
        return { what: say(...q.slice(0, 2)) }
      return null
    }
    case "pulumi":
      if (PULUMI.has(p[0]) || (p[0] === "stack" && p[1] === "rm") || (p[0] === "state" && p[1] !== undefined))
        return { what: say(p[0], p[1]) }
      return null
    case "kubectl":
    case "oc":
    case "kubecolor": {
      const k = positionals(args, KUBE_VALUE_FLAGS)
      if (dryRun(args)) return null
      if (KUBE.has(k[0]) || (k[0] === "rollout" && KUBE_ROLLOUT.has(k[1]))) return { what: say(k[0], k[0] === "rollout" ? k[1] : undefined) }
      return null
    }
    case "helm": {
      const h = positionals(args, HELM_VALUE_FLAGS)
      return HELM.has(h[0]) && !dryRun(args) ? { what: say(h[0]) } : null
    }
    case "aws": {
      if (args.includes("--dry-run")) return null
      const [svc, op] = positionals(args, AWS_VALUE_FLAGS)
      if (!op || svc === "configure") return null
      if (svc === "s3") {
        const targets = positionals(args, AWS_VALUE_FLAGS).slice(2)
        if (["rm", "rb", "mb"].includes(op)) return { what: say(svc, op) }
        if (op === "mv" && targets.some((t) => t.startsWith("s3://"))) return { what: say(svc, op) }
        if ((op === "cp" || op === "sync") && targets.at(-1)?.startsWith("s3://")) return { what: say(svc, op) }
        return null
      }
      return AWS_MUTATING.test(op) ? { what: say(svc, op) } : null
    }
    case "gcloud":
      if (GCLOUD_LOCAL.has(p[0])) return null
      return p.some((t) => GCLOUD_MUTATING.has(t)) ? { what: say(...p.slice(0, 3)) } : null
    case "gsutil": {
      if (["rm", "mv", "rb", "mb", "setmeta"].includes(p[0])) return { what: say(p[0]) }
      if (["acl", "iam", "defacl"].includes(p[0]) && ["set", "ch"].includes(p[1])) return { what: say(p[0], p[1]) }
      if ((p[0] === "cp" || p[0] === "rsync") && p.at(-1)?.startsWith("gs://")) return { what: say(p[0]) }
      return null
    }
    case "az":
      if (AZ_LOCAL.has(p[0])) return null
      return p.some((t) => AZ_MUTATING.has(t)) ? { what: say(...p.slice(0, 3)) } : null
    case "git": {
      const g = positionals(args, ["-C", "-c", "--git-dir", "--work-tree", "--namespace"])
      if (g[0] !== "push") return null
      const destructive =
        args.some((a) => /^(--force|--force-with-lease.*|--force-if-includes|--delete|--mirror|--prune)$/.test(a) || /^-[A-Za-z]*[fd][A-Za-z]*$/.test(a)) ||
        g.slice(1).some((r) => r.startsWith("+") || r.startsWith(":"))
      return destructive ? { what: "git push (force/delete)" } : { what: "git push", outward: true }
    }
    case "gh": {
      if (p[0] === "api") {
        const i = args.findIndex((a) => a === "-X" || a === "--method")
        const method = i >= 0 ? args[i + 1] : args.find((a) => a.startsWith("--method="))?.split("=")[1]
        const hasFields = args.some((a) => /^(-f|-F|--field|--raw-field|--input)(=|$)/.test(a))
        const mutating = method ? method.toUpperCase() !== "GET" : hasFields
        return mutating ? { what: `gh api ${method?.toUpperCase() ?? "POST"}` } : null
      }
      if (GH_DANGER[p[0]]?.has(p[1])) return { what: say(p[0], p[1]) }
      if (GH_OUTWARD[p[0]]?.has(p[1])) return { what: say(p[0], p[1]), outward: true }
      return null
    }
    case "docker":
    case "podman":
    case "buildah":
    case "nerdctl":
      if (p[0] === "push" || (["image", "manifest"].includes(p[0]) && p[1] === "push") || (p[0] === "buildx" && args.includes("--push")))
        return { what: say(...p.slice(0, 2)) }
      return null
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun":
      if (p[0] === "run") return null
      if (p.some((t) => t === "publish" || t === "unpublish" || t === "deprecate") || (p[0] === "dist-tag" && p[1] === "add"))
        return { what: say(...p.slice(0, 2)) }
      return null
    case "cargo":
      return ["publish", "yank"].includes(p[0]) ? { what: say(p[0]) } : null
    case "twine":
      return p[0] === "upload" ? { what: say(p[0]) } : null
    case "gem":
      return ["push", "yank"].includes(p[0]) ? { what: say(p[0]) } : null
    case "poetry":
    case "uv":
      return p[0] === "publish" ? { what: say(p[0]) } : null
    case "dotnet":
      return p[0] === "nuget" && ["push", "delete"].includes(p[1]) ? { what: say(p[0], p[1]) } : null
    case "mvn":
    case "mvnw":
      return p.some((t) => t === "deploy" || t.startsWith("release:")) ? { what: say("deploy") } : null
    case "gradle":
    case "gradlew":
      return p.some((t) => /(^|:)publish/.test(t)) ? { what: say("publish") } : null
    case "oras":
      return p[0] === "push" ? { what: say(p[0]) } : null
    case "ansible-playbook":
      return args.some((a) => a === "--check" || a === "-C") ? null : { what: name }
    case "vercel":
      if (args.includes("--prod")) return { what: say("--prod") }
      return VERCEL_SAFE.has(p[0]) ? null : { what: say(p[0] ?? "deploy") }
  }

  if (DEPLOY_CLIS.has(name)) {
    const verb = p.find((t) => DEPLOY_VERBS.has(t) || /^[a-z-]+:(scale|rollback|destroy|set|unset|reset)$/.test(t))
    return verb ? { what: say(verb) } : null
  }
  if (AZ_CMDLET.test(name) && !AZ_CMDLET_LOCAL.test(name)) return { what: w[0] }
  if (AWS_CMDLET.test(name)) return { what: w[0] }
  return null
}

const event = await readEvent()
const command = event.tool_input?.command
const agent = isSubagent(event)
const hits = typeof command === "string" ? simpleCommands(command).map(check).filter((h): h is Hit => h !== null) : []
const blocking = agent ? hits : hits.filter((h) => !h.outward)

// Environment gate: a deploy aimed at stage or prod (by its AWS profile, or an env-named var file or
// context) is blocked for everyone until the promotion to that environment is approved.
function targetEnv(cmd: string, environments: unknown): string | null {
  const profiles = [...cmd.matchAll(/(?:--profile[ =]|AWS_PROFILE\s*=\s*)['"]?([\w.-]+)/gi)].map((m) => m[1])
  for (const p of profiles) {
    const env = envForProfile(environments, p)
    if (env) return env
  }
  // Names that point at an environment, in the forms people use:
  //   -var-file=env/prod.tfvars, -backend-config=env/prod.s3.tfbackend, -c env=prod, --context environment=prod,
  //   TF_WORKSPACE=prod, terraform workspace select prod, stacks named App-prod, App_prod, App.prod or AppProd.
  const norm = (w: string) => (w.startsWith("stag") ? "stage" : w.startsWith("prod") ? "prod" : "dev")
  const lower = cmd.toLowerCase()
  const keyed = lower.match(/(?:\benv|\benvironment|\bstage|\btarget|tf_workspace|workspace\s+(?:select|new))[\s\/=:]+['"]?(dev|stage|staging|prod|production)\b/)
  if (keyed) return norm(keyed[1])
  const suffixed = lower.match(/[\/\-_.](dev|stage|staging|prod|production)(?:\.tfvars|\.s3\.tfbackend|\b)/)
  if (suffixed) return norm(suffixed[1])
  const camel = cmd.match(/[a-z0-9](Dev|Stage|Staging|Prod|Production)\b/)
  return camel ? norm(camel[1].toLowerCase()) : null
}
let envBlock: string | null = null
if (blocking.some((h) => !h.outward) && typeof command === "string") {
  const root = projectRoot(event.cwd ?? process.cwd())
  try {
    const state = existsSync(join(root, STATE_FILE)) ? JSON.parse(readFileSync(join(root, STATE_FILE), "utf8")) : null
    const environments = state?.environments
    if (environments) {
      const env = targetEnv(command, environments)
      if (env && env !== "dev" && !envNames(environments).includes(env))
        envBlock = `this project's environment set (${environments.set}) has no ${env} environment`
      else if (env && env !== "dev" && !promotionApproved(environments, env))
        envBlock = `${env} is reached only by an approved promotion, and no promotion to ${env} is approved yet`
    }
  } catch {
    // Unreadable state: fall through to the normal ask/deny below.
  }
}

if (envBlock) {
  const root = projectRoot(event.cwd ?? process.cwd())
  if (isTomdlcProject(root))
    appendAudit(root, "production_command", agent ? String(event.agent_type ?? "subagent") : "orchestrator", {
      decision: "denied (environment gate)", reason: envBlock, command: String(command).slice(0, 300),
    })
  respond({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `TomDLC environment gate: ${envBlock}. Record the promotion in state.json as requested (what build, from which environment), ` +
        'show the user, and ask them to reply with the single word "Approve". Develop deploys only to dev.',
    },
  })
} else if (blocking.length === 0) {
  respond()
} else {
  const what = [...new Set(blocking.map((h) => `\`${h.what}\``))].join(", ")
  const root = projectRoot(event.cwd ?? process.cwd())
  if (isTomdlcProject(root))
    appendAudit(root, "production_command", agent ? String(event.agent_type ?? "subagent") : "orchestrator", {
      decision: agent ? "denied" : "asked user", matched: blocking.map((h) => h.what), command: command.slice(0, 300),
    })
  respond({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: agent ? "deny" : "ask",
      permissionDecisionReason: agent
        ? `TomDLC production-change guard: ${what} changes a shared or production environment or publishes outside this machine, and stage agents never run these. ` +
          "Prepare the exact command (dry-run or plan output is allowed) and put it under Questions for the user so the orchestrator can get approval."
        : `TomDLC production-change guard: ${what} changes a shared or production environment or publishes outside this machine. ` +
          "Approve only if you explicitly asked for this specific action.",
    },
  })
}
