# Architecture method

## 1. Choose the style deliberately

Record the choice as an ADR, including the styles you rejected.

| Style | Use when | Avoid when |
|---|---|---|
| **Modular monolith** (the default) | One team or a few; domain still being learned; you want simple deployment and transactions | Parts genuinely need independent scaling, deployment or technology |
| Microservices | Several teams need to deploy independently; parts have very different scaling or availability needs | One small team; boundaries not yet stable; no mature CI/CD and observability |
| Serverless functions | Spiky or low-volume, event-driven workloads; glue between managed services | Long-running or latency-critical work; heavy local state; strict cost predictability at high volume |
| Event-driven | Many consumers react to the same facts; you need loose coupling or an audit of what happened | You need immediate consistency everywhere; the team can't operate brokers and replay |
| CQRS / event sourcing | Very different read and write models; a full history is a requirement | Plain CRUD; the extra complexity doesn't buy anything |
| Hexagonal (ports and adapters) | Inside any of the above, to keep business logic independent of frameworks and I/O | Trivial scripts |

Start with a modular monolith with clean internal boundaries unless a specific need above rules it out. Its modules can be split out later along the same boundaries.

## 2. Draw the boundaries

- Group by **business capability**, not technical layer. Each component speaks one consistent vocabulary (a bounded context).
- **Each entity has exactly one owning component.** Others go through its interface.
- Relationships between contexts:
  - **Anti-corruption layer:** wrap external or legacy systems so their model doesn't leak in.
  - **Published contract:** a versioned API or event schema that several consumers rely on.
  - **Customer and supplier:** the downstream team's needs shape the upstream contract.
  - **Shared kernel:** a small shared library. Use it sparingly; it couples release cycles.

Red flags that a boundary is wrong:
- two components write the same table
- a single user action needs a chain of synchronous calls across several components
- circular dependencies
- most changes touch several components at once
- a `common` or `utils` module that everything depends on and that keeps growing

## 3. Integration
- Synchronous calls when the caller needs the answer now; asynchronous messages when it doesn't.
- Every consumer is idempotent, because messages get redelivered.
- Use the outbox pattern when a database write and a message publish must both happen.
- Contracts are versioned files (see `api-design.md`).

## 4. Map every NFR to a mechanism

Add an **NFR → Mechanism** table to `03-design.md`: NFR ID, mechanism, component, and how it will be verified. Common mechanisms:

| Need | Mechanisms |
|---|---|
| Latency | Caching (cache-aside with TTL; plan invalidation; protect against stampedes), read replicas, precomputation, pagination, CDN for static content |
| Throughput and scale | Stateless services behind a load balancer, horizontal autoscaling, partitioning by a high-cardinality key, queues to absorb bursts, connection pooling |
| Resilience | Timeouts on every remote call; retries with exponential backoff and jitter, **only for idempotent operations**; circuit breakers; bulkheads (separate pools per dependency); rate limiting and load shedding; graceful degradation that drops non-essential features first |
| Recoverability | Backups to meet RPO, a restore path to meet RTO, replicas or standby capacity; see `../shared/recovery-drills.md` |
| Operability | See `../shared/observability.md` |

### Mechanism settings

Naming a mechanism isn't enough. The design or ADR states its settings as concrete values:

| Mechanism | Settings to state |
|---|---|
| Timeouts | Connect and read timeout per remote call; a total budget per request that shrinks at each hop downstream (a callee never gets longer than its caller has left) |
| Retries | Only for idempotent operations (or with an idempotency key); max attempts; exponential backoff with jitter (base, cap); a retry budget (for example, retries ≤ 10% of requests) so retries can't multiply load |
| Circuit breaker | Failure threshold (rate or count over a window); open duration; number of half-open probes before closing; what callers get while open (fallback or fast error) |
| Bulkheads and connection pools | Pool size per dependency; queue length and wait timeout when the pool is full |
| Rate limits | Algorithm (token bucket, sliding window); limit and window; the key (user, API key, IP, tenant); the response (429 with `Retry-After`) |
| Caches | TTL; maximum size and eviction policy; how entries are invalidated on write; stampede protection (request coalescing, early refresh, TTL jitter) |
| Queues | Visibility timeout (longer than the worst-case processing time); max receives before dead-lettering; the DLQ, its alarm and its redrive process |
| Health checks | Liveness (the process is alive; no dependency checks) vs readiness (can serve traffic now); interval, timeout and failure threshold for each |

- Justify each value from an NFR target. For example, a 300 ms p95 latency NFR across three hops sets the per-hop timeouts and leaves no room for more than one retry.
- Values live in configuration, not scattered literals, so they can be tuned without a code change.
- Each setting has a test: a slow dependency triggers the timeout, the breaker opens at its threshold, the rate limit returns 429, a poison message lands in the DLQ. Record the test in the NFR → Mechanism table's verification column.

## 5. Failure modes

For each dependency (database, cache, queue, third-party API, identity provider), list what happens when it is:
- down
- slow (2–10× normal latency)
- returning wrong or partial data
- overloaded

For each one, give the user impact, how you'd detect it, the mitigation, and how the system recovers when the dependency returns.

## 6. Cost

- Give a rough monthly cost estimate per environment with its main drivers: compute, storage, data egress, managed services and observability ingestion. Compare it with the budget in `01-plan.md`.
- Name the cost-per-unit metric that matters, such as cost per thousand requests or per active customer.
- Define a tagging scheme that IaC applies to every resource: at least `owner`, `environment`, `service` and `data-class`.

## 7. Self-check before handing back

Answer these briefly in the design:
- **Reliability:** what's the single point of failure, and is it acceptable for the SLO?
- **Performance:** which path is slowest, and what keeps it within its NFR?
- **Cost:** what grows fastest with usage, and is there a ceiling?
- **Operability:** can on-call tell what's wrong from the dashboards alone? Can every change be rolled back?
- **Sustainability:** is anything running or stored that nobody needs (idle environments, unbounded retention)?

The security-reviewer checks the same areas in pillar review mode.

## ADRs

Write an ADR when a decision is hard to reverse, affects several components, or chooses between real alternatives. Number them `ADR-n`, with status `Proposed`, `Accepted` or `Superseded by ADR-m`. In update mode, supersede an ADR rather than editing its decision.

Keep each ADR short. Template:

```markdown
## ADR-n: <decision in a few words>

- **Status:** Proposed | Accepted | Superseded by ADR-m
- **Date:** YYYY-MM-DD
- **Related:** FR-n, NFR-n, SR-n, T-n

### Context
The problem and the constraints, in a few sentences. What forces a decision now.

### Decision drivers
- The NFR targets, security requirements, cost limits and team constraints that matter most

### Options considered
| Option | Pros | Cons |
|---|---|---|
| A | ... | ... |
| B | ... | ... |
| C (do nothing, if viable) | ... | ... |

### Decision
The option chosen, and why it wins against the drivers.

### Consequences
- Good: what gets easier or safer
- Bad: what gets harder, new risks, debt accepted

### Reversibility
How hard it is to undo: the exit cost (effort, data migration, contracts to break) and the path out if needed.

### Review trigger
The condition that reopens this decision: a load threshold, a date, a dependency's end of life, a new requirement.
```

Consider at least two real options. If only one was possible, say why. Link the ADR from the parts of `03-design.md` it shapes.

## Migration paths

When the change replaces or reshapes part of a live system, choose a migration path and record it in an ADR. The path goes into the slice plan: each step is its own slice (S-n) and leaves the system working and releasable.

| Path | Use when | Rollback point | Verify |
|---|---|---|---|
| **Strangler fig** | Replacing a component or legacy system piece by piece behind a routing layer | Route the traffic back to the old implementation | Per route: same responses, error rates and latency as the old path before moving the next |
| **Branch by abstraction** | Replacing an internal module or library inside one codebase | Switch the abstraction back to the old implementation | Both implementations pass the same tests behind the abstraction; remove the old one only when nothing uses it |
| **Parallel run / shadow traffic** | Correctness matters more than speed: calculations, billing, permissions | The old system stays authoritative throughout; just stop the shadow | Compare outputs from both on real traffic; investigate every difference; agree a mismatch threshold before switching. Shadow calls must not cause side effects (no writes, emails or payments) |
| **Expand–migrate–contract** | Changing a schema, API or event contract that others depend on | Before contract: old readers and writers still work | Expand (add the new field or version alongside the old); migrate writers, readers and data, with a backfill check; contract (remove the old) only when monitoring shows nothing uses it |
| **Dark launch behind a flag** | Shipping new code before exposing it; gradual rollout by percentage or tenant | Turn the flag off | Metrics and errors for the flagged cohort against the rest; the flag has an owner and a removal date |

These combine. A typical service replacement uses a strangler route, a flag for the rollout, and expand–migrate–contract for the data. State for each step what is checked before moving on and who decides.

Facts checked against primary sources on 2026-10-14.
