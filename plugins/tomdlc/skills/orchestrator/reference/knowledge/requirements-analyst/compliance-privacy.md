# Compliance and privacy requirements

This turns each compliance driver in `01-plan.md` into concrete `SR-n` entries. It's a starting point, not legal advice: regulations change, so confirm current obligations with the user's compliance owner, and mark anything you inferred as an `ASSUMPTION:`.

## What each driver typically requires

This table says what to derive requirements *about*. It isn't a source of exact configuration values or deadlines. For those, rely on maintained scanner compliance packs, which track the frameworks as they change: Prowler's compliance frameworks (HIPAA, PCI DSS, SOC 2, CIS, FedRAMP, GDPR and others), Trivy's compliance reports, and AWS Config conformance packs. Write each compliance SR to cite the framework control, and make its verification "passes `<scanner> <framework>` check `<ID>`" rather than restating the value. Where no scanner covers a control (contracts, notification procedures, retention of paper records), get the value from the user or their compliance owner and record it as theirs.

| Driver | Requirements to derive |
|---|---|
| **GDPR / UK GDPR** | Lawful basis per processing purpose; data subject rights (access, rectification, erasure, restriction, portability, objection), answered within one month; data minimization and storage limitation; privacy by design and by default; a DPIA for high-risk processing; personal data breach notification to the supervisory authority within 72 hours of becoming aware; records of processing; a valid mechanism for transfers outside the UK/EEA; processor agreements with vendors |
| **CCPA / CPRA** | Notice at collection; rights to know, delete and correct; opt-out of sale or sharing; limiting the use of sensitive personal information; no discrimination for exercising rights |
| **HIPAA** | Administrative, physical and technical safeguards for PHI; minimum necessary access; audit controls; business associate agreements with vendors that handle PHI; breach notification to individuals without unreasonable delay and no later than 60 days after discovery; required documentation kept for 6 years |
| **PCI DSS** | Reduce scope first: tokenization or a hosted payment page so card data never touches your systems. Never store sensitive authentication data after authorization; render the PAN unreadable where stored; segment the cardholder data environment; log access, and keep audit logs for at least a year with the last three months immediately available; regular vulnerability scans |
| **SOC 2** | Controls mapped to the Trust Services Criteria in scope: Security is always in scope; Availability, Processing Integrity, Confidentiality and Privacy are chosen. Type I tests design at a point in time; Type II tests that each control operated over the audit period (often 6–12 months), so evidence has to be collected continuously from day one |
| **FedRAMP** (US federal cloud services) | A NIST SP 800-53 control baseline (Low, Moderate or High) chosen by data impact; boundary definition; continuous monitoring with monthly vulnerability scans and plan-of-action tracking; FIPS-validated cryptography; data location limits set by the agency's contract (often US only; FedRAMP itself doesn't impose one). FedRAMP's rules are being revised (FedRAMP 20x, 2026 consolidated rules), so confirm the current path with the user |
| **ISO/IEC 27001** | Controls from Annex A that the statement of applicability selects; evidence of operation |
| **Accessibility laws** (ADA, Section 508, EN 301 549 / European Accessibility Act) | A WCAG conformance target as an NFR; see the ux-designer's accessibility knowledge |

For drivers not listed, ask the user for the control set and map it the same way.

## Privacy impact assessment

Required at the moderate and high tiers whenever personal data is processed, and whenever GDPR's high-risk triggers apply (large-scale sensitive data, systematic monitoring, profiling with significant effects). Add a **Privacy Impact Assessment** section:
1. Describe the processing: what personal data, whose, for what purpose, where it flows, and who receives it.
2. Necessity and proportionality: why each data item is needed, and the lawful basis.
3. Risks to individuals: unauthorized access, excessive collection, inaccuracy, retention too long, re-identification.
4. Mitigations, each linked to an `SR-n`.
5. Residual risk, for the user's sign-off.

## Data subject rights

Map each applicable right to a system capability:

| Right | Capability | Requirement | Response time |
|---|---|---|---|
| Access / portability | Export a user's data in a machine-readable format | FR-n / SR-n | e.g. one month (GDPR) |
| Erasure | Delete or anonymize across primary stores, search indexes, caches, analytics and backups (or document backup expiry) | | |

## Residency and transfers

For each data class, state where it is stored, processed, backed up and logged, including vendors and observability tools (logs often contain personal data). Note the transfer mechanism wherever data crosses a border.

## Retention and deletion

Per data class: the retention period, the deletion method, and how backups and logs age out.

## Audit logging

Security-relevant events record who, what, when, where (source) and outcome. Logs are tamper-evident or append-only for the high tier, time-synchronized, free of secrets and sensitive data, and kept for the longest period any driver requires. Access to audit logs is restricted to named roles, separate from the people whose actions are logged, and reading or exporting the logs is itself logged.

## Evidence

Add an **Evidence** column to the traceability matrix for every compliance-derived SR: the source (CI log, configuration, access review, audit log, ticket), the owner and how often it's collected. Auditors ask for evidence, not intentions.

### Checks as code
Most control types can be checked automatically. Prefer a scanner's maintained compliance framework (for example `prowler aws --compliance hipaa_aws`, or a Config conformance pack) over a hand-written rule whenever one covers the control. Use these as the starting point for each compliance-derived SR, and adapt to the stack:

| Control type | Check | Runs | Evidence artifact | Owner | Frequency |
|---|---|---|---|---|---|
| Encryption at rest / in transit | Policy-as-code rule on IaC (OPA/Conftest, Checkov) plus a config scan of deployed resources (cloud-native config rules) | CI and scheduled | Scan report; rule pass/fail log | devsecops-engineer | Every PR; daily |
| Access reviews | Export users, roles and grants; diff against the last approved list | Scheduled job | Export, diff, reviewer sign-off | Service owner | Quarterly (monthly for privileged access) |
| Logging and retention | Config check that audit logging is on with the required retention; a test that logs older than the period are gone | CI and scheduled | Config scan; retention test result | sre | Every PR; monthly |
| Dependency and licence policy | SCA gate with the licence allowlist | CI | SCA report; SBOM | devsecops-engineer | Every PR and release |
| Change approval | Branch protection and required reviews enabled; merged PRs had approvals | Scheduled job | Settings export; PR approval log | release-engineer | Monthly |
| Backup and restore | Restore drill against the RPO/RTO | Scheduled | Drill record: date, data restored, time taken, result | sre | Per tier, at least quarterly at the high tier |
| Data residency | Region allowlist check on IaC and deployed resources | CI and at Deploy | Policy result; resource inventory with regions | devsecops-engineer | Every PR and deploy |
| Secrets | Secrets scanner; rotation age check against the policy | CI and scheduled | Scan report; secret inventory with last-rotated dates | devsecops-engineer | Every PR; weekly |

Custom scripts are fine where no tool fits; keep them in the repo and run them in the pipeline. Store the output where the evidence index points. Each compliance-derived SR's traceability row names its check and evidence artifact from this table.

## Through the lifecycle
Compliance isn't settled at Requirements. Each compliance-derived SR is carried through:

| Stage | Who | What |
|---|---|---|
| Design | security-reviewer (design review) | Every compliance SR has a design element: control, data location, retention mechanism, audit log |
| Develop | devsecops-engineer | Policy checks in CI tied to the framework where tools allow, e.g. IaC scan rule sets for the framework, region restrictions for residency, encryption required on storage |
| Deploy | release-engineer | A **Compliance** section in `06-release.md`: the controls this release touches, evidence produced or scheduled, open compliance waivers, and data residency of new resources |
| Maintain | sre | An evidence schedule in `07-operations.md` (control, evidence, frequency, last collected, next due); collected on schedule; gaps raised as findings or risks |

### Audit-readiness package
At the moderate and high tiers with an audit in view, keep these current in `.tomdlc/` so an audit doesn't start from scratch:
- the control matrix: framework control → SR → design element → evidence → owner
- the evidence index from `07-operations.md`
- the risk register (accepted risks with the user's decisions) and open waivers
- the data map: classification, locations, retention, processors
- policies the controls depend on (links)

Facts checked against primary sources on 2026-10-14.
