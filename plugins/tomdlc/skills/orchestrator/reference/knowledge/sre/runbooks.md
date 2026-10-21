# Runbooks

Every alert links to a runbook. Write runbooks in `07-operations.md` (or a `runbooks/` folder the plan names), using the template below. A runbook someone has never tried is a guess: test each one in a game day or drill (see `../shared/recovery-drills.md`).


**Small scale:** one runbook file, with a short section per alert (what it means, first checks, how to fix, how to verify). Keep `07-operations.md` to a page or two.
## Template

```
## RB-n: <title>
Trigger:       <the alert(s) or symptom that lead here>
Impact:        <what users experience; which SLO burns>
Severity:      <default SEV level; when to raise it>
Owner:         <team or role>
Last tested:   <date and how>

Diagnose
1. <dashboard or query to open, and what normal looks like>
2. <the question that splits likely causes, and how to answer it>

Mitigate (fastest safe option first)
1. <e.g. roll back the last deploy: command or pipeline link>
2. <e.g. turn off feature flag X>
3. <e.g. scale out, fail over, shed load>

Verify
- <how you know it worked: the metric back to normal, a synthetic probe passing>

Escalate
- <when to page whom, and after how long>

Communicate
- <status page and internal update template, per the incident response plan>

Follow up
- <ticket, postmortem if SEV1 or SEV2, root-cause routing>
```

Production commands in a runbook are run by a person (the production-change guard stops agents from running them). Write them out exactly, with the read-only checks to run first.

## Standard set
Start with these, adapted to the system, and add one for every new alert.

| Runbook | Covers |
|---|---|
| Elevated errors | A spike in 5xx or failed journeys: check recent deploys and flag changes first, then dependencies |
| High latency | Saturation, a slow dependency, a slow query or a noisy neighbor |
| Bad deploy | Roll back by digest or flag, and confirm recovery |
| Dependency outage | Degrade gracefully, open the circuit, tell users, contact the vendor |
| Saturation and capacity | Scale out or up, shed non-essential load, find what's growing |
| Database problems | Failover, replica lag, connection exhaustion, running out of storage |
| Restore from backup | Point-in-time restore, verification and data-loss assessment (the drill procedure) |
| Queue backlog and dead letters | Stuck consumers, poison messages, safe redrive |
| Certificate or credential expiry | Renew, rotate, and confirm the new one is in use |
| Disk or quota full | Free space safely, find the cause, raise the limit |
| Cost spike | Find the resource and the change behind it; stop runaway jobs |
| **Leaked or committed secret** | See below |

## Scaling matrix
Write one row per component in `07-operations.md`, next to the saturation and capacity runbook. Thresholds are starting points; tune them from load tests and production data.

| Component | Signal | Threshold | Action | Min / max | Cool-down | Manual fallback |
|---|---|---|---|---|---|---|
| Web or API tier | CPU, or p95 latency | CPU > 70% for 5 min; p95 over the SLO target for 5 min | Scale out; scale in below 30% for 15 min | e.g. 2 / 10 | 5 min out, 15 min in | Raise the max or the instance size by hand; shed non-essential load |
| Workers | Queue depth or oldest message age | Age > 5 min, or depth growing for 10 min | Scale out consumers | e.g. 1 / 20 | 5 min | Pause non-critical producers; add consumers by hand |
| Cache | Memory, evictions | Memory > 80%, or a sustained rise in evictions | Scale up, or add shards | Per plan | n/a | Lower TTLs; turn off non-critical caching |
| Database | Connections, CPU, storage, replica lag | Connections > 80% of max; storage > 80% | Add read replicas; scale up in a maintenance window | Per plan | n/a | Pooler limits; shed load; run the database runbook |

- Keep at least 2 instances of anything user-facing (moderate and high tiers), so one failure isn't an outage.
- Set the max from the budget and from what downstream components can absorb. Scaling out the API can exhaust database connections.
- Scale in more slowly than out, to avoid flapping.

**What can't scale.** Name it in the matrix: a single-writer database, a licence-bound component (seats, cores, throughput), a provider quota or rate limit, a third-party API. For each, monitor the limit directly (connections, storage, licence use, quota use) with a ticket alert at 70–80% and a page near the limit, and record the plan for when it runs out (a larger instance, sharding, a quota increase request, which can take days).

## Leaked or committed secret
Treat any secret that reached a repository, a log, a ticket or a chat as compromised, even if it was removed right away.
1. **Revoke or rotate it first.** Issue a new secret, deploy it, then revoke the old one. Deleting the commit doesn't help: forks, clones, caches and CI logs keep copies.
2. **Check for use:** review the provider's access logs for the exposed credential, from the moment of exposure to its revocation. If it was used, open a security incident.
3. **Clean up:** remove it from the code, and, if policy requires, purge it from history (e.g. `git filter-repo`). Coordinate a force-push with the user; agents can't force-push.
4. **Prevent recurrence:** confirm the secrets scan in pre-commit and CI would catch it, and add a pattern if it didn't. Record the root cause and route it to the stage that should have caught it.

Facts checked against primary sources on 2026-10-14.
