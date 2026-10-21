# Branching and versioning

Used by the planner (to record the strategy in `practices.md`), the devsecops-engineer (to configure branch protection and CI triggers) and the release-engineer (for release lines and hotfixes).

## Choosing a strategy

| Strategy | How it works | Fits | Avoid when |
|---|---|---|---|
| **Trunk-based** (the default) | Everyone merges small changes to `main` at least daily, behind feature flags if they're unfinished. Releases are cut from `main` | Continuous delivery; one deployed version; teams with good automated tests | No automated tests; large changes can't be split |
| GitHub flow | Short-lived feature branches, pull requests to `main`, deploy from `main` | Most web services with a single production version | Several versions supported at once |
| Release branches | `main` for development; a `release/x.y` branch per supported version gets only fixes | Software shipped to customers who run several versions (libraries, on-premises, mobile) | A single deployed version: needless overhead |
| GitFlow | `develop` plus `main`, with feature, release and hotfix branches | Rarely the best choice today; only for strictly scheduled releases with long stabilization | Continuous delivery: long-lived branches cause painful merges |

**Default:** trunk-based with short-lived branches (merged within a day or two), required pull request review and status checks on `main`. Add release branches only when you must support more than one released version.

## Merging
- **Squash merge** for feature branches, so `main` has one commit per change, each traceable to a pull request and requirement IDs.
- **Rebase or merge** for release-branch backports, keeping the original commit reference.
- Never rewrite history on `main` or release branches (force-push is blocked by branch protection and the production-change guard).

## Hotfixes
- **Trunk-based or GitHub flow:** fix on `main` through the normal (expedited) process, then release. If production is far behind `main`, branch from the release tag, fix there, release, and merge or cherry-pick the fix back to `main` immediately.
- **Release branches:** fix on `main` first, then cherry-pick to each supported release branch. If the fix only applies to a release, fix it there and record why it doesn't apply to `main`.
- **GitFlow:** a hotfix branch from `main`, merged into both `main` and `develop`.

Every hotfix still goes through tests, the security review where required, and the pipeline. Emergency means faster, not skipped.

## Versions and tags
- **Semantic versioning** for anything others depend on (libraries, APIs, CLIs): MAJOR for breaking changes, MINOR for compatible features, PATCH for fixes.
- **Services** can version by date or build number, but every artifact also carries the commit SHA.
- **Tag releases** on the exact commit built, with signed tags where the tier calls for signing.
- **Pre-releases:** `1.4.0-rc.1`.

## Changelog and release notes
- Use Conventional Commits (`feat:`, `fix:`, `feat!:` for breaking changes), or pull request labels, so release notes can be generated.
- Release notes cite the requirement IDs delivered and the findings fixed, and call out breaking changes and migration steps.

## Monorepos
- Trigger CI per changed path, and version packages independently unless they must release together.
- Use CODEOWNERS per directory, so reviews reach the owning team.

Facts checked against primary sources on 2026-10-14.
