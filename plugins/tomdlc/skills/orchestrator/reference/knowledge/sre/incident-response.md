# Incident response operations

Defaults to write into the incident response plan in `07-operations.md`. The project can change any of them; `practices.md` and the plan's roles take precedence.

## Severity

| Severity | Criteria | Response |
|---|---|---|
| SEV1 | A critical journey is down for many users; data loss; a confirmed security breach | Page immediately; incident commander named within 15 minutes; updates every 30 minutes |
| SEV2 | Major degradation, or a critical journey down for some users; a suspected breach | Page; commander within 30 minutes; updates hourly |
| SEV3 | Minor degradation with a workaround | Next business day |
| SEV4 | Cosmetic or internal-only | Normal backlog |

When unsure, declare the higher severity; downgrading later is cheap.

## Roles
- **Incident commander:** coordinates, decides and delegates. Doesn't debug.
- **Technical lead(s):** investigate and mitigate.
- **Communications lead:** writes internal and external updates.
- **Scribe:** keeps the timeline: what was seen, decided and done, with times.

In a small team, one person may hold several roles, but the commander role is always named explicitly. Hand roles over explicitly ("you're now commander"), and hand over at shift changes.

## Flow
1. **Detect:** an alert, a synthetic probe, a customer report.
2. **Declare:** open an incident channel or record, set the severity, name the commander.
3. **Mitigate first:** stop the impact before finding the cause. Roll back, turn off a feature flag, fail over, scale up, or block the bad traffic.
4. **Resolve:** fix the immediate cause and confirm recovery from the user's point of view.
5. **Review:** write the postmortem.

## Communication
- Each update says: what's affected, what's being done, and when the next update comes. Don't speculate about causes.
- Put user-visible SEV1 and SEV2 incidents on the status page promptly, ideally within 30 minutes.
- Security incidents: share details on a need-to-know basis, involve the privacy or legal owner early, and start the notification clocks from the compliance drivers (e.g. 72 hours under GDPR).

## Security incidents
- Preserve evidence **before** rebuilding: snapshot the affected systems, and export logs to a separate, access-controlled location. Record who handled what (chain of custody).
- Contain: revoke and rotate exposed credentials and tokens, isolate the affected hosts or accounts, and block the attacker's paths.
- Scope: use the release archive, SBOMs and provenance to find which builds and environments are affected.
- Eradicate and recover from known-good artifacts, never by patching a compromised host in place.

## On-call
- A primary and a secondary for each rotation. If the primary doesn't acknowledge within 10 minutes, escalate automatically to the secondary.
- At handoff, pass on open incidents, recent changes, noisy alerts and anything unusual.
- Watch the load: frequent out-of-hours pages are a reliability bug to fix, not a fact of life.

## Escalation ladder

| Step | Who | SEV1 | SEV2 | SEV3 and SEV4 |
|---|---|---|---|---|
| 1 | Primary on-call | Paged immediately | Paged | Ticket; next business day |
| 2 | Secondary on-call | No acknowledgement in 10 min | No acknowledgement in 10 min | Not escalated |
| 3 | Service owner or team lead | No mitigation path in 30 min | No mitigation path in 60 min | If it's raised to SEV2 |
| 4 | Incident commander | Named within 15 min | Named within 30 min | Not needed |
| 5 | Security, privacy or legal, communications | At once for a confirmed or suspected breach, data loss, or user-visible impact | Same triggers | Not needed |
| 6 | Executive | Impact over 1 hour, a breach, or regulatory or press exposure | Impact over 4 hours | Not needed |

- Escalating is never a failure. When in doubt, go up a step.
- **Handing over command:** the outgoing commander briefs the new one (impact, actions taken, open threads, next update time), the new one says so in the incident channel ("I'm now commander"), and the scribe records the time.
- Record the ladder, with names and contact routes, in the incident response plan in `07-operations.md`, and test it in the yearly exercise.
- **One-person project:** the ladder collapses to the owner plus named external contacts: the cloud provider's and key vendors' support (with the support plan and how to open a priority case), a security contact or incident response retainer, and a legal or privacy contact if personal data is involved. Write these down before the first release.

## Automated remediation
Automation can restart, scale or fail over, but with limits: e.g. at most 3 automatic restarts in 10 minutes, then page a human. Never automatically remediate in a way that destroys evidence of a security incident.

## Metrics
Track per period:
- MTTD (time to detect)
- MTTA (time to acknowledge)
- MTTR (time to restore)
- incidents by severity
- repeat incidents with the same cause

Report them next to the DORA metrics. DORA's own recovery metric is failed deployment recovery time, which covers only failures caused by a deployment; MTTR here covers every incident.

## Postmortems
- Within 5 business days of every SEV1 or SEV2, and for any security incident.
- Blameless: describe systems and decisions, not people's failings.
- Contents:
  - the timeline
  - impact (users, duration, data, cost)
  - root cause and contributing factors
  - what went well
  - action items, each with an owner and a due date
- Route the root cause to the stage that should have caught it (see the SRE agent's routing table).

## Exercises
Run a tabletop exercise at least yearly at the moderate and high tiers: walk through a realistic scenario, such as stolen credentials or a region outage, against this plan, and fix what doesn't work.

Facts checked against primary sources on 2026-10-14.
