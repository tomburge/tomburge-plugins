# AWS foundations

Defaults for the AWS platform under a workload. Use them in Design with the architect, in Develop when writing IaC slices, at Deploy when preparing plans, and in Maintain for drift and posture checks.

## How to use these defaults
- The tier sets the baseline (see `../../tuning.md`). Scale changes how much is written about it, never the controls.
- Record the platform in `docs/sdlc/03-design.md`: accounts, network, identity, data protection, logging, cost estimate and quotas. Write an ADR for account structure, region choice, compute choice and anything hard to reverse.
- Link each control to the SR-n or NFR-n it satisfies and the T-n it mitigates. A platform control with no requirement behind it is either missing a requirement or not needed.
- A weaker setting than the tier's default needs a waiver (W-n) with an owner and an expiry. A stronger one just needs a reason.
- You never apply. At Deploy, hand over the `terraform plan` output (saved plan file plus a readable summary) or the `cdk diff` and synthesized template, with every destroy, replace and IAM or security group change called out. The user or the pipeline applies.

## 1. Account structure

| | Low | Moderate | High |
|---|---|---|---|
| Accounts | One workload account is acceptable at the small scale; prod and non-prod accounts preferred (they cost nothing) | AWS Organizations; separate prod and non-prod workload accounts at minimum | Landing zone with Control Tower (or an equivalent such as Landing Zone Accelerator): Security OU with log-archive and audit accounts; Workloads OU with prod and non-prod; Sandbox OU |
| Guardrails | Root MFA, no root access keys, a budget | SCP baseline below | SCP baseline plus Control Tower mandatory and strongly recommended controls |
| Security tooling | In the workload account | Delegated admin in one account | Delegated admin in the audit account |

- Never run workloads in the management account. SCPs don't apply to it.
- At the large scale, use one account per service or team per environment, so blast radius and cost follow ownership.
- **Single account (low, small):** the risk accepted is that a non-prod mistake or a leaked non-prod credential can reach prod data, and there are no SCP guardrails. Record it in the risk register and the account ADR, with the trigger to split (prod data classified confidential or above, a second team, the tier rising).

SCP baseline, attached to every workload OU:
- deny `organizations:LeaveOrganization`
- deny stopping or deleting CloudTrail, GuardDuty, Config and Security Hub, and changing their settings, except by the security role
- region allowlist on `aws:RequestedRegion`, with `NotAction` exemptions for global services (IAM, Organizations, STS, CloudFront, Route 53, Budgets, Support)
- deny actions by the root user (`aws:PrincipalArn` matching `arn:aws:iam::*:root`); at high, also use centralized root access management to remove member-account root credentials
- deny turning off S3 Block Public Access and EBS default encryption

Test each SCP in a sandbox account before attaching it to prod. A wrong SCP is an outage.

## 2. Identity

- **People:** IAM Identity Center with the organization's identity provider; MFA enforced; permission sets per job (read-only, developer in non-prod, operator in prod). No IAM users and no long-lived access keys. An IAM user needs a waiver.
- **CI:** GitHub Actions OIDC (or the CI system's equivalent) assumes a role. The trust policy checks `aud` = `sts.amazonaws.com` and pins `sub` to the repo plus the branch or GitHub environment, for example `repo:org/app:environment:prod`. Repositories created, renamed or transferred after 15 July 2026 (or opted in) use GitHub's immutable format with owner and repo IDs, `repo:org@<owner-id>/app@<repo-id>:environment:prod`; match the format the repo's tokens carry. Never a wildcard over the org or repo.
- **Separate plan and apply roles per account.** The plan role is read-only plus state access and runs on pull requests. The apply role is assumable only from the protected branch or environment with required reviewers. Agents get the plan role at most.
- **Least privilege:** no `*:*`, no `Action: "*"` on `Resource: "*"`. Scope actions to the resources the service uses. Wildcards need a comment saying why; IaC scanning flags the rest.
- **Roles created by IaC** carry a permission boundary that stops them from exceeding the workload's scope or creating roles without the same boundary. The apply role can create roles only with that boundary attached.
- **Workload identity:** one role per function, task or service. No shared roles across services.
- **Break glass:** one or two emergency principals per prod account, credentials and MFA held offline by two named people, every use alarmed (EventBridge rule on sign-in) and reviewed afterwards. Test the procedure yearly at moderate, twice a year at high.

## 3. Network

- One VPC per environment and account. Plan CIDRs once for the whole estate: non-overlapping across environments, regions and on-premises ranges, /16 per VPC with room to grow. At the large scale, use VPC IPAM.
- Subnets in three tiers: public (load balancers and NAT only), private (compute), isolated (databases, no route out). Spread across 2 AZs at low and moderate, 3 at high.
- **Egress:** gateway endpoints for S3 and DynamoDB in every VPC (they're free). Add interface endpoints (ECR, CloudWatch Logs, Secrets Manager, STS, KMS) when traffic through NAT costs more than the endpoints, or when isolated subnets need the service. NAT gateway: one per AZ in prod at high (so an AZ loss doesn't cut egress), one shared in non-prod.
- **Security groups reference other security groups**, not CIDRs, inside the VPC. No `0.0.0.0/0` or `::/0` ingress except on 443 (and 80 for redirect) to a load balancer, or through CloudFront using its managed prefix list. No SSH or RDP from the internet; use SSM Session Manager.
- VPC flow logs to S3: rejected traffic at low, all traffic at moderate and high.
- **No VPC** when the workload is serverless with no private resources (Lambda, API Gateway, DynamoDB, S3). Putting Lambda in a VPC without a reason adds NAT cost and cold-start latency. Add a VPC when a private data store or private connectivity needs one.

## 4. Data protection

| | Low | Moderate | High |
|---|---|---|---|
| Encryption at rest | AWS-managed keys | Customer-managed KMS keys for confidential data and above | Customer-managed keys for every data store, one key per data class or service |
| Key policy | Default | Key admins separate from key users; no `kms:*` for workload roles | As moderate; key deletion denied by SCP except by the security role; 30-day deletion window |
| Rotation | Automatic (AWS-managed) | Automatic yearly | Automatic yearly, or shorter where compliance requires |

- S3 Block Public Access on at the account level; Object Ownership set to bucket owner enforced (ACLs off). Public content is served through CloudFront with origin access control, not a public bucket.
- EBS default encryption on in every region used.
- In transit: TLS 1.2 or later everywhere, TLS 1.3 policies on load balancers (`ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09`, the one AWS recommends; set it explicitly, because CloudFormation, CDK and the CLI default to `ELBSecurityPolicy-2016-08`), `TLSv1.2_2021` on CloudFront, certificates from ACM with DNS validation. Enforce TLS on S3 with `aws:SecureTransport` and on RDS with `rds.force_ssl`.
- **Secrets:** Secrets Manager for credentials that rotate (database passwords, third-party API keys); use RDS-managed master passwords. SSM Parameter Store `SecureString` for configuration and non-rotating values. Rotate database credentials every 90 days at moderate, 30 at high. No secrets in IaC variables, state outputs, environment files or the repo.
- **IaC state** holds secrets and resource IDs: one encrypted, versioned S3 state bucket per account with Block Public Access and locking (S3 native locking or a DynamoDB table); access limited to the plan and apply roles. CDK: the bootstrap stack's roles and bucket are protected the same way.

## 5. Logging and detection

| Service | Low | Moderate | High |
|---|---|---|---|
| CloudTrail | Multi-region trail, log file validation | Organization trail, log file validation, KMS-encrypted | Organization trail to the log-archive account, S3 Object Lock, data events for buckets holding confidential data |
| AWS Config | Prod account, periodic recording | All accounts, continuous recording in prod | All accounts and regions in use, aggregated in the audit account, conformance packs |
| GuardDuty | On | On in all accounts, delegated admin | As moderate, with S3, EKS, RDS and Lambda protection where those services are used |
| Security Hub CSPM | Foundational Security Best Practices (FSBP) | FSBP in all accounts, aggregated | FSBP and CIS AWS Foundations Benchmark v5.0.0 |
| IAM Access Analyzer | External access analyzer | Organization-wide | Organization-wide, plus unused access analyzer |
| Log retention (trail and audit) | 1 year | 1 year hot, 3 years archive | 1 year hot, archive for the compliance period (often 7 years) |

- Every CloudWatch log group has an explicit retention. "Never expire" is a finding. Application log retention follows `../shared/observability.md`.
- Critical and high findings from GuardDuty and Security Hub alert someone (EventBridge to the on-call channel), with a runbook.

## 6. Service selection

Prefer managed services. Compute, in order of preference:

| Choose | When | Not when |
|---|---|---|
| Lambda | Event-driven or spiky work, under 15 minutes per invocation | Steady high throughput (cost), long-running work, latency-critical paths sensitive to cold starts |
| App Runner | Only for accounts already using it: closed to new customers since 30 April 2026 (AWS points to ECS Express Mode instead) | New workloads; fine control over networking, sidecars or scaling |
| ECS on Fargate | The default for containers: services, workers, scheduled tasks | Very large steady fleets where EC2 capacity is much cheaper |
| EKS | Only with a reason in an ADR: existing Kubernetes skills and tooling, portability that's actually required, or many services needing its ecosystem | One team with a few services |
| EC2 | Last: special hardware, licensing, or software that can't run in the above | Anything the above can run |

Data stores: DynamoDB for key-value and known access patterns at any scale; RDS PostgreSQL (or Aurora when you need its failover, read scaling or storage growth) for relational data and ad hoc queries; S3 for objects, files and archives. Multi-AZ for prod databases at moderate and high; point-in-time recovery on by default.

**Graviton (arm64) by default** for Lambda, Fargate, RDS and EC2, unless a dependency has no arm64 build. Check that in the first slice.

## 7. Tagging and cost

- **Mandatory tags** on every resource, applied by IaC (`default_tags` in the Terraform provider; `Tags.of(app).add` in CDK): `owner`, `environment`, `service`, `data-class`, `cost-center`. Put the change ID (`CH-n`) on the stack or deployment, not on every resource, so tags don't churn on each apply. Activate them as cost allocation tags. At moderate and high, enforce with Organizations tag policies and an IaC scan rule.
- **AWS Budgets** per account (per environment in a single account), alerting at 50%, 80% and 100% of forecast to the owner. Cost Anomaly Detection on every account at moderate and high.
- **Estimate per environment** in `03-design.md`: a table of the main line items with monthly cost, or an AWS Pricing Calculator link, compared with the budget in `01-plan.md` (see the architect's `architecture-method.md`, section 6).
- Cost traps to check in every design and every Maintain review:

| Trap | Default |
|---|---|
| NAT gateway data processing | Gateway endpoints always; interface endpoints for high-volume AWS traffic; check NAT bytes monthly |
| Cross-AZ and cross-region traffic | Keep chatty components in one AZ path where the SLO allows; replicate across regions only for a recovery NFR |
| Idle non-prod | Schedule non-prod compute and databases off outside working hours; tear down ephemeral environments when their PR closes |
| Log ingestion and retention | Explicit retention; sample debug logs; S3 lifecycle to cheaper tiers for audit logs |
| Over-provisioned RDS | Start small, scale on measured CPU, memory and connections; review rightsizing quarterly |

## 7a. Regions and disaster recovery

**Choosing regions:** data residency or sovereignty limits first, then latency to users, then service availability (check that every service and feature the design uses exists in both regions), then cost. Record the primary region per environment and the DR region in `environments` (`region`, `drRegion`) and an ADR. Keep the region allowlist SCP in step.

**Mechanisms by strategy** (see the HA/DR strategy table in the NFR templates):

| Strategy | Data | Compute and config | Traffic |
|---|---|---|---|
| Backup and restore | AWS Backup with cross-region copy (and vault lock at high); S3 versioning plus cross-region replication for critical buckets | IaC parameterised by region; CDK bootstrap or Terraform state available in the DR region | Manual DNS change |
| Pilot light | DynamoDB global tables, Aurora Global Database or RDS cross-region read replicas, S3 CRR | Stacks deployed in the DR region with compute at zero or minimal | Route 53 failover records with health checks |
| Warm standby | As pilot light | Full stack running small in the DR region; scaling configured | Route 53 failover or weighted routing |
| Active-active | Global tables or a multi-writer design with conflict rules | Full stack in both regions | Latency-based or geolocation routing, health-checked |

**Things that break failovers:** KMS keys are regional (use multi-Region keys or keys in both regions); secrets and SSM parameters must be replicated; ACM certificates for CloudFront live in us-east-1 only; IAM is global, but service-linked roles and quotas are per region; the CDK bootstrap and Terraform state must exist in the DR region before you need them; alarms and logs must cover the DR region too. Each of these is a check in the region failover drill.

## 8. Well-Architected

The security-reviewer's pillar review asks the questions in `../security-reviewer/pillar-review.md`. For AWS workloads, it uses this file as the evidence to check them against:

| Pillar | Checks here |
|---|---|
| Security | Sections 1, 2, 3 (security groups, ingress), 4, 5 |
| Reliability | Multi-AZ subnets and NAT (3), Multi-AZ databases and PITR (6), quotas (9) |
| Performance efficiency | Service selection (6), endpoints instead of NAT hops (3) |
| Cost optimization | Tags, budgets, estimate, cost traps (7); Graviton (6) |
| Operational excellence | Everything in IaC; plan and apply roles (2); drift checks below |
| Sustainability | Idle non-prod schedules, bounded retention (5, 7); Graviton and managed services (6) |

In Maintain, check drift with the plan role (`terraform plan -detailed-exitcode` or `cdk diff` against each environment) and report any difference as a finding. Report Security Hub score changes and new critical or high findings since the last review.

## 9. Service quotas

- List in `03-design.md` the quotas the design depends on at its expected peak, with the current value per account and region. Common ones: Lambda concurrent executions, API Gateway throttling, Fargate vCPUs, VPCs, Elastic IPs and NAT gateways per region, RDS instances, SES sending limits (and leaving the SES sandbox).
- Request increases before launch. They can take days, and new accounts often start below the documented defaults.
- Alarm at 80% of each listed quota through CloudWatch usage metrics (`AWS/Usage`) or Service Quotas alarms.

Facts checked against primary sources on 2026-10-14.
