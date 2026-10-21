# Environments

You write and change the IaC. You never apply it. A hook blocks `terraform apply`, `cdk deploy` and mutating `aws` calls for agents. You can run read-only calls (`describe`, `list`, `get`, `terraform plan`, `cdk diff`). The user or the pipeline applies.

## Environment set

The user chooses one in Requirements, and it's recorded in `environments` in state (local always exists):

| Set | Path | Typical use |
|---|---|---|
| `dev` | local → dev | Spikes, internal tools, no production release |
| `dev-prod` | local → dev → prod | Small services at the low tier |
| `dev-stage-prod` | local → dev → stage → prod | Moderate and high tiers, or anything with real users |

Each environment records its AWS account, CLI profile and region. Develop deploys only to dev. Stage and prod are reached only by **promotion**: the same build, in order, each approved by the user with the single word "Approve". The production guard blocks deploys to an environment whose promotion isn't approved. Large or high-tier projects may add ephemeral PR environments and per-developer sandboxes outside this path, in the dev account.

**Parity rule:** every environment is built from the same IaC modules or CDK stacks. They differ only in size and configuration (instance sizes, counts, retention, feature flags), passed as variables or context. No environment-specific resources in code paths (`if env == "prod"` around a security control is a finding).

**Isolation:**
- **One AWS account per environment** is the rule at every tier. Sharing an account between environments needs the user's explicit approval after being told it's not recommended (the state checker and approval guard enforce this).
- Moderate and high tier: one AWS account per environment, under AWS Organizations, with SCPs on the non-prod and prod OUs.
- Low tier: separate accounts are still preferred. At minimum, each environment has its own state file (or CDK stack and bootstrap), its own deploy role, and no role that can write to both prod and non-prod.
- State is remote, encrypted and locked (S3 with KMS and native locking, or DynamoDB locking on older Terraform). State access is limited to the deploy role and break-glass.

**Through a pipeline:** when CI deploys, use the promotion workflow in the devsecops-engineer's pipeline-gates guide ("Promotions through a pipeline"): one GitHub Environment and one OIDC role per environment, in that environment's account, the promoted build passed in, and the account and deployed-build checks done by the workflow itself.

## Lifecycle

**Create**
- From IaC only. Nothing is created by hand, including "temporary" resources.
- Bootstrap resources (state bucket, CDK bootstrap, OIDC provider, deploy roles) are in IaC too, in a separate small stack the user applies once.

**Refresh (data)**
- Non-prod gets synthetic data or seeded fixtures by default.
- Never copy prod personal data into non-prod unmasked. If a prod copy is needed, mask or tokenise personal and restricted fields before the data leaves the prod account, and record the masking rule in `07-operations.md`.
- Snapshots shared across accounts are encrypted with a KMS key whose policy names the target account only.

**Teardown**
- Every environment is destroyable by code. Non-prod stateful resources may use `deletion_protection = false` / `RemovalPolicy.DESTROY`; prod may not (see the security-reviewer's IaC checklist).
- Ephemeral PR environments carry a TTL tag (e.g. `tomdlc:expires-at=2026-10-20T00:00Z`) and the PR number. A scheduled pipeline job destroys expired ones and the PR close event destroys its own. The cleanup job runs in the pipeline, not by an agent.

**Cost controls for idle non-prod**
- Schedules: stop dev and staging compute outside working hours (Instance Scheduler, scheduled scaling to 0, Aurora Serverless min capacity, RDS stop).
- Scale to zero where the service allows it (Lambda, Fargate desired count 0, serverless databases).
- AWS Budgets alert per environment account. Required tags (`env`, `owner`, `cost-center`, `app`) on every resource, enforced in the module and by a tag policy where Organizations is used.

## Promotion

- The same build artifact (image digest, package version) and the same IaC version (commit SHA or module tag) move dev → staging → prod. Nothing is rebuilt per environment.
- **The plan reviewed is the plan applied.** Terraform: `terraform plan -out=tfplan` in the pipeline, post the plan for review, and apply that saved plan file. CDK: review `cdk diff` and deploy the synthesised cloud assembly from the same run (or a CloudFormation change set that is reviewed, then executed).
- Who applies: the pipeline, using an OIDC-federated role per environment (trust limited to the repo and the protected branch or environment), or the user from their own credentials. Never an agent.

| Tier | dev | staging | prod |
|---|---|---|---|
| Low | Auto on merge | n/a or auto | Manual approval by the user |
| Moderate | Auto on merge | Auto after dev checks pass | Manual approval in the pipeline environment |
| High | Auto on merge | Approval | Two-person approval (author can't approve), change window per `07-operations.md` |

## Drift

| Tier | Detection | Response time |
|---|---|---|
| Low | Before each change (the plan shows it) and monthly | By the next change, or the remediation SLA if sooner |
| Moderate | Scheduled weekly in the pipeline | By severity, within the remediation SLA |
| High | Scheduled daily, plus CloudTrail/EventBridge alerts on console changes in prod | Treat a console change in prod as an incident |

- Terraform: `terraform plan -detailed-exitcode -refresh-only` (exit code 2 means drift). CloudFormation/CDK: `aws cloudformation detect-stack-drift`, then `describe-stack-resource-drifts`. AWS Config can also flag resources with no IaC tag.
- These are read-only, so you or the SRE can run them. Report drift as a finding; the orchestrator adds it to the findings register as `F-n` with `source: "scanner:drift"`. Severity follows the change: a weakened security control is high, a size change is low.
- Remediate in one of two ways: **codify** the change (update the IaC so the next plan is clean) or **revert** it (re-apply the IaC). Write which one in the finding's `decision`. Never leave drift accepted without a waiver (`W-n`).

## Manual changes and break-glass

- No manual changes to staging or prod. Console access to prod is read-only by default.
- Break-glass: a separate role, MFA required, session logged in CloudTrail, alert on assume. Used only for an incident.
- Every break-glass change is codified (or reverted) within a set time: 5 working days at low, 2 at moderate, 1 at high. Record it in the incident entry in `07-operations.md` and link the PR that codifies it.
- A break-glass change not codified in time becomes a finding.

Facts checked against primary sources on 2026-10-14.
