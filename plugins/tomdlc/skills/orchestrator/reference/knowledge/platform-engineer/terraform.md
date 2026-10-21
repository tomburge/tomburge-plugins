# Terraform on AWS

Defaults for projects whose IaC tool is Terraform. `docs/sdlc/practices.md` overrides any of them, and in an existing `infra/` tree, its established layout wins unless an ADR changes it.

Builds and tests run without credentials (see the devsecops engineer's pipeline-gates guide, "Credential-free builds"); only the user's plan, diff and apply steps use a profile. Accounts, identity, network, encryption and tagging defaults are in `aws-foundations.md`; environments, promotion and drift policy in `environments.md`. Tool versions and flags here were current in October 2026: check the release notes before relying on a version-specific feature.

You write the code, its tests and the plan. You never apply. A hook blocks `terraform apply`, `destroy`, `import` and `state rm` (also through wrappers), and mutating `aws` CLI calls. The user, or a pipeline that assumes an AWS role through OIDC, applies.

## Layout

```
infra/
  modules/
    network/        # reusable; no backend, no provider config
    data-store/
  envs/
    dev/            # root module: backend, provider, module calls, env values
    staging/
    prod/
```

| Goes in a module | Goes in a root (`envs/<env>`) |
|---|---|
| Resources that belong together (a service, a data store, a network) | The `backend` block and `provider` configuration |
| Variables with types and validation; outputs | Calls to modules, pinned by version |
| Secure defaults (encryption on, public access off) | Values that differ per environment (sizes, counts, CIDRs) |
| No `provider` or `backend` blocks | Data sources for things owned elsewhere (shared VPC, DNS zone) |

- One root per environment, each with its own state and its own AWS account where the tier allows. Don't use workspaces to separate prod from non-prod: they share a backend and credentials, and a wrong `workspace select` hits prod.
- Shared modules used by several repos live in their own repo and are released with tags.
- **Small scale shortcut:** one root with `envs/dev.tfvars`, `envs/prod.tfvars` and a backend config file per environment (`terraform init -backend-config=prod.s3.tfbackend`). Fine for one deployable thing at the low tier. Its limits: every environment gets the same resource shape, a provider or module upgrade hits all environments at once, and the wrong `-var-file` or backend config can target prod. Move to separate roots when environments diverge or at the high tier.

## Versions
- Set `required_version` (e.g. `">= 1.11, < 2.0"`) and pin each provider with `~>` (e.g. `aws = { source = "hashicorp/aws", version = "~> 6.0" }`).
- Commit `.terraform.lock.hcl`. Record hashes for every platform that runs Terraform, or CI and laptops disagree:
  ```
  terraform providers lock -platform=linux_amd64 -platform=darwin_arm64 -platform=windows_amd64
  ```
- Pin module sources to a tag or commit SHA: `source = "git::https://github.com/org/tf-modules.git//network?ref=v1.4.2"`, or `version = "1.4.2"` for a registry module. Never a branch.
- Provider and Terraform upgrades are their own slice, with a plan showing no unintended changes.

## State
- Remote state in S3, one bucket (or at least one key prefix and IAM boundary) per environment and account. Never local state for anything shared.
- Locking: S3 native locking with `use_lockfile = true` (added in Terraform 1.10, generally available from 1.11). On older versions, a DynamoDB lock table (`dynamodb_table`), deprecated since 1.11 and due to be removed in a future minor version.
- The state bucket has versioning, SSE-KMS with a customer-managed key, Block Public Access on, `aws:SecureTransport` enforced, and a bucket policy that allows only the deploy role, the read-only plan role and break-glass admins.
- The state bucket and lock table are bootstrapped once, by the user, outside the roots that use them. Record how in `04-develop.md`.

```hcl
terraform {
  backend "s3" {
    bucket       = "acme-tfstate-prod"
    key          = "app/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    kms_key_id   = "alias/tfstate"
    use_lockfile = true
  }
}
```

**State is sensitive.** It stores every attribute in plain text, including generated passwords and secret values read through data sources. So:
- Treat read access to state as read access to the secrets in it.
- Mark outputs `sensitive = true` when they carry secrets. This hides them from logs, not from state.
- Prefer secrets that never enter state: let the service manage them (`manage_master_user_password = true` on RDS), or create the secret resource and have the app read the value from Secrets Manager at runtime. Don't pass secret values through variables.

## Code rules
- `default_tags` on the AWS provider (owner, environment, service, cost centre, data classification), so every resource carries them.
- Every variable has a `type`, a `description`, and a `validation` block where bad values are possible (CIDRs, names, sizes). `sensitive = true` on any that must carry a secret.
- No hard-coded account IDs, ARNs or region names. Use `data.aws_caller_identity`, `data.aws_partition`, `data.aws_region`, and references to resources.
- Use data sources (or remote state outputs from the owning root) instead of copy-pasted IDs for things owned elsewhere.
- Refactor with `moved` blocks; bring existing resources under management with `import` blocks (Terraform 1.5 and later); remove with `removed` blocks (1.7 and later). These show up in the plan and get reviewed. State surgery (`terraform state mv/rm`, `terraform import`) is blocked for agents and leaves no review trail.
- Stateful resources (databases, buckets with data, KMS keys, DNS zones) get `lifecycle { prevent_destroy = true }` in prod, plus the service's own deletion protection (`deletion_protection`, S3 versioning, backups). Use `ignore_changes` only for attributes changed outside Terraform on purpose, with a comment saying why.
- Build IAM policies with `data "aws_iam_policy_document"`, not inline JSON strings. Name actions explicitly; no `*` on actions or resources unless the API requires it, with a comment. Scope with conditions (`aws:SourceArn`, `aws:SourceAccount`) on resource policies and trust policies.
- Encryption on, public access off, logging on, by default in each module. Turning one off needs a variable whose name says so and an SR-n or ADR-n reference.
- Comments link to the requirement, threat or ADR (SR-4, T-7, ADR-2) a setting exists for.

## Tests and checks
**Small scale:** assert what matters for security and deployability (IAM actions and resources, network exposure, encryption, retention and deletion protection, the service limits below), not every property the code sets. One test file per resource group is usually enough.

All of these are allowed for you. Run them before you hand back, and the devsecops-engineer wires them into the pull request gate.

| Check | Command | Catches |
|---|---|---|
| Format | `terraform fmt -check -recursive` | Style drift |
| Validate | `terraform init -backend=false && terraform validate` | Syntax, types, bad references |
| Lint | `tflint --recursive` with the `aws` ruleset plugin | Invalid instance types, deprecated arguments, naming |
| Unit tests | `terraform test` | Module behaviour (see below) |
| Security scan | `checkov -d infra` or `trivy config infra` | Unencrypted storage, open security groups, wide IAM |
| Policy as code | `terraform show -json plan.out > plan.json`, then `conftest test plan.json` (OPA) | Org rules on the planned changes, e.g. no public buckets, required tags |
| Cost | `infracost diff` | Cost jumps (useful at medium and large scale, or with cost NFRs) |

`terraform test`:
- Put `*.tftest.hcl` files in each module's `tests/` folder.
- Use `command = plan` runs for unit-style assertions. They need no real resources, and with `mock_provider "aws" {}` (1.7 and later) no credentials either.
- Runs with `command = apply` create real resources. They run only in a sandbox account, by the pipeline or the user. Never point one at a shared environment.

```hcl
mock_provider "aws" {}

run "bucket_is_private" {
  command = plan
  variables { name = "orders" }
  assert {
    condition     = aws_s3_bucket_public_access_block.this.block_public_acls == true
    error_message = "Bucket must block public ACLs (SR-6)."
  }
}
```

Write one test per SR-n or T-n mitigation the module implements, not one per resource. Scanner suppressions (`#checkov:skip=CKV_AWS_18: W-4 ...`, `.trivyignore`) follow the waiver rules in `devsecops-engineer/pipeline-gates.md`.


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

## Plan review
Produce the plan for the environment the slice targets, with the read-only plan role:

```
terraform plan -out=plan.out
terraform show -no-color plan.out > plan.txt
```

Read the summary line (`Plan: 3 to add, 1 to change, 0 to destroy`), then every resource marked `-`, `-/+` or `+/-`, and the attribute that `# forces replacement`.

Flag these to the user in your result, with the resource address and why it happens:

| Change | Why it matters |
|---|---|
| Any destroy or replace (`-/+`, `+/-`) of a stateful resource: database, bucket, file system, queue with messages, KMS key, DNS zone | Data loss or downtime. Say whether `prevent_destroy` or a snapshot covers it |
| Any IAM change: role, policy, trust policy, permission boundary, resource policy | Privilege changes; list added actions and principals |
| Security group, NACL, route table, VPC endpoint or peering changes | Network exposure and reachability |
| Anything that becomes public: `0.0.0.0/0` or `::/0` ingress, public subnets, public IPs, bucket or snapshot sharing, API without authorization | Internet exposure |
| KMS key policy, rotation or deletion-window changes; switching a resource's key | Loss of access to encrypted data |
| Changes outside the slice's resources | A sign of drift or a wrong root |

At the high tier, all of these need the security-reviewer before the gate.

In your result, give the plan summary, the flagged items, and the exact command for the user or pipeline:

```
cd infra/envs/prod && terraform apply plan.out
```

A saved plan applies only with the same Terraform and provider versions and fails if state changed since the plan, so plan again if anything else was applied. The plan file contains sensitive values: don't commit it; the pipeline keeps it as a short-lived, access-controlled artifact.

## Drift
- Schedule `terraform plan -detailed-exitcode -lock=false` per environment (e.g. daily) in the pipeline, using the read-only role. Exit code 0 is no changes, 1 is an error, 2 is drift or unapplied changes. Exit 2 opens a ticket.
- For each drifted resource, decide with the user:
  - **Codify:** the manual change was right. Update the code so the next plan shows no changes, in a slice.
  - **Revert:** the manual change was wrong. The next apply restores the code's version. If it touched IAM, security groups or encryption, treat it as a possible incident (see `sre/incident-response.md`).
- Don't add `ignore_changes` to make drift disappear unless the attribute is meant to be managed elsewhere (e.g. autoscaling desired count).

## Before you hand back
- [ ] `fmt`, `validate`, `tflint`, `terraform test` and the security scan pass
- [ ] Versions and module sources pinned; lock file has all platforms
- [ ] No hard-coded account IDs, ARNs or secrets; outputs with secrets are `sensitive`
- [ ] Stateful resources protected in prod
- [ ] Plan produced, summarized, and destroys, replacements, IAM, network and public changes flagged
- [ ] The apply command written out for the user; nothing applied
- [ ] Suppressions listed in `04-develop.md` with waiver IDs

Facts checked against primary sources on 2026-10-14.
