# Zero-downtime release

## Health and shutdown
- **Readiness probe** gates traffic: an instance gets requests only when it can serve them. A **liveness probe** only restarts hung processes, and never checks dependencies. Use a **startup probe** for slow starters.
- **Graceful shutdown** (the developer implements it; you configure around it):
  1. On SIGTERM, fail readiness and stop accepting new work.
  2. Finish in-flight requests, within a drain timeout longer than the slowest normal request (typically 30–60 seconds).
  3. Return unfinished queue messages, or let them time out back to the queue.
  4. Close connections, and exit.
- Align the load balancer's deregistration or connection-draining delay with the drain timeout, so no new requests arrive mid-shutdown.

## Rollout
- **Canary steps,** e.g. 5% → 25% → 50% → 100%, with a bake time at each step (e.g. 10–15 minutes, or long enough to see a meaningful number of requests).
- **Automatic rollback triggers,** with numbers. For example, compared with the stable version over the same window:
  - error rate above the stable version plus 1 percentage point, or above 2% absolute
  - p99 latency above the SLO threshold for 5 minutes
  - any failed smoke test
  - an SLO burn-rate page during the rollout
- A **cooldown** after a rollback: no automatic re-promotion. A human decides.
- **Pre-deploy checks:**
  - the target environment is healthy
  - the error budget allows releases (see `../shared/slo.md`)
  - no incident is open
  - the critical dependencies are healthy

## Database changes
- Expand, then contract: the new schema works with the old code and the new code works with the old schema, so either can be rolled back.
- Never put a destructive migration in the same release as the code change that stops using the data.
- Throttle backfills, make them resumable, and keep them separate from the deploy.

## Feature flags
| Type | Purpose | Lifetime |
|---|---|---|
| Release | Hide unfinished or unproven features | Remove within a few weeks of full rollout |
| Ops / kill switch | Turn off an expensive or risky feature under load | Long-lived, and documented in the runbook |
| Experiment | A/B tests | For the experiment's duration |
| Permission | Entitlements per customer or plan | Long-lived; really configuration |

- Every flag has an owner and a removal date. Defaults are the safe state.
- Never put secrets or personal data in flag configuration.
- Changing a flag in production is a production change: audit it, and record it on dashboards like a deploy.

## Freeze windows
- If `practices.md` defines freeze windows, enforce them in the pipeline, not by memory.
- An emergency override needs a named approver.
- Security fixes within the remediation SLA are always allowed.

## Rollback readiness
- Keep the previous release's artifacts (by digest) and configuration available until the new one is proven.
- Record the rollback command and the expected time in `06-release.md`.

## Recovery
Before the first production release, prepare a restore drill (see `../shared/recovery-drills.md`): the procedure, the commands and the environment. The user runs it, or approves each step. Record the measured RTO and RPO in `06-release.md`.

Facts checked against primary sources on 2026-10-14.
