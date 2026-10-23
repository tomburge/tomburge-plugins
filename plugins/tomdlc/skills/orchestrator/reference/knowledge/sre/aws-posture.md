# AWS security posture (Maintain)

In Maintain, check the live AWS accounts against the design and the tier, using read-only calls. Record results in `.tomdlc/07-operations.md` and report each issue as a finding.

## Sources

| Source | What it tells you | Tier |
|---|---|---|
| Security Hub CSPM (formerly Security Hub): AWS Foundational Security Best Practices (FSBP) | Misconfigured resources across services | All tiers, if Security Hub CSPM is enabled |
| Security Hub CSPM: CIS AWS Foundations Benchmark (v5.0.0, the version AWS recommends) | Account-level baseline (root, CloudTrail, IAM, monitoring) | High (moderate if the plan asks) |
| AWS Config rules and conformance packs | Per-resource compliance, history of changes | Moderate and high |
| GuardDuty | Active threats: credential misuse, crypto-mining, unusual API calls | All tiers where enabled; required at moderate and high |
| IAM Access Analyzer | External access (resources shared outside the account or org) and unused access (roles, keys, permissions not used) | External: all tiers. Unused: moderate and high |
| Trusted Advisor | Security and cost checks (full set needs Business Support+ or higher) | Optional |
| Prowler, run with a read-only role (`SecurityAudit` + `ViewOnlyAccess`) | A broad scan when Security Hub isn't enabled, or a second opinion | Optional; useful at low tier |

If a source is not enabled, say so as a finding (enabling it is a change the user makes in IaC). Don't enable it yourself.

## Cadence

| Tier | Posture check | Also |
|---|---|---|
| Low | Monthly, and after each infra change | Access Analyzer external access |
| Moderate | Weekly summary, GuardDuty high findings as they arrive | Unused access review quarterly |
| High | Daily summary, GuardDuty and critical Security Hub findings routed to on-call | Unused access review monthly; CIS benchmark |

## Mapping into the findings register

Report each issue; the orchestrator assigns `F-n` and adds it with `source: "scanner:<tool>"`: `scanner:securityhub`, `scanner:config`, `scanner:guardduty`, `scanner:access-analyzer`, `scanner:trusted-advisor`, `scanner:prowler`.

| AWS severity | TomDLC severity |
|---|---|
| CRITICAL | critical |
| HIGH | high |
| MEDIUM | medium |
| LOW | low |
| INFORMATIONAL | not a finding; mention in the summary only |

- GuardDuty uses a numeric score: 7.0–8.9 high, 9.0+ critical, 4.0–6.9 medium, below 4.0 low.
- Raise severity when the resource holds restricted data or is internet-facing; record why.
- Deduplicate on control ID + resource ARN. A finding seen again is the same `F-n`.
- Treat an active GuardDuty threat (not a misconfiguration) as a possible incident: follow `incident-response.md` first, register the finding after.

**Remediation SLA** follows the tier (see `../../control-map.md`): critical / high within 30 / 90 days at low, 14 / 30 at moderate, 7 / 14 at high (KEV within 72 hours). Medium and low go to the backlog unless the plan sets a date. Check open findings against the SLA each cycle; the Maintain gate checks that none is past it.

**Suppressions:** suppressing or archiving a finding in Security Hub, an Access Analyzer archive rule, a Config rule exception or a Prowler mutelist entry is an accepted risk. Each needs a waiver ID (`W-n`) and an expiry, written in the suppression's note or reason field. Flag any suppression without one.

## Getting the data

Security Hub findings can be exported as ASFF JSON:

```
aws securityhub get-findings --filters '{"RecordState":[{"Value":"ACTIVE","Comparison":"EQUALS"}],"WorkflowStatus":[{"Value":"NEW","Comparison":"EQUALS"},{"Value":"NOTIFIED","Comparison":"EQUALS"}]}' > securityhub.json
```

**The newer Security Hub (OCSF):** accounts that have turned on the newer Security Hub can read findings in OCSF format with `aws securityhub get-findings-v2` (same `securityhub:GetFindings` permission; AWS's API reference still marks it as preview, so check it's available in the account first). Summarise OCSF findings the same way as ASFF: group by the control or rule, severity and resource, and map OCSF severity to the register's levels (critical, high, medium, low; informational isn't a finding). If the account has only Security Hub CSPM, `get-findings` (ASFF) is the source.

`scripts/import-findings.ts` reads SARIF, Semgrep, Gitleaks, npm audit, pip-audit, osv-scanner, Trivy, Sonar and Dependabot. It does **not** read ASFF. Summarise ASFF yourself (group by control ID, severity and resource) and report the findings directly. Prowler's AWS scans (`prowler aws`) write CSV, JSON-OCSF, JSON-ASFF or HTML, not SARIF, so summarise their output the same way. Only its IaC provider writes SARIF (`prowler iac ... -M sarif`, Prowler 5.25.0 and later; any other provider with `-M sarif` is an error); that output does go through `import-findings.ts`.

## What you run vs what you hand over

| You run (read-only) | You hand to the user |
|---|---|
| `aws securityhub get-findings`, `describe-standards-controls`, `get-enabled-standards` | Enabling Security Hub, standards, Config, GuardDuty or Access Analyzer |
| `aws configservice describe-compliance-by-config-rule`, `get-compliance-details-by-config-rule` | Updating finding workflow status, suppressing or archiving findings |
| `aws guardduty list-detectors`, `list-findings`, `get-findings` | Any fix to a resource (they go through IaC and the pipeline) |
| `aws accessanalyzer list-analyzers`, `list-findings-v2` | Rotating or deleting keys, disabling users, revoking sessions |
| `aws support describe-trusted-advisor-checks` (where available) | Creating the read-only audit role for Prowler |
| `prowler aws` with the read-only role | Anything the permission system or hook refuses |

If a read-only call is refused, don't look for another way to run it. List it under Questions for the user with the exact command, so they can run it and paste the output.

Facts checked against primary sources on 2026-10-14.
