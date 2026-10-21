# IaC security review

Use in code mode on `infra/**` (Terraform, CDK in TypeScript or Python) and on plan or diff output (`terraform show -json tfplan`, `cdk diff`, a CloudFormation change set). Read the code for intent and the plan for what will actually change. For CDK, review the synthesised template in `cdk.out/` too: L2 constructs add IAM statements and defaults that the source doesn't show.

Report each issue as a finding with severity, evidence (file and line, or plan resource address) and a required action. Severities below are defaults; raise them for restricted data or internet-facing resources, and lower them for dev-only sandboxes with no real data (say why).

## IAM

- `Action: "*"` or `Resource: "*"` on a write action. Allowed only for actions that don't support resource-level permissions, and then scoped by condition.
- `iam:PassRole` with `Resource: "*"`: a principal can pass any role, including admin, to a service it controls. Scope to named role ARNs and add `iam:PassedToService`.
- Other escalation paths: `iam:CreatePolicyVersion`, `iam:AttachRolePolicy`, `iam:PutRolePolicy`, `iam:UpdateAssumeRolePolicy`, `sts:AssumeRole` on `*`, `lambda:UpdateFunctionCode` on privileged functions.
- Trust policies: no `Principal: "*"` or `AWS: "*"` without conditions. Cross-account trust needs `sts:ExternalId` (third parties) or `aws:PrincipalOrgID`. Service trust needs `aws:SourceArn` / `aws:SourceAccount` against confused deputy.
- CI OIDC trust: `token.actions.githubusercontent.com:sub` pinned to the repo and to a branch or environment, never `repo:org/*` or `*`. Repositories created, renamed or transferred after 15 July 2026 send GitHub's immutable form (`repo:org@<owner-id>/repo@<repo-id>:...`); a condition in the old form simply never matches them.
- Roles that developers or CI can create should carry a permission boundary (moderate and high).
- Long-lived access keys for IAM users in code: should be roles.

Severity: wildcard admin, unscoped PassRole, open trust or broad OIDC trust: **critical** at moderate/high, **high** at low. Missing boundary or over-broad read: **medium**.

## Network exposure

- Security groups with `0.0.0.0/0` or `::/0` ingress on anything except 443/80 on a load balancer. SSH/RDP open to the internet.
- Databases, caches, OpenSearch domains or EKS API endpoints in public subnets or with public access enabled.
- S3: Block Public Access off at bucket or account level; bucket policies with `Principal: "*"` and no condition; ACLs other than private.
- RDS `publicly_accessible = true`; public snapshots or AMIs; OpenSearch with an open access policy.
- Missing VPC endpoints where the design says traffic stays private.

Severity: public data store or public snapshot: **critical**. Admin port open to the internet: **high**. Over-broad internal CIDR: **medium**.

## Encryption

- Storage at rest: S3, EBS, RDS/Aurora, DynamoDB, EFS, SQS, SNS, Kinesis, OpenSearch, backups. Use KMS customer-managed keys where the tier or data class requires it.
- KMS key policies: no `kms:*` to `Principal: "*"`; key rotation on; key admin separate from key users at high tier.
- In transit: TLS-only bucket policy (`aws:SecureTransport`), HTTPS listeners with a current TLS policy, `rds.force_ssl`, OpenSearch enforce HTTPS.

Severity: restricted data unencrypted: **high**. Missing CMK where only AWS-managed is used and the tier needs CMK: **medium**.

## Logging

- CloudTrail: multi-region, log file validation on, delivered to a bucket in a log or security account (or at least with restricted delete).
- VPC flow logs; S3 server access or CloudTrail data events for sensitive buckets; ALB/CloudFront access logs; API Gateway and WAF logs.
- Log retention set (not "never expire" by default, not shorter than compliance needs).

Severity: CloudTrail off or deletable by the app role: **high**. Missing flow or access logs: **medium** (high at high tier).

## Secrets

- No secrets in `.tf`, `.tfvars`, CDK context, `cdk.json`, environment variables in task or function definitions, or user data.
- Not in Terraform outputs (unless `sensitive = true`, and even then they still sit in state) and not in CloudFormation outputs or parameters without `NoEcho`.
- State holds secrets in clear text: state must be encrypted and access-limited. Prefer generating secrets in Secrets Manager and referencing them by ARN.

Severity: a live secret in code or output: **critical**, and treat it as compromised (rotate). Secret in encrypted state with tight access: **low**.

## Destructive changes in the plan

- Any `delete` or `replace` (`-/+`, `+/-`) on a stateful resource: databases, buckets, file systems, KMS keys, log groups, Cognito user pools, DynamoDB tables.
- Changes that force replacement silently: renaming a resource, changing `identifier`, engine, subnet group or encryption settings.
- `moved` / `import` blocks or CDK logical ID changes that would otherwise destroy and recreate.

Severity: data loss in prod: **critical** (block until the plan is changed or the user explicitly accepts with a backup confirmed). In non-prod: **low**, mention it.

## Deletion protection and retention

- Prod stateful resources: `deletion_protection = true`, `prevent_destroy` lifecycle, CDK `RemovalPolicy.RETAIN` or `SNAPSHOT`, S3 versioning, backups with retention matching the RPO, final snapshot on delete.
- KMS key deletion window not shortened.

Severity: **high** for prod stores of restricted or business-critical data; **medium** otherwise.

## Tags and drift-prone patterns

- Required tags (`env`, `owner`, `app`, `cost-center`, and data class where used) via provider `default_tags` or CDK `Tags.of`.
- Resources referenced by ID or `data` source that no IaC creates (made by hand), hard-coded ARNs and account IDs, `ignore_changes` on security-relevant attributes, scripts or `local-exec` that change resources outside the plan.

Severity: missing tags: **low**. `ignore_changes` hiding a security attribute, or security resources created outside IaC: **medium**.

## Scanner suppressions

Every `#checkov:skip` (or Checkov `Metadata` skip in CloudFormation), `#tfsec:ignore`, `# trivy:ignore`, cdk-nag suppression (`Validations.of(...).acknowledge()` in cdk-nag v3, `NagSuppressions` in v2) or `.checkov.yaml` skip must cite a waiver ID (`W-n`) and an expiry in its reason. cdk-nag suppressions take a `reason` string; put the waiver there. Trivy also takes the expiry in the comment itself (`#trivy:ignore:<id>:exp:yyyy-mm-dd`). Flag any suppression without one (**medium**, or the severity of the suppressed rule if higher).

Facts checked against primary sources on 2026-10-14.
