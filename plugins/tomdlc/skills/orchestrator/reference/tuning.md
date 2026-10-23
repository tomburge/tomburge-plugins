# Tuning the process

Three settings decide how much process a piece of work gets. Keep them separate:

| Setting | Decides | Set by |
|---|---|---|
| **Risk tier** (low, moderate, high) | How much *protection*: security depth, review rigor, testing, controls (see `control-map.md`) | Plan, confirmed by the user |
| **Scale** (small, medium, large) | How much *ceremony*: number of questions, review rounds, document length, how findings and gates are presented | Plan, confirmed by the user; for a change, the change's own scale |
| **Change shape** | Which stages run at all (see `change-shapes.md`) | Sizing the change, confirmed by the user |

Scale never removes a control the risk tier requires. The threat model, security requirements, the security-reviewer on trust-boundary slices, the approval checks and the hooks all still apply. Scale only changes how much is written, asked, tested and re-reviewed around them: at the small scale, the same controls in fewer, grouped requirements and threats, with tests sized to the real load.

## Choosing the scale

| Scale | Typical shape |
|---|---|
| **small** | One or two people; a few weeks; one deployable thing (a CLI, a library, a small service or internal tool); up to about 15 Must FRs; few integrations |
| **medium** | A team; one to six months; several components; several integrations |
| **large** | Several teams or more than six months; many components; several releases |

For a change to an existing project, set the change's scale from the change itself: most bugfixes and security patches are small even in a large system.

## Process weight by scale

| Lever | Small | Medium | Large |
|---|---|---|---|
| Questions per round (everything asked in one message: questions mode, gate and finding decisions, carried-over questions) | At most 5, ranked by consequence; the rest become stated defaults | At most 8 | At most 8 per area, batched by area |
| Defaults | One line: "N defaults applied; see `decisions.md`". List a default only if it's surprising or risky | A short list | Grouped by area |
| Discovery | Only when build-versus-buy or the problem itself is unclear; 3 options at most; short | As in the discovery guide | As in the guide, per product area |
| Spikes | Only for unknowns that block a decision; 1–2 days | As planned | As planned, in parallel where independent |
| ADRs | Only hard-to-reverse decisions, usually 5 or fewer | As needed | As needed, with an index |
| Functional design | Only rules, states, money and permissions | Per the tier | Full |
| Delivery slices | 2–6 | 5–15 | Split the work into releases or changes of at most about 15 slices each; use parallel slices |
| Review rounds per stage | One review; then the orchestrator checks the fixes, with no second review unless a critical or high finding was fixed | Up to 2 | Up to 3, per area |
| Low findings | Batched into one cleanup list per stage, fixed in the next editing pass, never a reason for another review round | Batched | Batched per area |
| Pillar review (moderate and high tiers) | Only the pillars that matter for how it runs (a CLI: supply chain and cost; a service: all) | All pillars | All, repeated after major changes |
| Reviewer code mode (moderate and high tiers) | Once over the change before the Develop gate | Per the tier table | Per the tier table |
| Non-functional requirements | Only what a user would notice or a decision depends on. Limits (body size, timeouts, rates, memory) are configuration values, each checked by one test. No capacity, scalability or sustainability NFRs unless a known load demands them | Per the NFR templates | Full, per component |
| Security requirements and abuse cases | The ASVS controls for the actual attack surface. Group related controls into one SR with parts (SR-3a, SR-3b). Usually about 15 SRs or fewer, and one abuse case per entry point or trust boundary | Per the tier | Full, per area |
| Edge-case sweep | Only conditions the system's real inputs can reach | Per the tier | Per area |
| Threat model | One STRIDE pass per trust boundary. Merge threats that share a mitigation. Usually about 20 threats or fewer; low-rated threats go in one table without write-ups | Per the tier | Full, per area |
| Performance and resource testing | The tier's shapes, sized to the expected peak (10× is plenty), with a 30-minute soak at the moderate tier. Check resource limits as the platform reports them (e.g. `docker stats`). Under a flood, check graceful rejection (429 or 503, no crash, recovery afterwards), not kernel or socket memory accounting, unless a limit is breached in normal use | Per the tier | Per the tier |
| Tests | One or more tests per requirement, mitigation and edge case that applies. Don't add exhaustive combinations or tests of implementation details to raise the count | Per the tier | Per the tier |
| Design changes during Develop | Recorded as deviations in `04-develop.md`; one sync pass and one re-approval before the gate (security-weakening deviations go to the user at once) | Same | Same, per area |
| First dev deploy | At the end of the walking skeleton, before the other slices; later deploy and live-check steps batched per group of slices | Same | Per area |
| Develop dispatches | Batch small slices that share files or a reviewer into one developer dispatch; one batched security review over the change unless a slice crosses a trust boundary | One dispatch per slice | Per slice, parallel where independent |
| Monitoring | About 3–5 alarms on symptoms users or cost would notice (errors, availability or latency against the SLO, a usage or spend guard); no dashboards; at most 2 saved queries | Per the SLOs | Per the SLOs, per area |
| CI and gate tooling | Standard tools with their stock configuration (gitleaks, Semgrep, Checkov or Trivy, cdk-nag, tflint). No custom gate scripts unless a high finding needs one, and then the smallest one that closes it | Custom checks where a standard tool falls short | As medium, owned by a platform team |
| IaC tests | Assert the security-relevant properties (IAM, network exposure, encryption, retention, deletion protection) and the service limits; don't assert every property the code sets | Per the IaC guide | Per the IaC guide |
| Live-only test scripts | One smoke script and one negative-path script; anything more waits for the first real run | As needed | As needed |
| Operations docs | One runbook file with a section per alert; the release record and operations doc at a page or two each | Per the SRE guide | Per the SRE guide, per area |
| Waivers | One waiver per stage for the checks only the user can run (drills, email delivery, live probes), listing them; scanner suppressions grouped per rule | One per decision | One per decision |
| Gate presentation | One line for the criteria that are met; list only unmet, waived and N/A criteria | Same | Same, grouped by area |
| Context checkpoints (`resume` and `decisions.md` current, so compaction loses nothing; never ask the user for a new session) | At each gate | At each gate | At each gate, and per area or batch of slices |

## Trimming Develop at the small scale
Two small AWS projects at the low tier spent most of their budget in Develop (about $46 and $56): 580–670 tests, 9 alarms, custom CI gate scripts with hundreds of subtests, 9–17 waivers, and a review per slice. Requirements and design were right-sized; what Develop *built around* the code wasn't. The rows above set the small-scale budget for those outputs. The controls the tier requires stay: secrets scanning, SAST, IaC scanning, the security review on trust boundaries, and tests for every requirement and mitigation.

## The high tier at the small scale
The tier sets how deep each control goes. The scale sets how many there are, and the small-scale rows above still apply at the high tier. A live run on a 300-line payment service at high and small produced 6 slices, 24 SR groups, 30 threats, 228 tests after two slices and about $130 of work, before refunds (the feature that was asked for) had been started. Most of the volume came from three habits:
- **Folding pre-existing fixes into the change.** Orientation found 14 problems; the change took in most of them, and the feature slipped behind them. Propose only the pre-existing fixes the change can't be correct or safe without (and any critical one) inside the change. Offer the rest as a separate `security-patch` or `bugfix` change, done first if they block, so each change stays small enough to finish.
- **Counts growing with depth.** Keep to the small-scale counts (about 15 SRs, about 20 threats, 2–6 slices) and spend the tier's extra effort on depth where the money or the trust boundary is: worked examples, attack trees for the money paths, ASVS L3 on those paths, and mutation or property tests there, rather than more of everything.
- **A medium in every re-check.** Each rework pass changed several documents, and each scoped re-check found one more medium that the rework had caused. The rules below apply at the high tier too. After the first rework round, put new mediums to the user at the gate (fix now or fix later) instead of starting another round. Make all the edits for a gate in one pass, so there's one re-check to run.

Before Develop at the high tier and small scale, check the plan against these numbers, and propose a split (an earlier change, or a later release) when it's over them.

## Converging instead of churning
Review rounds that keep finding smaller and smaller issues cost more than they save. At every scale:
- **A re-review checks the fixes,** and the sections they changed. It doesn't re-read the whole document looking for new issues.
- **New findings in a re-review must be medium or above, or caused by a fix.** Anything else goes in the cleanup list.
- **Stop reviewing a stage when no critical, high or medium findings are open.** Low ones are batched.
- **Fix-loop limits still apply.** Hitting the limit means asking the user, not another round.
- **At the low tier or the small scale, only critical and high findings keep a fix loop going after the first round.** Remaining medium findings go to the user at the gate with the reviewer's suggested fix, to fix now, fix later or accept. This matters most for the project's own tooling (CI guard scripts, hooks, dev scripts), where each round tends to find a narrower bypass that only someone who can already commit could use.
- **Admin-level threats are one residual at the low tier.** A threat that needs administrator access to the account, or the power to change its IAM, code or configuration (other admins in a shared account, a compromised admin session), can't be prevented by the project and has endless variants. At the low tier, record that class once as a single residual risk for the user to accept, add only detection that's nearly free, and don't mitigate it vector by vector. A re-review that finds another admin-only vector adds it to that residual rather than raising a new finding. At the moderate and high tiers, the answer is account separation (see `aws-foundations.md`), not per-vector patches.
- **Severity reflects who can exploit it.** A bypass of a project's own check that needs commit access isn't high or critical unless the tier's threat model treats insiders as attackers.

## Changes to existing projects
- **Ask only about the change.** Questions about parts of the system the change doesn't touch are out of scope.
- **Review only what changed**, plus what it directly depends on. Give reviewers the changed sections, or the diff, and the IDs involved, not whole documents.
- **Approved content stays approved** unless the change contradicts it. Then it's updated and re-approved like any other drift.
- **Pre-existing problems don't block the change.** A finding about something the change didn't touch is marked `preexisting: true`, recorded, and offered to the user as a later change or a risk. It blocks only if it's critical.
- **Edge cases, completeness and the threat model** cover only the touched flows and the boundaries the change crosses.
- **The baseline and blast radius rules still apply** (see the developer's guide for changing existing code).

## Large new projects
- Split the work into **several changes or releases** (an MVP, then increments), each with its own run through the stages. One enormous cycle is hard to review and impossible to keep in one session.
- **Batch questions and reviews by area** (e.g. identity, billing, reporting), so each round stays focused.
- **Run independent slices in parallel,** and keep sessions per area or per batch of slices.
