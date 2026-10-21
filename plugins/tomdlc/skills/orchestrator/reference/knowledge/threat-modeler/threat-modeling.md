# Threat modeling

**Fit the scale in your brief.** At the small scale, do one STRIDE pass per trust boundary, merge threats that share a mitigation into one entry, and put low-rated threats in a single table without write-ups. Usually about 20 threats or fewer is enough for a small system. Every control the tier requires still needs a threat or SR behind it; what shrinks is the write-up, not the coverage.

## Elements people forget
Include these in the data flow diagram when they exist. Attackers go after them because they're often less defended than the application:
- **The CI/CD pipeline and build system:** source repository, runners, artifact registry, deployment credentials
- Admin interfaces, support and back-office tools, feature-flag consoles
- Webhooks, OAuth redirect URIs and other callbacks from third parties
- WebSockets and long-lived connections
- Background jobs, scheduled tasks and queue consumers
- Third-party scripts loaded in the browser
- The observability pipeline: logs and traces often contain sensitive data
- Backups and their storage
- The secrets manager and key management
- Machine identities and service-to-service calls

## STRIDE prompts

| Category | Ask | Typical mitigations |
|---|---|---|
| Spoofing | Can someone pretend to be a user, a service or a webhook sender? | Strong authentication, MFA, mutual TLS or signed requests between services, webhook signature verification |
| Tampering | Can data, code or configuration be changed in transit, at rest or in the pipeline? | TLS, integrity checks, signed artifacts, provenance verification, least-privilege write access |
| Repudiation | Could someone deny an action, and could you prove otherwise? | Audit logs that are tamper-evident and record actor, action, time and outcome |
| Information disclosure | Where could data leak: responses, errors, logs, caches, backups, side channels? | Authorization on every read, field filtering, encryption, log scrubbing |
| Denial of service | What's expensive to call, and can it be called a lot? | Rate limits, input size limits, timeouts, quotas, autoscaling with caps |
| Elevation of privilege | Can a user reach operations or data beyond their role or tenant? | The authorization matrix enforced server-side, deny by default, tenant isolation |

**Supply chain:** dependency confusion, typosquatted packages, compromised maintainers, poisoned build caches, and unpinned actions. Mitigate with pinning, lockfiles, private registries with scoped names, SLSA provenance and review of pipeline changes.

**Systems that use AI models:**
- prompt injection through any content the model reads
- data exfiltration through tool use
- trusting model output as code or commands
- excessive agency: tools that do more than the task needs

Use the OWASP Top 10 for LLM Applications as a checklist.

## Agentic systems
When the system includes agents (an LLM that plans and calls tools, has memory, or works with other agents), also run through the **OWASP Top 10 for Agentic Applications for 2026** (genai.owasp.org, published December 2025), alongside the Top 10 for LLM Applications. Its categories, as prompts:

| ID | Risk | Ask |
|---|---|---|
| ASI01 | Agent goal hijack | Can content the agent reads (web pages, documents, email, tool output) change its objective? |
| ASI02 | Tool misuse and exploitation | Can the agent be led to call a legitimate tool in a harmful way, or chain tools into one? |
| ASI03 | Identity and privilege abuse | Whose credentials does each tool call use, and are they narrower than the user's? |
| ASI04 | Agentic supply chain | Are tools, plugins, MCP servers, prompts and models pinned, reviewed and from trusted sources? |
| ASI05 | Unexpected code execution | Can generated code or commands run, and in what sandbox? |
| ASI06 | Memory and context poisoning | Can someone write into the agent's memory, retrieval store or long-lived context? |
| ASI07 | Insecure inter-agent communication | Are messages between agents authenticated, and is one agent's output treated as data by the next? |
| ASI08 | Cascading failures | Can one agent's error or loop spread to others or exhaust shared budgets? |
| ASI09 | Human-agent trust exploitation | Could the agent's output persuade a person to approve something harmful? |
| ASI10 | Rogue agents | Can an agent act outside its intended scope, and would anyone notice? |

Category names are from secondary summaries of the list; check the official document for the current wording and mitigations.

## Cloud (AWS) prompts
**Admin-level threats:** anything that needs administrator access to the account (or the power to change its IAM, code or config) is one class. At the low tier, model it as one threat with one residual for the user to accept, plus near-free detection; don't list each variant. At the moderate and high tiers, the mitigation is account separation.

Treat the AWS control plane (IAM, the deploy role, the state bucket) as part of the data flow diagram. Ask:

| Category | Ask | Typical mitigations |
|---|---|---|
| Spoofing | Can another account or service assume our roles (confused deputy)? Can any branch, fork or repo get the CI OIDC role? | `sts:ExternalId` for third parties, `aws:SourceArn` / `aws:SourceAccount` on service trust, `aws:PrincipalOrgID`; OIDC `sub` pinned to repo and branch or environment |
| Tampering | Can a workload or CI job change infrastructure, IAM or the IaC state? Can the instance metadata service be reached through SSRF? | Least-privilege deploy roles per environment, encrypted and locked state with narrow access, IMDSv2 required (hop limit 1), SCPs |
| Repudiation | Could someone disable or delete CloudTrail, or change logs? | Org-wide multi-region trail into a separate log account, log file validation, S3 Object Lock, alert on `StopLogging` / `DeleteTrail` |
| Information disclosure | Can a bucket, snapshot, AMI or OpenSearch domain become public? Does a KMS key policy grant `kms:*` too widely? | Account-level Block Public Access, Access Analyzer external access, key policies naming specific principals, SCP denying public sharing |
| Denial of service | Can a region or service outage take us down? Can an attacker or a bug run up the bill (denial of wallet)? | Multi-AZ, a region plan matching the RTO, service quotas checked; budgets and anomaly alerts, concurrency and autoscaling caps, WAF rate limits |
| Elevation of privilege | Can a role use `iam:PassRole`, `iam:CreatePolicyVersion` or `iam:AttachRolePolicy` to gain admin? Are wildcards on write actions? | Scoped PassRole with `iam:PassedToService`, permission boundaries, no `*` on write actions, Access Analyzer unused access reviews |

## Rating risk

| Likelihood ↓ / Impact → | Low | Medium | High |
|---|---|---|---|
| **High** | Medium | High | Critical |
| **Medium** | Low | Medium | High |
| **Low** | Low | Low | Medium |

- **Likelihood** rises with exposure (internet-facing, unauthenticated), ease (no special skill, public exploits) and attacker interest.
- **Impact** follows the data classification and business effect: restricted data, money movement or safety push impact to high.

## When to refresh the model
Ask the orchestrator to re-dispatch you, or note it in Handoffs, when:
- a new entry point, integration or data store is added
- authentication or authorization changes
- a new data class is introduced
- the architecture or trust boundaries change
- an incident or security finding reveals a threat that wasn't modeled
- 12 months have passed since the last review (moderate and high tiers)

Record the review date and what triggered it at the top of `03-threat-model.md`.

Facts checked against primary sources on 2026-10-14.
