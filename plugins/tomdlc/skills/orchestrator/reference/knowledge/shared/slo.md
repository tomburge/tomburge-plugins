# SLOs and error budgets

Used by the requirements-analyst (to set SLOs) and the SRE (to monitor them and enforce the budget policy).

## Indicators (SLIs)

An SLI is a ratio: good events ÷ valid events.

| Type | Good event | Typical for |
|---|---|---|
| Availability | A request that didn't fail because of the service (5xx, timeout) | Every user-facing API and page |
| Latency | A request served faster than a threshold, e.g. 300 ms | Interactive paths |
| Freshness | Data updated within a threshold, e.g. 5 minutes | Pipelines, search indexes, reports |
| Correctness | Output matching a known-good check | Calculations, data pipelines |
| Durability | Stored data readable later | Storage, backups |

Rules:
- Measure as close to the user as practical: at the load balancer or edge, not inside the service.
- Exclude health checks, synthetic probes and requests rejected for the client's own fault (4xx) from valid events.
- Define SLIs per critical user journey (e.g. "check out"), not per internal service.

## Targets
- Set targets from measured performance where it exists, not aspiration. Never 100%.
- An SLO is internal and stricter than any SLA promised to customers, so you hear about trouble before you owe credits.
- A serial dependency caps what you can achieve: two dependencies at 99.9% each leave at most about 99.8%.
- Use a rolling 28- or 30-day window.

## Error budget policy

Error budget = 1 − SLO. For 99.9% over 30 days, that's 43.2 minutes of failure.

| Budget remaining | Policy |
|---|---|
| More than 50% | Normal releases |
| 25–50% | Releases continue with extra care: canary required, no risky migrations |
| Less than 25% | Only reliability fixes and low-risk changes |
| Exhausted | Feature releases freeze until the budget recovers. Security fixes are always allowed. |

Record the policy in `02-requirements.md`, and have the release pipeline check the budget before promoting (see the release-engineer's knowledge).

## Burn-rate alerts

Alert on how fast the budget is being consumed, using two windows so alerts fire quickly but reset quickly:

| Severity | Burn rate | Long window | Short window | Budget consumed if sustained |
|---|---|---|---|---|
| Page | 14.4× | 1 hour | 5 minutes | 2% in an hour |
| Page | 6× | 6 hours | 30 minutes | 5% in 6 hours |
| Ticket | 1× | 3 days | 6 hours | 10% in 3 days |

Both windows must exceed the burn rate for the alert to fire. This avoids paging on brief blips and alerts that stay firing long after recovery.

## SLO document contents

For each SLO: the journey, SLI definition (good and valid events, where measured), target, window, error budget, budget policy, alert rules, dashboard link and owner. Review the SLOs quarterly, and after any incident that consumed more than 20% of the budget.

## Toil

Track time on-call spends on manual, repetitive operational work. If it regularly exceeds about half of the team's operations time, automating it takes priority over features.

Facts checked against primary sources on 2026-10-14.
