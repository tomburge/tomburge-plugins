# AWS CDK on AWS

Defaults for projects whose IaC tool is the AWS CDK (v2), in TypeScript or Python. `.tomdlc/practices.md` overrides any of them, and in an existing `infra/` app, its established layout wins unless an ADR changes it.

Builds and tests run without credentials (see the devsecops engineer's pipeline-gates guide, "Credential-free builds"); only the user's plan, diff and apply steps use a profile. Accounts, identity, network, encryption and tagging defaults are in `aws-foundations.md`; environments, promotion and drift policy in `environments.md`. Tool versions and flags here were current in October 2026: check the release notes before relying on a version-specific feature.

You write the code, its tests and the diff. You never deploy. A hook blocks `cdk deploy`, `destroy`, `bootstrap`, `watch` and `import` (also through `npx`, `uv run` and `poetry run`), and mutating `aws` CLI calls. `cdk synth` and `cdk diff` are allowed. The user, or a pipeline that assumes an AWS role through OIDC, deploys.

## Layout

```
infra/
  bin/app.ts            # TS entry point      | app.py (Python)
  lib/constructs/       # your L3 patterns    | infra/constructs/
  lib/stacks/           # stacks              | infra/stacks/
  lib/stages/           # one Stage per env   | infra/stages/
  test/                 # jest/vitest         | tests/ (pytest)
  cdk.json  cdk.context.json
```

- **Stacks by lifecycle.** Stateful resources (databases, buckets, KMS keys) in a data stack that changes rarely; stateless compute (functions, containers, APIs) in stacks that deploy often. A bad compute deploy then can't touch the data.
- **A Stage per environment**, containing the same stacks, each instantiated with an explicit `env` (account and region). Don't rely on `CDK_DEFAULT_ACCOUNT` for anything but a personal sandbox.
- Pass resources between stacks as props (`ITable`, `IVpc`), not by name lookups. Keep cross-stack references few: an export can't change while another stack imports it.

| Construct level | Use |
|---|---|
| L2 (`s3.Bucket`, `lambda.Function`) | The default. Secure defaults and `grant*` methods |
| Your own L3 (e.g. `OrderService`) | Wrap a pattern the project repeats, with the org's defaults baked in. Props in, public readonly outputs |
| AWS L3 (`LambdaRestApi`) | Only when it fits exactly; otherwise compose L2s |
| L1 (`CfnBucket`) or escape hatch (`node.defaultChild`) | Only for a property no L2 exposes; comment why |

## Versions
- Pin `aws-cdk-lib` and `constructs` exactly (no `^` or `~`), and pin the CLI (`aws-cdk`) as a dev dependency rather than a global install. Since early 2025 the CLI is versioned separately (2.1xxx); keep it at least as new as the library needs, and upgrade both in one slice.
- Commit the lockfile: `package-lock.json` (or pnpm/yarn), `uv.lock`, or `requirements.txt` with hashes (`pip-compile --generate-hashes`).
- Commit `cdk.json`, including its feature flags in `context`. New projects get the flags `cdk init` writes; on an upgrade, turning on a new flag is a reviewed change, because some replace resources.
- Commit `cdk.context.json`. It caches lookups (VPC IDs, AMIs, AZs) so synth is repeatable. Refresh it on purpose with `cdk context --reset <key>`, in a slice.

## Code rules
- **No hard-coded physical names** (`bucketName`, `functionName`, `tableName`) unless something outside the stack needs a fixed name. Generated names allow replacement and avoid collisions across environments.
- **Protect stateful resources in prod** with `RemovalPolicy.RETAIN` plus the service's deletion protection. Non-prod can use `DESTROY` where losing data is fine.
  ```ts
  new dynamodb.TableV2(this, 'Orders', { partitionKey, removalPolicy: RemovalPolicy.RETAIN, deletionProtection: props.isProd });
  ```
  ```python
  dynamodb.TableV2(self, "Orders", partition_key=pk, removal_policy=RemovalPolicy.RETAIN, deletion_protection=props.is_prod)
  ```
- **Grant methods over hand-written policies**: `table.grantReadData(fn)` / `table.grant_read_data(fn)`. Write a `PolicyStatement` only when no grant exists; name actions and resources, no `*`.
- **Tags at the app**: `Tags.of(app).add('owner', 'payments')` / `Tags.of(app).add("owner", "payments")`, plus environment, service, cost centre and data classification.
- **Aspects for org rules** that every stack must meet (encryption, no `0.0.0.0/0` ingress, required tags). An aspect reports with `Annotations.of(node).addError(...)` so synth fails; it doesn't silently fix.
- **No secrets in code, context or environment variables.** Reference Secrets Manager (`secretsmanager.Secret.fromSecretNameV2`, `SecretValue.secretsManager(...)`), which resolves at deploy or run time. Never call `unsafeUnwrap()` on a secret.
- **Environment config as typed props**: an `EnvConfig` interface (TS) or frozen dataclass (Python) per environment, validated at synth. No `tryGetContext` lookups scattered through constructs.
- Encryption on, public access off (`BlockPublicAccess.BLOCK_ALL`), log retention set, by default in your L3s. Comments link to SR-n, T-n or ADR-n.

## Tests
**Small scale:** assert what matters for security and deployability (IAM actions and resources, network exposure, encryption, retention and deletion protection, the service limits below), not every property the code sets. One test file per resource group is usually enough.

| Kind | How | Purpose |
|---|---|---|
| Fine-grained assertions | `Template.fromStack(stack)` then `hasResourceProperties`, `resourceCountIs`, `Match.*`. TS: jest or vitest. Python: `assertions.Template.from_stack`, `has_resource_properties`, pytest | One test per SR-n or T-n mitigation: encryption, public access, IAM scope, retention |
| Snapshot | `expect(template.toJSON()).toMatchSnapshot()` (Python: compare with a stored JSON, or syrupy) | Shows unintended changes. Review the snapshot diff in the pull request; never update snapshots blindly to make a test pass |
| cdk-nag | `Aspects.of(app).add(new AwsSolutionsChecks())` | AWS Solutions rules at synth; errors fail synth |
| Synth | `cdk synth` in CI, for every stage | The app builds for every environment |
| Scan | `checkov -d cdk.out` or `trivy config cdk.out` | A second opinion on the generated templates |

```python
template = Template.from_stack(stack)
template.has_resource_properties("AWS::S3::Bucket", {
    "PublicAccessBlockConfiguration": {"BlockPublicAcls": True, "RestrictPublicBuckets": True},
})
```

cdk-nag suppressions are accepted risks. Each one names the rule, a reason, and the waiver, at the narrowest scope (a resource, not the stack):

```ts
// cdk-nag v3 (June 2026 onward): rules run as a CDK policy-validation plugin; acknowledge a finding on the construct
Validations.of(bucket).acknowledge({ id: 'AwsSolutions-S1', reason: 'W-5, expires 2026-12-31: access logs go to the org log bucket' });

// cdk-nag v2 (older projects): NagSuppressions
NagSuppressions.addResourceSuppressions(bucket, [
  { id: 'AwsSolutions-S1', reason: 'W-5, expires 2026-12-31: access logs go to the org log bucket' },
]);
```

Use the form that matches the installed cdk-nag major version. Checkov can't read either: for a CDK resource, put a `checkov: skip` entry (with the waiver in its `comment`) in the L1 construct's `Metadata`, then scan the synthesized template.

List them in the `04-develop.md` suppressions inventory, as `devsecops-engineer/pipeline-gates.md` describes.


**Assert the service limits that only fail at deploy.** Synth, validate, lint and scanners don't know AWS quotas on resource *properties*, so a template can pass every offline check and still fail `CREATE` (found live: an EventBridge pattern of 2,887 characters against the 2,048 limit; a Lambda environment over 4 KB). For every generated value that can grow, add a test that measures it against the documented limit, with headroom. Common ones:

| Limit | Value |
|---|---|
| EventBridge event pattern (Custom Event Bus - Classic rules) | 2,048 characters (raisable) |
| EventBridge rules with wildcards in their patterns | 30 per event bus (fixed) |
| EventBridge Custom Event Bus (the newer bus type, with subscribers) filters | 4,096 bytes across up to 3 filters per subscriber, and 1,000 `$or` combinations (fixed) |
| Lambda environment variables (all, encoded) | 4 KB |
| IAM managed policy / inline role policies (total) | 6,144 / 10,240 characters, whitespace excluded |
| IAM role trust policy | 2,048 characters (raisable) |
| S3 bucket policy | 20 KB |
| Security group rules | 60 inbound and 60 outbound per group (default) |
| CloudFormation template body / resources per stack | 1 MB from S3 (51,200 bytes inline) / 500 resources |
| SSM parameter value (Standard) | 4 KB |
| Step Functions definition | 1 MB |

Check the current number in the AWS quotas page when a value is close; record the limit next to the test.

## Diff review
Run `cdk diff <stack>` against the target environment with the read-only role, and read it per stack. By default (`--method=auto`) diff tries to create a change set with the deploy role and falls back to a less precise template-only diff when it can't; `--method=template` uses only the lookup role. Flag these to the user in your result, with the logical ID and why:

| Change | Why it matters |
|---|---|
| `[-]` or `replace` on a stateful resource (the diff says "requires replacement" or "may be replaced"); a changed logical ID, which looks like delete plus create | Data loss. Say whether `RETAIN` covers it |
| IAM statement changes, shown in the security changes table | Privilege changes; list added actions and principals |
| Security group changes | Network exposure |
| Anything public: `0.0.0.0/0` ingress, public bucket or API, public subnet | Internet exposure |
| KMS key or key policy changes | Loss of access to encrypted data |
| Feature flag or `cdk.context.json` changes | Can change many resources at once |

`cdk diff --security-only` shows only the broadening changes; include its output when IAM or security groups change. At the high tier, these need the security-reviewer before the gate.

In pipelines, deploy with `--require-approval broadening`. Without a terminal (TTY) it can't prompt, so a broadening change fails the deploy. If a person already approved that diff earlier in the pipeline, the deploy step needs `--require-approval never` to go ahead. Give the user the exact command for a manual deploy:

```
npx cdk deploy Prod/DataStack --require-approval broadening    # or: uv run cdk deploy ...
```

## Bootstrap
Done once per account and region, by the user (agents are blocked). Write the command for them in your result:

```
cdk bootstrap aws://111111111111/eu-west-1 \
  --cloudformation-execution-policies arn:aws:iam::111111111111:policy/CdkDeployPolicy \
  --trust 222222222222 --trust-for-lookup 222222222222
```

- Use a least-privilege execution policy instead of the default `AdministratorAccess` where practical (moderate and high tiers). Write the policy as code in `infra/bootstrap/`, and list what it allows.
- `--trust` names the pipeline (tools) account only.
- A custom `--qualifier` is needed when several teams or apps share an account and must not share bootstrap roles; set the same qualifier in `cdk.json`.
- Re-bootstrap when a CDK upgrade needs a newer bootstrap version.

## Pipelines
- **GitHub Actions** (or another CI): one OIDC role per environment, scoped to the repo and to the environment's protected branch or GitHub environment. Jobs: synth → test (assertions, cdk-nag, scan) → diff (posted to the pull request) → manual approval (GitHub environment protection) → deploy. The deploy role can only assume the CDK bootstrap roles.
- **CDK Pipelines** (`pipelines.CodePipeline`): a self-mutating pipeline in a tools account, with `ManualApprovalStep` before prod. Good when the team already runs on AWS CodePipeline.
- Never `--hotswap` or `cdk watch` outside a personal sandbox account: both skip CloudFormation and leave drift.
- Pin actions by SHA and follow the rest of `devsecops-engineer/pipeline-gates.md`.

## Drift
- Schedule drift detection per stack (e.g. daily) with a role that has read-only access plus `cloudformation:DetectStackDrift`: `aws cloudformation detect-stack-drift`, then `describe-stack-resource-drifts`. Newer CLI versions also have `cdk drift`.
- Drift detection covers only resources and properties CloudFormation tracks; it misses resources created outside any stack.
- For each drifted resource, decide with the user: **codify** (change the code to match, in a slice) or **revert** (the next deploy restores it; some properties need a code change to force an update). Unexpected IAM, security group or encryption drift is a possible incident (see `sre/incident-response.md`).

## Before you hand back
- [ ] `cdk synth` for every stage, tests, cdk-nag and the scan pass
- [ ] Library, CLI and lockfile pinned; `cdk.json` and `cdk.context.json` committed
- [ ] No hard-coded names, account IDs or secrets; config is typed props
- [ ] Stateful resources retained and protected in prod
- [ ] Diff produced; replacements, IAM, network and public changes flagged
- [ ] Deploy and any bootstrap commands written out for the user; nothing deployed
- [ ] Suppressions listed in `04-develop.md` with waiver IDs

Facts checked against primary sources on 2026-10-14.
