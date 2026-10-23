# Risk register

The orchestrator keeps one register in `state.json` under `risks`, for everything that isn't a security finding: project, delivery, technical, compliance and cost risks, plus the assumptions, issues and dependencies the work relies on (a RAID log). Security weaknesses stay in the findings register, and threats in the threat model. A hook keeps a readable copy in `.tomdlc/risks.md`; read that, but change only the register.

## Entries

| Field | Content |
|---|---|
| `id` | `R-n` |
| `type` | `risk` (might happen), `assumption` (believed true, unverified), `issue` (happening now), `dependency` (something outside the team's control) |
| `description` | One sentence: cause → event → effect |
| `owner` | A named person or role |
| `status` | `open` or `closed` |
| `likelihood`, `impact` | `low`, `medium` or `high` (risks only) |
| `treatment` | `mitigate` (reduce likelihood or impact), `transfer` (insurance, contract, vendor), `accept` (live with it; needs the user's decision in their words), `avoid` (change the plan so it can't happen) |
| `action` | What's being done, by when |
| `review` | The next review date (YYYY-MM-DD) |
| `decision` | For accepted risks: the user's words, quoted |

## Where entries come from
- **Planner:** its Constraints, Assumptions, Spikes and Budget sections; anything that could stop the plan's objectives. List them in a **Risks & dependencies** section of `01-plan.md`.
- **Any agent:** findings that are risks rather than defects (e.g. "the vendor's API is in beta"). Agents report them under Findings, prefixed `Risk:`, and the orchestrator adds them.
- **Requirements:** compliance obligations that might not be met; assumptions with real consequences.
- **Design:** technology bets, integration unknowns, and cost or capacity limits.
- **Operations:** recurring incidents, cost trends, capacity forecasts.

## Rating
Use the same likelihood × impact matrix as the threat model: high × high is critical, and any rating of high or above needs a treatment and an owner straight away.

## Reviewing
- At every gate, the orchestrator reviews open risks: update ratings, close what's resolved, and add new ones.
- An open high or critical risk without an active treatment blocks the gate unless the user accepts it.
- An `assumption` that turns out false becomes an `issue`, or a new requirement.
- The SRE reviews the register in the recurring health check. Overdue review dates are flagged.

Facts checked against primary sources on 2026-10-14.
