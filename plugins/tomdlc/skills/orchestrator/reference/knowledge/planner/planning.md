# Planning

## Choosing the risk tier

| Tier | Typical examples |
|---|---|
| low | An internal tool for a small team; a prototype with fake data; a static site with no user accounts |
| moderate | A customer-facing web app with accounts; an internal system holding customer contact data; a public API |
| high | Payments or financial records; health data; authentication or identity infrastructure; systems whose failure could harm people; anything a regulator audits |

When it's borderline, choose the higher tier for the parts that handle the sensitive data, and say so.

## Data classification and baseline controls

Classify every data type, then apply at least these controls. Requirements may add more.

| Class | Examples | At rest | In transit | Access | Logging | Test environments |
|---|---|---|---|---|---|---|
| Public | Marketing content, published docs | No requirement | TLS | Anyone | No requirement | Allowed |
| Internal | Internal docs, non-sensitive config | Platform encryption | TLS | Employees and services that need it | Normal | Allowed |
| Confidential | Customer contact details, account data, business metrics | Encrypted, with managed keys | TLS 1.2+ | Role-based, least privilege, reviewed regularly | Access logged | Masked or synthetic only |
| Restricted | Credentials, payment card data, health records, government IDs, secrets | Encrypted, with separately controlled keys; field-level encryption or tokenization where possible | TLS 1.2+, mutual TLS between services where practical | Named individuals or services, with just-in-time access for humans | Every access logged and alerted on anomalies | Never; synthetic only |

## User interface
Record whether the system has a user interface (web, mobile, desktop or a significant CLI). If it does, the orchestrator sets `ui: true`, and the ux-designer joins Design.

## Budget
Record:
- the monthly budget per environment, or the overall cost ceiling
- who owns the cost
- budget alert thresholds (e.g. 50%, 80% and 100%)

The architect's cost estimate is checked against this.

## Build, buy or reuse
For each major capability that isn't core to the product (authentication, payments, search, notifications, scheduling), compare:

| Option | Fit to requirements | Security and compliance | Total cost (build and run) | Lock-in and exit cost | Time to deliver |
|---|---|---|---|---|---|

Default to buying or reusing proven services for security-critical commodity capabilities such as identity and payments. Record the decision as an input to the architect's ADRs.

## Toolchain checklist
- Source control, and its hosting service
- CI/CD system
- Artifact and container registry
- IaC tool
- Secret manager
- Observability stack: logs, metrics, traces, alerting
- Ticketing and on-call tools
- Scanners already licensed or in use

Record what exists and what needs setting up.

Facts checked against primary sources on 2026-10-14.
