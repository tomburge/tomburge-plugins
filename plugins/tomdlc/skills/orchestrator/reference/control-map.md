# TomDLC control map

How each TomDLC stage lines up with common frameworks. Use it to answer "does this cover X?" questions and to cite controls in stage outputs.

## NIST SSDF (SP 800-218) by stage

| SSDF practice | Description | TomDLC stage |
|---------------|-------------|--------------|
| PO.1 | Define security requirements for software development | Plan, Requirements |
| PO.2 | Implement roles and responsibilities | Plan |
| PO.3 | Implement supporting toolchains | Plan, Develop |
| PO.4 | Define and use criteria for software security checks | Plan (criteria), every gate (use) |
| PO.5 | Implement and maintain secure environments for software development | Develop, Deploy |
| PS.1 | Protect all forms of code from unauthorized access and tampering | Develop |
| PS.2 | Provide a mechanism for verifying software release integrity | Deploy |
| PS.3 | Archive and protect each software release | Deploy |
| PW.1 | Design software to meet security requirements and mitigate security risks | Design |
| PW.2 | Review the software design to verify compliance with security requirements and risk information | Design |
| PW.4 | Reuse existing, well-secured software when feasible | Design, Develop |
| PW.5 | Create source code by adhering to secure coding practices | Develop |
| PW.6 | Configure the compilation, interpreter and build processes to improve executable security | Develop |
| PW.7 | Review and/or analyze human-readable code to identify vulnerabilities | Develop |
| PW.8 | Test executable code to identify vulnerabilities | Test |
| PW.9 | Configure software to have secure settings by default | Design, Deploy |
| RV.1 | Identify and confirm vulnerabilities on an ongoing basis | Maintain |
| RV.2 | Assess, prioritize and remediate vulnerabilities | Maintain |
| RV.3 | Analyze vulnerabilities to identify their root causes | Maintain |

## OWASP SAMM business functions

| SAMM function | Practices | TomDLC stages |
|---------------|-----------|---------------|
| Governance | Strategy & Metrics, Policy & Compliance, Education & Guidance | Plan |
| Design | Threat Assessment, Security Requirements, Secure Architecture | Requirements, Design |
| Implementation | Secure Build, Secure Deployment, Defect Management | Develop, Deploy |
| Verification | Architecture Assessment, Requirements-driven Testing, Security Testing | Design, Test |
| Operations | Incident Management, Environment Management, Operational Management | Maintain |

## Supporting standards

| Standard | Used in | For |
|----------|---------|-----|
| OWASP ASVS 5.0 | Requirements, Test | Security requirement catalogue and verification levels (L1/L2/L3); cite IDs with the version (`v5.0.0-...`) |
| STRIDE | Design | Threat categories per element and data flow |
| OWASP Top 10 / CWE Top 25 | Develop, Test | Code review and testing focus |
| SLSA | Develop, Deploy | Build integrity and provenance levels |
| CycloneDX / SPDX | Develop, Deploy | SBOM formats |
| CVSS / EPSS / CISA KEV | Maintain | Vulnerability prioritization |
| DORA metrics | Plan (baseline), Maintain (measure) | Throughput: deployment frequency, change lead time, failed deployment recovery time (which replaced MTTR). Instability: change fail rate, deployment rework rate (unplanned deployments to fix production issues) |
| Google SRE SLOs | Requirements, Maintain | Reliability targets and error budgets |

## Risk tier scaling

| Activity | Low | Moderate | High |
|----------|-----|----------|------|
| ASVS level | L1 | L2 | L3 (or L2 plus targeted L3) |
| Threat model | Lightweight STRIDE list | Full STRIDE on the data flow diagram | STRIDE plus attack trees for crown-jewel assets, reviewed by someone outside the team |
| Code review | 1 reviewer | 1 reviewer plus security-reviewer agent on sensitive paths | 2 reviewers, one security-focused, on every change |
| Security testing | SAST + SCA + secrets in CI | Adds DAST and IaC scanning | Adds fuzzing and an independent pen test before first release |
| Build integrity | Pinned dependencies | SBOM and signed artifacts | SLSA L3 provenance and verified at deploy |
| Remediation SLA (critical / high) | 30 / 90 days | 14 / 30 days | 7 / 14 days, KEV within 72 hours |
| Discovery | Only if the problem is unvalidated or the user asks | New products and significant features with unvalidated problems | Same, plus an explicit comparison with buying and with doing nothing |
| Completeness checklist | Primary entities and user types | Every entity and user type | Every entity and user type |
| Edge-case sweep | Main flows, surfaces that obviously apply | Every flow and component, every surface | Every flow and component, every surface, plus failure combinations |
| Codebase analysis (existing code) | Stack, commands, components, entry points | Every section; entry points and auth in depth | Every section in depth for sensitive components; end-to-end data flow traces |
| Delivery slices | One slice is fine for small work | Walking skeleton plus slices of reviewable size | As moderate; every slice touching sensitive data gets its own security review |
| Test baseline (existing code) | Required | Required | Required, plus coverage recorded |
| WCAG target (UI) | 2.2 AA for public-facing UI; A plus full keyboard operability for internal tools | 2.2 AA | 2.2 AA, plus a manual audit before the first release |
| Functional design | Money, permissions and stateful entities only | Every component with business logic | Everything, with worked examples for every calculation |
| Design review scope | Security | Security plus pillar review | Security plus pillar review |
| DR strategy (region loss) | Backup and restore, with backups copied to a second region | Pilot light (or backup and restore if the RTO allows), DR region recorded | Warm standby (active-active only when the SLO needs it), region failover drilled twice a year |
| Environment set (when `platform` is set) | `dev` or `dev-prod` | `dev-prod` or `dev-stage-prod` | `dev-stage-prod` |
| AWS accounts (when `platform` is set) | One account is acceptable, with budgets and the detection baseline | Separate production and non-production accounts in an AWS Organization, with SCP guardrails | A landing zone: separate security and log-archive accounts, org CloudTrail, SCPs, region allowlist |
| IaC checks (when `platform` is set) | fmt, validate, lint, IaC security scan | As low, plus IaC unit tests (`terraform test` or CDK assertions) and policy-as-code on the plan | As moderate, plus a second reviewer for IAM and network changes, and signed or stored plan artifacts |
| Infrastructure apply (when `platform` is set) | By the user or the pipeline, from a reviewed plan | Pipeline with an OIDC role and a manual approval for production | As moderate; production applies only from the pipeline, never from a laptop |
| Drift and posture checks (when `platform` is set) | Monthly drift check; Security Hub FSBP on | Weekly drift check; Security Hub, Config, GuardDuty, Access Analyzer reviewed monthly | Daily drift check; CIS standard added; console changes treated as incidents |
| Pillar review in Maintain | None | Every 12 months and after a major change | Every 12 months and after a major change, plus after any SEV1 or SEV2 incident |
| Independent quality review (reviewer) | None | One pass each at Requirements and Design, and one code-mode pass over the change before the Develop gate; open critical and high findings block | At Requirements, Design and every slice in code mode, repeated until READY (within the fix-loop limit) |
| Parallel slices | Optional | Optional, up to 3 at once | Optional, up to 3 at once; each slice still reviewed before merge |
| Developer plan checkpoint | Only when the escalation rules apply | Slices with a required security review, and every slice of a change whose Design was skipped | Every slice |
| Traceability check (`check-trace.ts`) | At each gate from Requirements on | At each gate from Requirements on | At each gate, and by the reviewer in code mode |
| Risk register review | At each gate | At each gate, and in the monthly health check | At each gate, and in a health check every two weeks |
| Coverage and mutation | Critical paths tested | No decrease; around 70% line coverage | 80% line plus branch coverage on critical modules; mutation testing there |
| Performance test shapes | Short load test on critical endpoints | Load, spike and a short soak | Load, stress, spike, soak and autoscaling; 2× headroom |
| Recovery drills | Restore drill before first release | Restore drill before first release and yearly; yearly game day | Restore drill before first release and quarterly; quarterly game days; yearly region failover |
| Threat model refresh | On architecture or auth changes | Also every 12 months | Also every 12 months, and after every security incident |
