# Delivery slices

Develop shouldn't be one enormous dispatch. Split the work into slices the developer can build, test and have reviewed one at a time, so integration problems and design mistakes surface early.

## What makes a good slice
- **Vertical:** it delivers working behavior through every layer it needs (UI or API, logic, storage), not one layer of many features.
- **Independently verifiable:** it has its own tests and acceptance criteria, and it leaves the system working.
- **Reviewable in one pass:** small enough for one developer dispatch and one security review. As a rough guide, a slice touches no more than about 15 files and a few hundred lines of change. Split anything bigger.
- **Shippable behind a flag** where possible, so incomplete features don't block releases.

## Ordering
1. **Walking skeleton first, deployed to dev.** For a new system, slice 1 is the thinnest end-to-end path that exercises the real architecture: request in, through each component, to storage and back, built and deployed by the real pipeline. When the change has infrastructure, the skeleton includes the minimal stack and ends with the first deploy to dev, before other slices are built, so deploy-time problems surface early and once. It proves the architecture and the pipeline before features pile on.
2. **Dependencies.** A slice comes after the slices it depends on.
3. **Risk first.** Among slices whose dependencies are met, do the one that retires the biggest unknown next (a new integration, a performance-critical path, a security-critical control).
4. **Value next.** Then order by user value, reaching the requirements' MVP line before any slice for a later increment.

Write an **Ordering rationale** at the top of the Delivery Slices section: why the slices are in this order, which risk or unknown each early slice retires, and where you deviated from dependency order and why. The orchestrator re-checks the remaining order against it after each slice, using what the finished slices taught.
## Slice entry

In `03-design.md`, add a **Delivery Slices** section with one entry per slice:

| Field | Content |
|---|---|
| ID | `S-n` |
| Title | One line |
| Delivers | The `FR-n`, `NFR-n` and `SR-n` it implements, and the `T-n` mitigations it includes |
| Proves | What finishing it demonstrates (e.g. "the auth flow works end to end with the real identity provider") |
| Owns | Globs for the files the developer may write in this slice (used for `.dispatch.json`) |
| Depends on | Earlier slice IDs |
| Security review | `required` if it touches a trust boundary, auth, crypto, secrets or sensitive data; otherwise `batch` (reviewed with the next required slice or at the end of Develop) |
| Done when | The slice's acceptance criteria pass, its tests are written and green, no new failures versus the baseline, and its security review (if required) has no blocking findings |

Add a Mermaid graph of the dependencies when there are more than three slices.

## Depth by risk tier

| Tier | Slicing |
|---|---|
| low | One slice is fine for small changes; split only if the work is large |
| moderate | Walking skeleton plus slices sized as above |
| high | As moderate, and every slice touching sensitive data gets `required` security review |

For a change (rather than a new project), slices cover only the change. A bugfix or security patch is usually a single slice.

Facts checked against primary sources on 2026-10-14.
