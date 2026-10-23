# TomDLC stage gates

The orchestrator evaluates these at the end of each stage and passes the relevant list to the stage's agents in their briefs. Each criterion ends up **met** (with evidence), **N/A** (only in a `light` stage, with a reason), **waived** (with user approval, an owner and an expiry date) or **blocking**. Stages the change plan skips have no gate.

Criteria marked *(existing code)* apply only when `state.json` has `"codebase": "existing"`. Criteria marked *(UI)* apply only when it has `"ui": true`.

Scale (`tuning.md`) changes how the gate is presented and how much is written to meet each criterion, not the criteria themselves. Findings marked `preexisting` block only if critical.

Every stage also needs:
- no open critical or high findings in the findings register for that stage, unless waived or accepted
- no open high or critical risk in the risk register without an active treatment, unless the user accepts it
- from Requirements on, a `check-trace.ts` run with no undefined or duplicate IDs, unless waived
- the user's explicit approval, recorded verbatim

## 1. Plan
- [ ] Objectives have measurable success criteria
- [ ] If discovery ran: the user's decision on its recommendation is recorded, and the plan's objectives and scope follow it
- [ ] Every data type is classified (public, internal, confidential or restricted)
- [ ] If the system runs on AWS: `platform` is recorded (`cloud`, and `iac` or when it will be chosen)
- [ ] Risk tier is set, justified and confirmed by the user
- [ ] Scale (small, medium or large) is set and confirmed by the user
- [ ] Compliance drivers are listed, or "none" is stated explicitly
- [ ] Security champion and risk owner are named (SSDF PO.2)
- [ ] Security check criteria are defined for the tier (SSDF PO.4)
- [ ] Toolchain and environments are identified (SSDF PO.3)
- [ ] Spikes needed before Design are listed
- [ ] Risks & dependencies are listed in the plan and entered in the risk register
- [ ] The branching strategy is recorded in `practices.md`
- [ ] `.tomdlc/practices.md` exists, with assumptions marked
- [ ] If a questions pass ran, the confirmed answers are in `decisions.md` and reflected in the plan
- [ ] Whether the system has a user interface is recorded, and the budget (or cost ceiling) per environment is set
- [ ] *(existing code)* `00-codebase.md` exists, states its scan coverage, and lists the test command

## 2. Requirements
- [ ] Every FR has testable acceptance criteria
- [ ] When `platform` is set: the environment set (`dev`, `dev-prod` or `dev-stage-prod`) and each environment's AWS account and/or CLI profile and region are recorded in `environments`; environments use separate accounts, or the user approved sharing in their own words after being told it's not recommended
- [ ] SLOs, RPO and RTO are set ([ops] NFRs)
- [ ] HA/DR is settled with the user: availability per critical journey, RPO and RTO per scenario and data store, the DR strategy, the primary region per environment and the DR region where the strategy needs one (recorded in `environments` when `platform` is set), allowed regions under any residency limits, what must survive a region loss, and who decides to fail over
- [ ] ASVS level matches the risk tier, and the selected controls are captured as SRs (SSDF PO.1)
- [ ] Each compliance driver maps to at least one SR, or is marked not applicable with a reason
- [ ] Security SRs state concrete values for the tier: authentication and MFA, session and token lifetimes, the authorization model, secret rotation and rate limits (or say why each doesn't apply)
- [ ] Every confidential or restricted data class has protection and retention requirements
- [ ] Abuse cases cover authentication, authorization and every sensitive data flow
- [ ] Every FR has happy-path, error-path and boundary criteria
- [ ] User types are defined, every story names one and passes INVEST, and a Story Map & MVP section sets the MVP line and later increments
- [ ] If a questions pass ran, the confirmed answers are in `decisions.md` and reflected in the requirements
- [ ] The edge-case sweep is done for the tier, and every applicable condition is a requirement, an assumption or explicitly out of scope
- [ ] Performance, capacity and availability NFRs follow the templates (target, percentile, load condition, measurement)
- [ ] At the moderate and high tiers with personal data: a privacy impact assessment, a data subject rights mapping and a residency statement exist
- [ ] Every compliance-derived SR names its evidence source
- [ ] *(UI)* An `NFR [a11y]` sets the WCAG 2.2 level for the tier
- [ ] A Completeness table settles the standard capabilities (entity operations, accounts, settings, notifications, i18n, admin, reporting, integrations, data rights) as requirements, later increments or out of scope
- [ ] Compliance obligations cite current sources, or are marked as assumptions for the compliance owner
- [ ] Traceability matrix is present
- [ ] At the moderate and high tiers: the reviewer has reviewed the requirements in requirements mode (high tier: verdict READY)
- [ ] Stakeholders have reviewed the requirements (the user confirms)

## 3. Design
- [ ] Every spike the plan lists is `done` with the user's decision recorded, or `waived`
- [ ] Architecture covers every Must FR and NFR
- [ ] Deployment, pipeline and observability designs are written
- [ ] The HA/DR design meets the recoverability NFRs: a mechanism per data store and component, traffic failover, and everything the DR region needs in place beforehand
- [ ] When `platform` is set: `03-platform.md` covers accounts and environments, identity (CI via OIDC, separate plan and apply roles), network, service mapping, data protection, logging and detection, the IaC approach and state, cost per environment against the budget, and quotas; `platform.iac` is confirmed by the user; the threat model covers the platform; infrastructure has its own delivery slices
- [ ] Threat model is complete for the risk tier, and every high or critical threat is mitigated or accepted by the user
- [ ] Trust boundaries, the authn/authz model, secrets handling and encryption are specified (SSDF PW.1, PW.9)
- [ ] Design review findings are resolved or waived (SSDF PW.2)
- [ ] New SRs from threat modeling were added to the requirements
- [ ] The architecture style is recorded as an ADR, every entity has one owning component, and every NFR maps to a mechanism
- [ ] Functional design is complete for the tier, including a per-operation authorization matrix
- [ ] API and event contracts exist as files in the repo
- [ ] The data model is documented: store choice as an ADR, entities and keys, indexes for the main queries, retention, and the migration approach
- [ ] For a complex core domain (moderate and high tiers): a domain model with bounded contexts, aggregates and their invariants
- [ ] The deployment strategy is chosen and recorded as an ADR
- [ ] `check-trace.ts` shows every Must FR in the design and in a delivery slice
- [ ] A cost estimate per environment is within the budget, or the gap is accepted; a tagging scheme is defined
- [ ] At the moderate and high tiers: pillar review findings are resolved or waived
- [ ] At the moderate and high tiers: the reviewer has reviewed the design in architecture mode (high tier: verdict READY)
- [ ] *(UI)* `03-ux.md` covers every user-facing Must FR, with all five states per screen, low-fidelity wireframes for the key screens, and an accessibility specification at the target level
- [ ] Delivery slices state their ordering rationale, and cover every Must FR and every code-level mitigation exactly once, in dependency order, each with Owns globs and a Done-when

## 4. Develop
- [ ] Branch protection and required reviews are in place, or documented as a user action with exact settings (SSDF PS.1)
- [ ] CI runs build, tests, secrets scan, SAST and SCA (plus IaC scan, container scan and SBOM per tier), and blocks on the agreed thresholds (SSDF PO.3, PW.6)
- [ ] Pipeline is green on the default branch
- [ ] When `platform` is set: every infrastructure slice has passing IaC tests (`terraform test` or CDK assertions), lint, and a security scan (Checkov or Trivy, plus cdk-nag for CDK) with no unwaived high or critical findings; plan-time policy checks pass at the moderate and high tiers; its security review used the IaC checklist; no hard-coded secrets, account IDs or `*:*` IAM
- [ ] When `environments` is set: everything Develop deployed went to dev only (dev profile and account); nothing in stage or prod changed during Develop
- [ ] No open critical or high findings from scans or the security review, except as waivers (SSDF PW.7)
- [ ] Every Must FR is implemented, and the code references its requirement IDs (SSDF PW.5)
- [ ] Design deviations are reflected in the design and the threat model
- [ ] Every slice is `done`, and met its Done-when
- [ ] Slices that needed a plan checkpoint for the tier had their plan confirmed before building
- [ ] At the moderate and high tiers: the reviewer has reviewed the code in code mode (high tier: verdict READY for every slice)
- [ ] Every scanner suppression cites a waiver ID, and CI enforces it
- [ ] When API contracts exist, CI lints them and blocks unversioned breaking changes
- [ ] *(existing code)* No new test failures versus the recorded baseline, and coverage hasn't dropped

## 5. Test
- [ ] When `environments` includes stage: the Develop build was promoted to stage with the user's one-word **Approve**, the promotion's `checks` show stage's account before the deploy and the promoted build running after it, and the live tests ran against stage
- [ ] Every Must FR and SR has a passing test or a documented manual verification
- [ ] Every mitigated high or critical threat has a verification test
- [ ] Security testing is complete for the tier, with no open critical or high findings except as waivers (SSDF PW.8)
- [ ] Performance tests use the shapes for the tier, and the target-versus-actual matrix shows every NFR met, waived or `PENDING` (only for NFRs that need production time)
- [ ] Coverage meets the tier target and hasn't dropped; mutation testing ran on critical modules at the high tier
- [ ] *(UI)* Automated and manual accessibility checks pass at the target WCAG level
- [ ] CI test gates are in place and green
- [ ] UAT is signed off (the user confirms)
- [ ] `check-trace.ts` shows every Must FR and SR mentioned by a test or the test report, and every threat in the test report
- [ ] *(existing code)* The full suite shows no new failures versus the recorded baseline

## 6. Deploy
- [ ] The released artifact is identical (by digest) to the tested one
- [ ] Signing, provenance and SBOM are in place for the tier (SSDF PS.2, PS.3)
- [ ] Production is provisioned entirely by IaC, with the plan reviewed
- [ ] When `environments` includes prod: the prod promotion of the build that passed Test (and stage, in a three-environment set) was approved with the user's one-word **Approve** before anything was applied to prod, and its `checks` show prod's account before the deploy and the promoted build running after it
- [ ] When `platform` is set: `06-infra.md` lists the plan or diff per environment; the user approved every flagged change (stateful replace or destroy, IAM, network exposure, KMS) in their own words; what was applied is the reviewed plan; drift is clean after the apply
- [ ] Hardening checklist is complete, and the IaC scan is clean or waived (SSDF PO.5, PW.9)
- [ ] Rollback is rehearsed and meets the time target, with numeric automatic rollback triggers
- [ ] Before the first production release: a backup restore drill in a non-production environment met the RPO and RTO
- [ ] Graceful shutdown and connection draining are configured, and the feature flags in the release have owners
- [ ] Monitoring and security alerting are live
- [ ] The release record has Compliance and Cost sections
- [ ] Go/no-go is recorded with the user as approver
- [ ] After deploying, the deployment record is complete (when, version, environment, checks, outcome). If the outcome is rolled-back or failed, the cause is recorded and routed, and the stage stays open

## 7. Maintain

For a change, Maintain passes when its operational work is done: runbook and alerts updated, postmortem written and routed (for an incident fix). The recurring health check below is project-level and never "done". Record each run in `history`.

- [ ] SLOs are met, or the error budget policy is being followed
- [ ] No vulnerabilities are past their remediation SLA (SSDF RV.1, RV.2)
- [ ] No expired waivers in `state.json`
- [ ] Every postmortem action item is closed or tracked, and its root cause is routed to the right stage (SSDF RV.3)
- [ ] DORA metrics are trending toward their targets
- [ ] The incident response plan and contacts are current; MTTD and MTTR are tracked
- [ ] Recovery drills and game days are held on schedule for the tier, including the region failover drill when the DR strategy is above backup and restore
- [ ] The threat model was reviewed within 12 months (moderate and high tiers) and after the last architecture change
- [ ] When `platform` is set: drift checks run on the tier's schedule, and drift is codified or reverted; AWS posture findings (Security Hub, Config, GuardDuty, Access Analyzer) are in the findings register and within their remediation SLA
- [ ] The pillar review (reliability, performance, cost, operational excellence, sustainability) was repeated within 12 months (moderate and high tiers) and after a major change, against how the system actually runs: the security-reviewer in pillar review mode over `03-design.md`, `07-operations.md` and production data such as SLO results, incidents and spend
- [ ] Every `PENDING` NFR from the test report has been verified with production data, or has a date when it will be
- [ ] Every alert has a runbook, and runbooks have been tested on the drill schedule
- [ ] Compliance evidence is collected on schedule (when compliance drivers apply)
- [ ] Spend has been reviewed against the budget, and anomalies and idle resources acted on
- [ ] The risk register has been reviewed: no overdue review dates, and no untreated high risks
