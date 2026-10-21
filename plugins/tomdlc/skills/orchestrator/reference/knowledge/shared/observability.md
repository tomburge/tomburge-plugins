# Observability

Used by the architect (to design it), the developer (to emit it) and the SRE (to operate it).

## What to measure
- **Golden signals** for every user-facing service: latency, traffic, errors and saturation.
- **RED** for request-driven services: rate, errors, duration.
- **USE** for resources (CPU, memory, disks, pools, queues): utilization, saturation, errors.
- **Business signals** for the critical journeys, e.g. orders placed per minute. These often catch failures that technical metrics miss.

## Logs
Structured (JSON), one event per line, with at least:

| Field | Purpose |
|---|---|
| `timestamp` | UTC, ISO 8601, millisecond precision |
| `level` | `error` for things someone must act on; `warn` for degraded but handled; `info` for business events and boundaries; `debug` off in production |
| `service`, `environment`, `version` | Which build produced the line |
| `trace_id`, `span_id` | Joins logs to traces |
| `request_id` | Correlation ID returned to clients in errors |
| `event` | A stable name such as `order.created` or `auth.login_failed` |
| `outcome`, `duration_ms` | Result and timing at operation boundaries |
| `actor` | A pseudonymous user or tenant ID, never an email or name |

Never log secrets, tokens, passwords, full card numbers or personal data. Log at operation boundaries (request in and out, external calls, state changes), not on every line. Security events from the requirements (logins, access denials, admin actions) are always logged.

## Traces
- Instrument with OpenTelemetry, and propagate W3C Trace Context (`traceparent`) across HTTP calls **and** message queues.
- Sampling: keep every error and every slow trace; sample the rest (e.g. 1–10% head sampling, or tail-based sampling if available).

## Metrics
- Name metrics by the OpenTelemetry semantic conventions where one exists (`http.server.request.duration`, with the unit `s` as metadata), so names match across tools. Prometheus exports that name as `http_server_request_duration_seconds`; if you write Prometheus metrics directly, put the unit in the name (`_seconds`, `_bytes`).
- Keep label cardinality low: no user IDs, request IDs or raw URLs as labels.

## Dashboards
One per service:
- Top row: SLO status and burn rate, then the golden signals.
- Then dependencies (latency and errors of each one) and saturation.
- Deployment markers on every graph, so changes line up with effects.

## Alerts
- **Page on symptoms** that users feel (SLO burn, a critical journey failing). **Ticket on causes** (disk filling, certificate expiring in 14 days).
- Every alert has a spec:

| Field | Content |
|---|---|
| Name | What's wrong, in plain words |
| Condition | The query, threshold and duration |
| Severity | page or ticket |
| Runbook | A link to the steps in `07-operations.md` |
| Owner and route | Who receives it, and how |

- No alert without a runbook. An alert nobody acts on gets deleted or downgraded.
- Use a minimum duration and grouping to avoid flapping and alert storms.

**Small scale:** about 3–5 alarms: errors, availability or latency against the SLO, and one usage or spend guard. No dashboards; at most 2 saved queries. Add more only when an incident shows a gap.

**Saved queries are only checked when they run.** Deploying one proves nothing about its syntax: run each once in dev before its slice is done, and see `user-runbooks.md` (Logs Insights) for a known trap.

## Anomaly alerts
Static thresholds don't fit everything: traffic that varies by hour or season, or that grows month over month. For these, alert on a baseline instead:
- rolling percentiles (e.g. error rate above the 99th percentile of the last 7 days at the same hour)
- week-over-week comparisons (e.g. orders per minute 50% below the same time last week)
- the platform's anomaly detection, where it exists

Rules:
- Alert on symptoms tied to SLOs first. Anomaly alerts add to SLO burn alerts; they don't replace them.
- Anomaly alerts are tickets, not pages, until tuned. Promote one to a page only after it has a record of firing on real problems.
- Every anomaly alert has the same spec as any other: a runbook link and an owner.
- Review noisy alerts monthly. Tune, downgrade or delete them.
- Record each alert's false-positive rate (fires with no action needed, divided by all fires) and use it in the monthly review.

## Synthetic monitoring
Probe each critical journey from outside the system every few minutes (log in, search, check out with a test account). It detects outages when real traffic is low, and checks DNS, TLS and the CDN.

## Health endpoints
- **Liveness:** the process is running. Never check dependencies here, or a database blip restarts everything.
- **Readiness:** can serve traffic. It checks critical dependencies and gates load-balancer traffic.
- Neither endpoint exposes versions of dependencies, configuration or internal hostnames.

## Retention and cost
Set retention per environment and data class: e.g. 7 days for debug data in development, 30 days for application logs in production, and longer for audit and security logs per compliance. Ingestion volume is often the largest observability cost, so sample and filter at the source.

Facts checked against primary sources on 2026-10-14.
