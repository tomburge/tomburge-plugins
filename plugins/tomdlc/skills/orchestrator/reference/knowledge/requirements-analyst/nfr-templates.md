# NFR templates

A non-functional requirement is only useful if a test or a measurement can prove it. Use these shapes.

## Performance

`NFR-n: <operation> responds in under <target> at the <percentile> under <load condition>, measured <how and where>.`

Example: "NFR-4: `GET /orders` responds in under 300 ms at p95 and under 800 ms at p99 with 200 requests per second and 1 million orders in the database, measured at the load balancer in the staging environment."

Avoid:
- averages on their own; they hide the slow tail
- targets with no load condition
- "fast", "responsive", "scalable"

## Capacity and scalability

| Field | Content |
|---|---|
| Current load | e.g. 50 rps peak, 200k users |
| Growth | 6-month and 12-month projections, and the growth model (linear, seasonal, launch spike) |
| Peak multiplier | The ratio of peak to average, e.g. 3× on Mondays, 10× at a sale |
| Scaling mechanism | How the design scales (see the architect's NFR → mechanism table) |
| Degradation policy | What's shed first under overload (e.g. recommendations before checkout) |
| Cost constraint | The maximum acceptable cost at the projected load |

## Availability

State it as an SLO (see `../shared/slo.md`): the indicator, the target and the window. Downtime allowed per 30 days:

| Target | Allowed downtime per 30 days | Typically needs |
|---|---|---|
| 99% | 7.2 hours | A single instance with restarts |
| 99.5% | 3.6 hours | Redundant instances |
| 99.9% | 43.2 minutes | Redundancy across zones, automated failover, zero-downtime deploys |
| 99.95% | 21.6 minutes | All of the above, plus fast rollback and mature on-call |
| 99.99% | 4.3 minutes | Multi-region or equivalent; rarely worth the cost |

A system can't be more available than the product of the availability of its serial dependencies.

## Recoverability

For each scenario, give an RPO (maximum data loss) and an RTO (maximum time to restore service):
- accidental deletion of records
- data corruption
- loss of an instance or zone
- loss of a region (high tier)
- compromise requiring restore from a clean backup

Each must be proven by a restore drill (see `../shared/recovery-drills.md`).

### HA/DR strategy

Choose the cheapest strategy that meets the region-loss RTO and RPO. Within a region, high availability comes from multiple Availability Zones; the strategy is about losing the whole region.

| Strategy | Region-loss RTO | Region-loss RPO | What runs in the DR region | Relative cost | Default for |
|---|---|---|---|---|---|
| **Backup and restore** | Hours to a day | Hours (last backup copied to the DR region) | Nothing; backups are copied there, and everything is rebuilt from IaC on demand | Lowest | Low tier |
| **Pilot light** | Tens of minutes to hours | Minutes (continuous replication) | Data replicated and live; compute defined in IaC but scaled to zero or off | Low | Moderate tier |
| **Warm standby** | Minutes | Seconds to minutes | A scaled-down but working copy of the whole stack, scaled up on failover | Medium | High tier |
| **Active-active (multi-site)** | Near zero | Near zero (with conflict handling) | The full stack, serving traffic all the time | Highest | Only when the SLO needs it |

Write the choice as a requirement, e.g. `NFR-n [recoverability]: losing us-east-1 is recovered in us-west-2 by pilot light, RTO 2 h, RPO 15 min, drilled twice a year.` A strategy above backup and restore needs a DR region different from the primary, and the state checker enforces that.

## Accessibility

`NFR-n [a11y]: the user interface conforms to WCAG 2.2 level <A or AA>`, with the level taken from the risk tier scaling table. Add it only when the system has a user interface.

## Security requirements with concrete values

ASVS says *what* to control; these templates make the *values* explicit, so a test can check them. Write each as an `SR-n` citing its ASVS 5.0 ID with the version prefix (`v5.0.0-...`), since 5.0 renumbered the requirements. The defaults below are starting points by risk tier: confirm or adjust them with the user, and record the reason for any change.

**Authentication**
| Parameter | Low | Moderate | High |
|---|---|---|---|
| Multi-factor | Optional | Required for admins and privileged actions | Required for everyone; phishing-resistant (passkeys, FIDO2) for admins |
| Passwords (if used) | At least 8 characters with MFA, 15 without (NIST SP 800-63B); check against breached-password lists; no composition rules; no forced periodic rotation; allow paste and password managers | Same | Same; prefer passwordless |
| Password storage | Argon2id (or scrypt or bcrypt) with per-user salt | Same | Same, with a pepper held in a secret manager |
| Failed attempts | Rate-limit per account and per IP, with progressive delays | Same, plus alert on credential stuffing patterns | Same; avoid permanent lockout, which becomes a denial-of-service vector |
| Recovery | Single-use, time-limited reset token (≤ 1 hour); doesn't reveal whether the account exists | Same; notify the user of every reset | Same; re-verify MFA on recovery |

**Sessions and tokens**
| Parameter | Low | Moderate | High |
|---|---|---|---|
| Idle timeout | 24 hours | 30–60 minutes | 15 minutes |
| Absolute session lifetime | 30 days | 12–24 hours | 8–12 hours, with re-authentication for sensitive actions |
| Access token lifetime | ≤ 1 hour | ≤ 15 minutes | ≤ 5–10 minutes |
| Refresh tokens | Rotated on use | Rotated on use, revoked on reuse detection | Same, plus bound to the client (DPoP or mTLS) |
| Logout and revocation | Ends the server-side session | Same, plus revoke all sessions on password or MFA change | Same, plus administrator kill switch |
| Cookies | `Secure`, `HttpOnly`, `SameSite=Lax` | Same | `SameSite=Strict` where the flows allow |

**Authorization**
- **Model:** choose and record it.
  - **RBAC** (roles) when permissions follow job functions and change rarely.
  - **ABAC** (attributes and policies) when access depends on data attributes (owner, tenant, region, classification) or context (time, device).
  - **ReBAC** (relationships) when access follows sharing graphs (folders, teams, documents).
  - Most systems combine roles with ownership or tenant checks.
- **Rules that are always required:** deny by default; checks enforced server-side on every request; object-level checks (ownership or tenant) on every ID the caller supplies; separation of duties for high-risk operations at the high tier; least privilege for service identities.
- **The authorization matrix** in the functional design lists each operation; the SR states the model and the rules.

**Data protection**
- Take the baseline controls per data class from the planning guide (encryption at rest and in transit, access, logging, test-data rules), and state any class-specific values: key rotation period, field-level encryption, masking in logs and UIs.

**Secrets and keys**
| Parameter | Low | Moderate | High |
|---|---|---|---|
| Storage | Secret manager or environment, never in code | Secret manager | Secret manager or HSM-backed KMS |
| Rotation | On compromise | At least yearly, and on staff changes | Every 90 days or automatic; immediately on suspicion |

**Abuse protection**
- Per-user and per-IP rate limits on authentication, search, export and anything expensive, with the numbers stated.
- Maximum request size, page size and upload size.

## Other categories
- **Operability:** required dashboards, alerts, runbooks and log retention.
- **Maintainability:** e.g. "a new developer can run the test suite locally within 30 minutes of cloning", or limits on build time.
- **Compatibility:** supported browsers, OS versions, API clients and the deprecation window.
- **Cost:** monthly budget per environment, and cost per unit of usage.

Facts checked against primary sources on 2026-10-14.
