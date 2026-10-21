import { join } from "node:path"
import { writeFileSync, rmSync } from "node:fs"
import { EMPTY_BIN, FAKEBIN, H, SP, pathWith } from "../lib/harness.ts"
const P = join(SP, "proj2").replaceAll("\\", "/")
let fails = 0, total = 0
async function run(hook: string, ev: object, env: Record<string, string> = {}) {
  const p = Bun.spawn([process.execPath, join(H, hook)], { stdin: new TextEncoder().encode(JSON.stringify(ev)), stdout: "pipe", env: { ...process.env, ...env } })
  const out = await new Response(p.stdout).text()
  return out ? JSON.parse(out) : {}
}
function expect(name: string, got: unknown, want: unknown) {
  total++
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }
}
const decision = (o: any) => o.hookSpecificOutput?.permissionDecision ?? o.decision ?? "allow"
const AG = { agent_id: "a1", agent_type: "tomdlc:developer", cwd: P }
const MAIN = { cwd: P }

// ---- #1 prod-guard: [command, main session, agent]
const prod: [string, string, string][] = [
  ["terraform apply", "ask", "deny"], ["terraform plan -out x", "allow", "allow"], ["terraform -chdir=infra destroy -auto-approve", "ask", "deny"],
  ["terraform state rm aws_s3_bucket.x", "ask", "deny"], ["terraform state list", "allow", "allow"], ["terragrunt run-all apply", "ask", "deny"],
  ["tofu validate", "allow", "allow"], ["pulumi up --yes", "ask", "deny"], ["pulumi preview", "allow", "allow"],
  ["kubectl -n prod apply -f k8s/", "ask", "deny"], ["kubectl apply -f k8s/ --dry-run=server", "allow", "allow"], ["kubectl diff -f k8s/", "allow", "allow"],
  ["kubectl get pods -n prod", "allow", "allow"], ["kubectl rollout restart deploy/api", "ask", "deny"], ["kubectl rollout status deploy/api", "allow", "allow"],
  ["kubectl --context prod delete pod x", "ask", "deny"], ["helm upgrade --install api ./chart", "ask", "deny"], ["helm upgrade --install api ./chart --dry-run", "allow", "allow"],
  ["helm template ./chart", "allow", "allow"], ["aws s3 ls", "allow", "allow"], ["aws s3 cp s3://b/k ./local", "allow", "allow"],
  ["aws s3 cp ./f s3://b/k", "ask", "deny"], ["aws s3 rm s3://b/k", "ask", "deny"], ["aws --profile prod ec2 terminate-instances --instance-ids i-1", "ask", "deny"],
  ["aws ec2 describe-instances", "allow", "allow"], ["aws sts get-caller-identity", "allow", "allow"], ["aws configure set region us-east-1", "allow", "allow"],
  ["aws cloudformation deploy --template-file t.yml", "ask", "deny"], ["aws ec2 run-instances --dry-run", "allow", "allow"],
  ["gcloud run deploy api --image x", "ask", "deny"], ["gcloud compute instances list", "allow", "allow"], ["gcloud config set project x", "allow", "allow"],
  ["az group delete -n rg", "ask", "deny"], ["az vm list", "allow", "allow"], ["az account set -s sub", "allow", "allow"],
  ["New-AzResourceGroup -Name rg -Location eastus", "ask", "deny"], ["Get-AzVM", "allow", "allow"], ["Set-AzContext -Subscription x", "allow", "allow"],
  ["Remove-S3Object -BucketName b -Key k", "ask", "deny"], ["Get-EC2Instance", "allow", "allow"],
  ["git push", "allow", "deny"], ["git push --force origin main", "ask", "deny"], ["git push -f", "ask", "deny"], ["git push origin +main", "ask", "deny"],
  ["git push origin --delete feature", "ask", "deny"], ["git status && git push -u origin feat", "allow", "deny"], ["git pull", "allow", "allow"],
  ["gh pr create --fill", "allow", "deny"], ["gh pr merge 12 --squash", "ask", "deny"], ["gh pr view 12", "allow", "allow"], ["gh release create v1.0", "ask", "deny"],
  ["gh api repos/o/r/pulls", "allow", "allow"], ["gh api -X DELETE repos/o/r", "ask", "deny"], ["gh api repos/o/r/issues -f title=x", "ask", "deny"],
  ["gh secret set TOKEN", "ask", "deny"], ["docker push registry/app:1", "ask", "deny"], ["docker buildx build --push -t x .", "ask", "deny"], ["docker build -t x .", "allow", "allow"],
  ["npm publish", "ask", "deny"], ["npm run publish", "ask", "deny"], ["npm test", "allow", "allow"], ["cargo publish", "ask", "deny"], ["twine upload dist/*", "ask", "deny"],
  ["mvn -B deploy", "ask", "deny"], ["./gradlew publishToMavenLocal", "ask", "deny"], ["ansible-playbook site.yml", "ask", "deny"], ["ansible-playbook site.yml --check", "allow", "allow"],
  ["cdk deploy --all", "ask", "deny"], ["cdk synth", "allow", "allow"], ["vercel --prod", "ask", "deny"], ["vercel", "ask", "deny"], ["vercel dev", "allow", "allow"],
  ["heroku ps:scale web=2", "ask", "deny"], ["firebase deploy", "ask", "deny"], ["wrangler deploy", "ask", "deny"],
  ["bash -c 'terraform apply -auto-approve'", "ask", "deny"], ['echo "run terraform apply later"', "allow", "allow"], ["grep -rn 'kubectl delete' docs", "allow", "allow"],
  ["sudo -E kubectl apply -f x", "ask", "deny"],
  // CDK subcommands that change an account, and launchers that hide the real command
  ["cdk bootstrap aws://123456789012/us-east-1", "ask", "deny"], ["cdk watch", "ask", "deny"], ["cdk import MyStack", "ask", "deny"],
  ["cdk gc --unstable=gc", "ask", "deny"], ["cdk diff", "allow", "allow"], ["cdk ls", "allow", "allow"], ["cdk --help", "allow", "allow"],
  ["npx cdk deploy", "ask", "deny"], ["npx -y aws-cdk@2.150.0 deploy --all", "ask", "deny"], ["npx @aws-cdk/cli@2.1 destroy", "ask", "deny"],
  ["pnpm exec cdk destroy", "ask", "deny"], ["uv run cdk deploy", "ask", "deny"], ["poetry run cdk deploy MyStack", "ask", "deny"],
  ["npx cdktf-cli deploy", "ask", "deny"], ["npx cdk synth", "allow", "allow"], ["uv run pytest", "allow", "allow"], ["npx eslint .", "allow", "allow"],
  ["uv run terraform apply", "ask", "deny"],
  // package scripts named for deploying
  ["npm run deploy", "ask", "deny"], ["pnpm deploy:prod", "ask", "deny"], ["yarn release", "ask", "deny"], ["bun run destroy", "ask", "deny"],
  ["npm run build", "allow", "allow"], ["pnpm install", "allow", "allow"], ["yarn", "allow", "allow"], ["cat <<'END'\nterraform apply\nEND", "allow", "allow"],
]
for (const [cmd, m, a] of prod) {
  expect(`prod main: ${cmd}`, decision(await run("prod-guard.ts", { ...MAIN, tool_name: "Bash", tool_input: { command: cmd } })), m)
  expect(`prod agent: ${cmd}`, decision(await run("prod-guard.ts", { ...AG, tool_name: "Bash", tool_input: { command: cmd } })), a)
}

// ---- #2 / #6 ownership-guard
const og = (ev: object, tool: string, input: object) => run("ownership-guard.ts", { ...ev, tool_name: tool, tool_input: input })
expect("main writes state", decision(await og(MAIN, "Write", { file_path: `${P}/docs/sdlc/state.json` })), "allow")
expect("agent writes state", decision(await og(AG, "Write", { file_path: `${P}/docs/sdlc/state.json` })), "deny")
expect("agent edits STATE case", decision(await og(AG, "Edit", { file_path: `${P}/DOCS/SDLC/State.json` })), "deny")
expect("generic agent writes dispatch", decision(await og({ ...AG, agent_type: "general-purpose" }, "Write", { file_path: `${P}/docs/sdlc/.dispatch.json` })), "deny")
expect("agent bash writes state", decision(await og(AG, "Bash", { command: "echo '{}' > docs/sdlc/state.json" })), "deny")
expect("agent pwsh writes state", decision(await og(AG, "PowerShell", { command: "Set-Content docs\\sdlc\\state.json '{}'" })), "deny")
expect("agent bash reads state", decision(await og(AG, "Bash", { command: "cat docs/sdlc/state.json" })), "allow")
expect("agent bash tf state", decision(await og(AG, "Bash", { command: "cp infra/state.json backup/" })), "allow")
expect("agent no dispatch -> free", decision(await og(AG, "Write", { file_path: `${P}/infra/main.tf` })), "allow")
writeFileSync(join(SP, "proj2/docs/sdlc/.dispatch.json"), JSON.stringify({ agents: { developer: { stage: "develop", owns: ["src/**", "tests/unit/**", "package.json"] } } }))
expect("owned file", decision(await og(AG, "Write", { file_path: `${P}/src/api/users.ts` })), "allow")
expect("owned exact", decision(await og(AG, "Edit", { file_path: `${P}/package.json` })), "allow")
expect("owned windows path", decision(await og(AG, "Edit", { file_path: `${P.replaceAll("/", "\\")}\\tests\\unit\\a.test.ts` })), "allow")
expect("not owned", decision(await og(AG, "Write", { file_path: `${P}/.github/workflows/ci.yml` })), "deny")
expect("other agent no entry", decision(await og({ ...AG, agent_type: "tomdlc:tester" }, "Write", { file_path: `${P}/.github/workflows/ci.yml` })), "allow")
expect("outside project", decision(await og(AG, "Write", { file_path: `${SP}/elsewhere.txt` })), "allow")
expect("main not restricted", decision(await og(MAIN, "Write", { file_path: `${P}/.github/workflows/ci.yml` })), "allow")
expect("cwd in subdir", decision(await og({ ...AG, cwd: `${P}/src` }, "Write", { file_path: `${P}/infra/x.tf` })), "deny")

// ---- #3 agent-report-check
const full = "Done.\n### Summary\nx\n### Files changed\nx\n### Gate self-assessment\nx\n### Questions for the user\nNone.\n### Handoffs\nNone.\n### Findings\nNone."
const rc = (ev: object) => run("agent-report-check.ts", { hook_event_name: "SubagentStop", ...ev })
expect("report complete", decision(await rc({ ...AG, last_assistant_message: full })), "allow")
expect("report bold labels", decision(await rc({ ...AG, last_assistant_message: full.replaceAll(/### (.+)/g, "**$1**") })), "allow")
const partial = await rc({ ...AG, last_assistant_message: "### Summary\nx\n### Findings\nNone" })
expect("report partial", decision(partial), "block")
expect("report lists missing", /Files changed, Gate self-assessment, Questions for the user, Handoffs/.test(partial.reason), true)
expect("report retry allowed", decision(await rc({ ...AG, stop_hook_active: true, last_assistant_message: "nope" })), "allow")
expect("report non-tomdlc agent", decision(await rc({ ...AG, agent_type: "Explore", last_assistant_message: "nope" })), "allow")

// ---- #5 validate-state
const vs = (file: string, content: unknown) => {
  writeFileSync(join(SP, "proj2", file), typeof content === "string" ? content : JSON.stringify(content))
  return run("validate-state.ts", { ...MAIN, tool_name: "Write", tool_input: { file_path: `${P}/${file}` } })
}
const stages = Object.fromEntries(["plan", "requirements", "design", "develop", "test", "deploy", "maintain"].map((s) => [s, { status: "not-started" }]))
const good = {
  project: "demo", riskTier: "moderate", currentStage: "design",
  stages: { ...stages, plan: { status: "passed", passedAt: "2026-10-01", approval: { at: "2026-10-01", text: "ok" } }, requirements: { status: "passed-with-waivers", passedAt: "2026-10-05", approval: { at: "2026-10-05", text: "approved with W-1" } } },
  waivers: [{ stage: "requirements", criterion: "Stakeholder review", reason: "PO on leave", owner: "tom", expires: "2026-11-01" }],
  history: [{ date: "2026-10-01", stage: "plan", agent: "planner", outcome: "passed" }],
}
expect("state valid", decision(await vs("docs/sdlc/state.json", good)), "allow")
const bad = await vs("docs/sdlc/state.json", { ...good, currentStage: "build", stages: { ...good.stages, plan: { status: "done" }, design: { status: "passed" } }, waivers: [{ stage: "plan", criterion: "x" }] })
expect("state invalid", decision(bad), "block")
for (const frag of ["currentStage", "stages.plan.status", "stages.design` is passed but has no ISO", "waivers[0].owner", "waivers[0].expires", "requirements` is passed-with-waivers"])
  expect(`state error mentions ${frag}`, bad.reason?.includes(frag), true)
expect("state not json", decision(await vs("docs/sdlc/state.json", "{ nope")), "block")
expect("dispatch valid", decision(await vs("docs/sdlc/.dispatch.json", { agents: { developer: { stage: "develop", owns: ["src/**"] } } })), "allow")
expect("dispatch invalid", decision(await vs("docs/sdlc/.dispatch.json", { agents: { developer: { stage: "dev", owns: ["C:\\src\\**"] } } })), "block")
expect("other file ignored", decision(await vs("README.md", "# hi")), "allow")
rmSync(join(SP, "proj2/docs/sdlc/.dispatch.json"))

// ---- #4 post-write-scan
const ps = (file: string, env = {}) => run("post-write-scan.ts", { ...MAIN, tool_name: "Write", tool_input: { file_path: `${P}/${file}` } }, env)
expect("scan no tools", await ps("src/app.py", { PATH: EMPTY_BIN }), {})
const PATHX = { PATH: pathWith(FAKEBIN) }
const scanned = await ps("src/app.py", PATHX)
const ctx: string = scanned.hookSpecificOutput?.additionalContext ?? ""
expect("scan reports semgrep", ctx.includes("semgrep python.lang.security.audit.eval at line 3"), true)
expect("scan reports gitleaks", ctx.includes("gitleaks generic-api-key at line 2"), true)
expect("scan hides secret", ctx.includes("SHOULD-NOT-APPEAR"), false)
const md: string = (await ps("README.md", PATHX)).hookSpecificOutput?.additionalContext ?? ""
expect("scan md gitleaks only", md.includes("gitleaks") && !md.includes("semgrep"), true)
expect("scan skips docs/sdlc", await ps("docs/sdlc/state.json", PATHX), {})

// --- guards fail closed: a broken guard denies instead of silently allowing
{
  const { cpSync } = await import("node:fs")
  const HC = join(SP, "hooks-copy")
  cpSync(H, HC, { recursive: true })
  writeFileSync(join(HC, "syntax-guard.ts"), "import { respond } from './lib/hook.ts'\nconst x = {\nrespond()\n")
  writeFileSync(join(HC, "throwing-guard.ts"), "import { readEvent } from './lib/hook.ts'\nconst ev = await readEvent()\nthrow new Error('boom on ' + ev.tool_name)\n")
  writeFileSync(join(HC, "sleeping-guard.ts"), "await new Promise((r) => setTimeout(r, 60_000))\n")
  writeFileSync(join(HC, "spinning-guard.ts"), "while (true) {}\n")
  writeFileSync(join(HC, "noisy-guard.ts"), "console.log('not json')\n")
  const fc = async (guard: string, ev: object, env: Record<string, string> = {}) => {
    const p = Bun.spawn([process.execPath, join(HC, "fail-closed.ts"), guard], { stdin: new TextEncoder().encode(JSON.stringify(ev)), stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } })
    const out = await new Response(p.stdout).text()
    return out ? JSON.parse(out) : {}
  }
  const ev = { cwd: P, tool_name: "Bash", tool_input: { command: "ls" } }
  expect("guard with a syntax error denies", decision(await fc("syntax-guard.ts", ev)), "deny")
  const thrown = await fc("throwing-guard.ts", ev)
  expect("guard that throws denies", decision(thrown), "deny")
  expect("denial names the broken guard", String(thrown.hookSpecificOutput?.permissionDecisionReason).includes("throwing-guard.ts"), true)
  expect("missing guard denies", decision(await fc("missing-guard.ts", ev)), "deny")
  expect("path outside the hooks folder denies", decision(await fc("../evil.ts", ev)), "deny")
  expect("working guard runs unchanged (allow)", decision(await fc("block-claude-cli.ts", ev)), "allow")
  const quick = { TOMDLC_GUARD_TIMEOUT_MS: "1500" }
  const t0 = Date.now()
  const slept = await fc("sleeping-guard.ts", ev, quick)
  expect("a guard that never answers is denied", decision(slept), "deny")
  expect("the deadline, not Claude Code's timeout, decides", Date.now() - t0 < 10_000, true)
  expect("a guard stuck in a synchronous loop is denied", decision(await fc("spinning-guard.ts", ev, quick)), "deny")
  expect("a guard printing non-JSON is denied", decision(await fc("noisy-guard.ts", ev)), "deny")
  expect("working guard runs unchanged (deny)", decision(await fc("block-claude-cli.ts", { ...ev, tool_input: { command: "claude -p x" } })), "deny")
  const hooksJson = await Bun.file(join(H, "..", "hooks", "hooks.json")).text()
  expect("every PreToolUse guard goes through fail-closed.ts",
    ["block-claude-cli", "prod-guard", "ownership-guard", "secrets-guard", "approval-guard", "web-guard"].every((g) => hooksJson.includes(`fail-closed.ts\\" ${g}.ts`)), true)
}

console.log(`${total} checks, ${fails} failures`)

process.exitCode = fails > 0 ? 1 : 0
