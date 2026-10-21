# Performance testing

## Test shapes

| Shape | How | Finds |
|---|---|---|
| **Load** | Ramp to the expected peak, then hold for at least 15–30 minutes | Whether the NFR targets hold at peak |
| **Stress** | Keep ramping until something breaks | The throughput ceiling, and *how* it fails (gracefully or not) |
| **Spike** | Jump suddenly to 5–10× normal load | Autoscaling lag, cold starts, queue behavior, connection storms |
| **Soak** | Typical load for hours (e.g. 4–8) | Memory leaks, connection or file-handle exhaustion, log or disk growth, slow degradation |
| **Autoscaling** | Load that forces scale-out and then scale-in | Time to scale out; errors during scale-in; whether limits are reached |

## Which shapes per tier

| Tier | Shapes |
|---|---|
| low | A short load test on the critical endpoints |
| moderate | Load, spike and a short soak (at least 1 hour) |
| high | All five shapes; capacity headroom of at least 2× the expected peak |

**Small scale:** size the shapes to the expected peak (10× is plenty) and keep the moderate-tier soak to 30 minutes. Check resource limits as the platform reports them (for a container, `docker stats` against its limit). Under a flood, verify graceful rejection: 429 or 503, no crash, recovery afterwards. Don't analyse kernel or socket memory unless a limit is breached in normal use.

## Rules
- **Report percentiles** (p50, p95, p99) and the error rate. Never averages alone.
- Warm up before measuring, and exclude the warm-up period from results.
- Use production-like data volumes; a query that's fast on 1,000 rows may not be on 10 million.
- Run in an environment built from the production IaC, and record its size, since results only mean something relative to it.
- Use an open workload model (arrival rate) for public-facing systems. A closed model (fixed users waiting for responses) hides the slowdown users would actually see.
- Generate load from outside the system's network where possible, and make sure the load generator itself isn't the bottleneck.
- Only test local or explicitly designated environments, never production or third-party APIs. Stub external services whose terms prohibit load.

## Results: target versus actual
Add this matrix to `05-test-report.md`:

| NFR | Target | Actual | Status | Date | Notes |
|---|---|---|---|---|---|
| NFR-4 | p95 < 300 ms at 200 rps | p95 212 ms at 200 rps | pass | | |
| NFR-9 | 99.9% monthly availability | n/a | PENDING | | Measured in production; verified in Maintain |

`PENDING` is allowed only for NFRs that need production time to measure, such as availability over a month. The SRE verifies them in Maintain.

## Regression gates
Run a short, repeatable performance test on a schedule or before each release, and fail it when p95 regresses by more than an agreed margin (e.g. 10%) against the last accepted run. Keep the test environment consistent, or the comparison is meaningless.

## Capacity
From the stress test, record the ceiling and the first resource to saturate. Headroom = ceiling ÷ expected peak. Compare the projections in the capacity NFR with the ceiling, and estimate when it will be reached.

Facts checked against primary sources on 2026-10-14.
