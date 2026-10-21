# Spikes

A spike is a short, time-boxed experiment that answers one question the plan can't answer by reasoning alone: will this library meet the accuracy target, is this fast enough, does this integration work at all? Its output is **evidence and a decision**, not product code.

## Before starting: the brief
The orchestrator's brief for a spike gives:

| Field | Content |
|---|---|
| ID | `SP-n`, from the plan's Spikes section |
| Question | One question, answerable with yes or no or a number |
| Exit criteria | Pass and fail rules, with numbers, copied from the plan (e.g. "missed items ≤ 1%, 300 MB in ≤ 120 s") |
| Options | The approaches to compare, including the plan's fallback |
| Time-box | The maximum effort; stop and report when it's reached, even if the answer is incomplete |
| Data | Synthetic or sanitized only. Never real customer or production data |

If anything here is missing or vague, say so under Questions for the user instead of inventing criteria.

## Doing it
- **Work only in `spike/`** (your dispatch owns `spike/**`). Spike code is throwaway: quick, readable enough to re-run, but not production quality. Nothing in `spike/` ships.
- **Pin what you install** in `spike/requirements*.txt` (or the stack's equivalent) and use an isolated environment under `spike/`, so results can be reproduced.
- **Make it reproducible:** a fixed random seed for generated data, and one command (e.g. `spike/run.ps1` or `spike/run.sh`) that runs everything and writes the results.
- **Measure, don't estimate.** If something can't be run (a missing tool, no network, a permission denied), mark it **not measured** rather than guessing.

## Long-running measurements
Benchmarks and large-data runs can take far longer than your turn should last. Don't wait for them by sleeping and polling: every check re-reads your whole context.
1. Start the long run **in the background**, writing its output to `spike/out/` and creating a marker file when it finishes, e.g. `spike/out/<name>.done` holding the exit code.
2. Finish everything else, write the results you have, and **hand back**, listing which measurements are still running, their marker files, and roughly when they should finish.
3. The orchestrator checks the markers later (in a later turn or session), and re-dispatches you, or reads the outputs itself, to complete the results.

## Results
Write `spike/RESULTS.md`:
- **Question and exit criteria**, verbatim from the brief
- **Method:** options compared, data generated (size, seed, mix), and the environment (machine, OS, runtime and library versions)
- **Results table:** each criterion with its target, the measured value for each option, and pass, fail or not measured
- **Why:** for every fail, the cause (the approach itself, the test setup, or the environment). This is what lets the user decide well.
- **Recommendation:** proceed, change the approach, adjust a criterion (and why), or fall back
- **Reusable:** what, if anything, is worth carrying into the real design (an algorithm, a test corpus generator), noting that it must be rewritten to production standard
- **New risks or requirements** the spike revealed, prefixed `Risk:` or `Requirement:`

Report the numbers honestly, including failures. A spike that fails its criteria has done its job if it shows why.

Facts checked against primary sources on 2026-10-14.
