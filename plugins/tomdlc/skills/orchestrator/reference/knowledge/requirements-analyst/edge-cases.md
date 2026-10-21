# Edge-case sweep

Most defects that get past requirements are not exotic. They're ordinary conditions nobody wrote down: an empty list, a time zone, a double click, a half-finished upload. Abuse cases cover deliberate attacks; this sweep covers everything else.

## Method

1. **Fix the deployment shape first.** Say what the system is: a local CLI or desktop app for one user; a single-tenant service; a multi-tenant SaaS; a library; a batch job; an embedded component. Then cross out the surfaces that can't apply. A single-user local tool has no tenants or concurrent editors; a library has no screens. Don't spend effort on rows that can't happen.
2. **List what the system is made of.** Take the main user flows and the components from the plan, or from `00-codebase.md` for an existing codebase.
3. **Cross each flow or component with the remaining surfaces below.** For each one, ask: "does this flow touch this surface, and what happens at its edges?"
4. **Settle every condition that applies, with its expected outcome.** The tables below give a default "what must be true" for each condition; adopt it, adapt it, or replace it. Each condition ends as exactly one of:
   - an acceptance criterion on an existing `FR-n`, or a new `FR-n` or `NFR-n`, stating the expected outcome
   - an `ASSUMPTION:` with a reason the user can correct (e.g. "ASSUMPTION: amounts are in a single currency, because the plan names one market")
   - an explicit **out of scope** entry with a reason
5. **Ask only what you can't decide.** If a sensible default exists, write it down as an assumption rather than turning it into a question. Questions are for conditions where any default would be a guess with real consequences.
6. **Record the sweep** as an "Edge cases" table in `02-requirements.md`: flow or component, surface, condition, expected outcome, and how it was settled (requirement ID, assumption or out of scope).

Also read `docs/sdlc/standards/requirements-analyst/edge-cases.md` if the brief lists it: it holds conditions this project has learned the hard way.

## Depth by risk tier

| Tier | Sweep |
|---|---|
| low | The main user flows, against the surfaces that obviously apply |
| moderate | Every flow and component, against every applicable surface |
| high | Every flow and component, against every applicable surface, plus failure combinations (e.g. a retry during a partial failure) |

## Surfaces, conditions and default outcomes

**Input and text**
| Condition | What must be true |
|---|---|
| Empty, missing or whitespace-only value | Rejected with a message naming the field, or a documented default applies |
| Value at and beyond the maximum length | The maximum is accepted; beyond it is rejected before any processing, without truncating silently |
| Unicode: emoji, combining characters, right-to-left text, different normalizations | Stored and displayed intact; comparisons normalize first (é in one or two code points matches) |
| Case and surrounding whitespace in identifiers (emails, usernames) | One canonical form for matching and uniqueness; the original is shown as entered |
| Look-alike numbers (postal codes, phone numbers, leading zeros) | Handled as text, never converted to numbers |

**Numbers, money and units**
| Condition | What must be true |
|---|---|
| Zero, negative, very large, fractional | Each is either valid with a defined result or rejected; no overflow or silent wraparound |
| Rounding | The rule (half-up, half-even, truncate) and *where* rounding happens are stated; parts shown add up to the total shown |
| Unknown vs zero vs not applicable | Three distinct states, displayed differently; unknown is never shown as 0 |
| Missing price or rate | "No known price" is never treated as free |
| Estimates and approximations | Labelled as estimates wherever they're shown |
| Currency, units, locale formats (decimal comma) | Units and currency are always explicit; parsing and display follow the stated locale rules |

**Time**
| Condition | What must be true |
|---|---|
| Time zones, daylight saving transitions | Stored as UTC instants; nonexistent and repeated local times have a defined handling |
| "Today", end of month, leap days | Defined in a stated time zone; month-end rules stated (e.g. Jan 31 + 1 month) |
| Implausible timestamps (far past, future, before the record was created) | Rejected or flagged, not silently stored |
| Clock skew between services | Ordering doesn't depend on comparing clocks of different machines |
| Expiry exactly at the boundary | Whether the boundary instant is valid is stated |
| Two events with the same timestamp | Order is still deterministic (a tie-breaker exists) |

**Collections and aggregates**
| Condition | What must be true |
|---|---|
| Zero, one, many items | Empty state is explicit; very large sets are paginated or bounded |
| Items added or removed between pages | No duplicates or gaps the user would notice; the sort order is stable |
| Duplicates | Whether duplicates are allowed is stated, and enforced |
| Totals from several sources, one of which failed | Never shown as a complete total: the result is marked partial, with what's missing |
| Records with no owner or category | Counted in an explicit "unassigned" bucket rather than dropped |

**Identity of things**
| Condition | What must be true |
|---|---|
| Two records that look the same; merged or renamed records | Identity is by ID; merges keep a pointer from old to new |
| References to deleted or archived records | Defined behavior (shown as deleted, hidden, or blocked from deletion) |
| Guessable or exposed IDs | No enumeration of others' records (see the authorization requirements) |

**Files and formats**
| Condition | What must be true |
|---|---|
| Empty, huge, truncated or corrupt files; wrong content type | Rejected with a clear message before processing; size limits enforced while streaming |
| Archives that expand hugely, XML entity expansion | Expansion limits enforced |
| Unknown or operating-system metadata files (`.DS_Store`, `Thumbs.db`) | Ignored or rejected deliberately |
| Paths with spaces, unicode or `..`; case-insensitive file systems | Paths normalized and confined to the intended directory |
| A write interrupted halfway | No half-written file is ever read: write to a temporary file, then rename atomically |
| Every format parsed: invalid, unexpected version, extra or missing fields | Unknown versions rejected or handled explicitly; extra fields ignored or rejected as the contract says |

**Concurrency and repetition**
| Condition | What must be true |
|---|---|
| Double submit, double click, retried request | The operation happens once (idempotency key or deduplication) |
| Two users editing the same thing | A conflict is detected and reported; it's never last write wins silently, unless that's the stated rule |
| An older response arriving after a newer one | Stale responses are discarded (by version or request ID) and never overwrite newer data |
| Feedback loops (an update triggers itself; re-render loops) | Loops are impossible by design, or bounded |
| Work that hangs | Every long-running job has a heartbeat or timeout, and stuck work is detected and recovered |

**Network, dependencies and tools**
| Condition | What must be true |
|---|---|
| A dependency times out, is slow, or returns partial data | A timeout applies, the user sees a defined degraded result, and nothing is left half-done |
| A dependency down at startup vs mid-operation | Startup fails clearly or retries with backoff; mid-operation follows the degradation rule |
| Retries that would duplicate side effects | Only idempotent operations are retried |
| A third-party tool or subprocess missing, hanging or failing | Detected with a clear message; subprocesses have timeouts |

**Storage, caching and state**
| Condition | What must be true |
|---|---|
| Partial failure halfway through a multi-step operation | All-or-nothing, or a defined compensating action, and no orphaned records |
| Disk or quota full | A clear error; no corruption |
| Data that outgrows its expected size | Limits and the behavior at the limit are stated |
| Cached data | Its maximum staleness is stated; which copy is the source of truth is stated |
| Old and new versions running together (during deploy or rollback) | Data written by either can be read by both (see expand then contract) |
| Migration of existing data when rules change | Existing records are migrated or explicitly grandfathered |

**Sessions and jobs**
| Condition | What must be true |
|---|---|
| Session expiry mid-flow | The user's input isn't lost; they can re-authenticate and continue |
| The same user in two tabs or devices | Defined behavior; no corruption |
| Background jobs that overlap, run late, run twice or never finish | Jobs are idempotent, guarded against overlap, and monitored for missed runs |
| A long operation the user abandons | It completes or is cleaned up; it doesn't hold locks forever |

**Screens and user input** (when there's a UI)
| Condition | What must be true |
|---|---|
| Empty, loading, error and partial states | Every screen specifies all of them (see the ux-designer) |
| Back button, refresh, deep links into the middle of a flow | Safe: no duplicate submissions; the flow resumes or restarts cleanly |
| The same fact shown in two places | Both update together, or one is the clearly labelled source |
| Rules checked in the browser | The same rules are enforced on the server |
| Small screens, zoom, keyboard-only use, screen readers | Covered by the accessibility requirement |

**Configuration, environments and first run**
| Condition | What must be true |
|---|---|
| Missing or invalid configuration | Startup fails fast with a message naming the setting |
| Several configuration sources (file, environment, flags) | Precedence is stated |
| First run with no data | A defined, useful empty state, not an error |
| Works locally but fails in CI or production | Toolchain and dependency versions are pinned; supported platforms and versions are stated |
| Feature flags in each state | Each state is a tested configuration |

**People and permissions**
| Condition | What must be true |
|---|---|
| A role changes mid-session; a user is deactivated with an open session | Takes effect within a stated time, at the latest on the next request |
| Export, correction and deletion requests for personal data | Defined, including what deletion means for linked records (see the compliance guide) |

**AI and generated content** (when the system uses models or agents)
| Condition | What must be true |
|---|---|
| Output that's empty, malformed, too long or confidently wrong | Validated before use; failures are handled like any dependency failure |
| Input larger than the model's context | Truncation or chunking is explicit and doesn't silently drop required content |
| Prompt injection through content the model reads | Treated as untrusted data (see the threat model) |
| Consequential actions proposed by a model (payments, deletions, messages sent) | Require a person's confirmation |

## Acceptance criteria per requirement

Every `FR-n` should have at least:
- one happy-path criterion
- one error-path criterion (what the user sees and what state is left)
- boundary values for any limit it mentions

## Growing the list

When a postmortem finds a defect caused by a condition nobody considered, the orchestrator adds that condition (with its expected outcome) to `docs/sdlc/standards/requirements-analyst/edge-cases.md`, so future sweeps in this project include it.

Facts checked against primary sources on 2026-10-14.
