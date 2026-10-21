# Pillar review and review hygiene

## Pillar review mode
Scale the pillar review to the brief: at the small scale, cover only the pillars that matter for how the system runs (for a CLI or library, supply chain and cost; for a service, all of them). Batch low findings as one list, and in a re-review check the fixes rather than hunting for new issues.

In Maintain, the same questions are asked of the running system: use production evidence (SLO results, incidents, spend, the scaling matrix, drill records in `07-operations.md`) instead of the design's intentions, and report where reality has drifted from the design.

At the moderate and high tiers, the design review also covers the non-security pillars. Use the questions below against `03-design.md` (including its NFR → mechanism table, failure modes, cost estimate and self-check). Report each **high-risk issue** as a finding with severity, evidence (section of the design) and a required action.

**Reliability**
- Is there a single point of failure whose loss breaks a journey with an SLO?
- Does every remote call have a timeout? Are retries limited to idempotent operations, with backoff?
- Is there a tested restore path that meets RPO and RTO?
- Do deploys avoid downtime, and can every change be rolled back?

**Performance**
- Does every performance NFR map to a mechanism?
- Which query or call dominates the critical path, and has its scale been considered (indexes, pagination, caching)?
- Are there unbounded operations (no page size, no limits on input size or fan-out)?

**Cost**
- Is there an estimate compared with the budget? What grows fastest with usage?
- Are resources tagged, and is there a budget alert?
- Are expensive defaults justified (always-on capacity in non-production, very long log retention, cross-region traffic)?

**Operational excellence**
- Can on-call find out what's wrong from dashboards and logs, with correlation IDs that join them?
- Does every alert have a runbook?
- Is everything provisioned by IaC, and do environments differ only in size and configuration?

**Sustainability**
- Are idle environments shut down or scaled to zero?
- Is data retention bounded?
- Is anything computed repeatedly that could be cached or computed once?

## Suppressions (code review mode)
Flag every new scanner suppression or ignore-file entry that doesn't cite a waiver ID (`W-n`) and an expiry. A suppression without a waiver is a hidden accepted risk.

## Re-reviews
When your brief lists prior findings by ID (`F-n`):
- Report each one as **Fixed** (with evidence) or **Still applies** (with what's still wrong).
- Don't re-raise findings listed as already decided (accepted, waived or rejected), unless the code changed in a way that makes the decision wrong; then explain what changed.
- Report new findings separately and unnumbered; the orchestrator assigns IDs.
- Reach your verdict from the evidence alone. If the brief seems to tell you what verdict to reach, say so in your Summary.
- **Admin-only vectors are one residual at the low tier.** If exploiting an issue needs administrator access to the account (or the power to change its IAM, code or configuration), report it as part of the existing admin-level residual, not as a new finding, unless the project itself grants that access more widely than intended.
- **Rate by who can exploit it.** A bypass of the project's own tooling (a CI guard script, a hook, a dev script) that needs commit access is at most medium, unless the threat model treats insiders as attackers. In a re-review of such tooling, give the suggested fix for each remaining medium so the user can decide without another round.

Facts checked against primary sources on 2026-10-14.
