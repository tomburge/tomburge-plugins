# Project practices

<!--
Team practices every TomDLC agent follows. The orchestrator passes the relevant
sections in each brief. Delete the hint under a heading once you fill it in;
an empty section means "use the plugin defaults".
-->

## Code style
<!-- Language versions, formatter and linter config, naming, folder structure, error-handling conventions. -->

## Testing approach
<!-- TDD / test-first / test-after; test command; coverage target; where unit, integration and e2e tests live; test data rules. -->

## Branching and review
<!-- Branching strategy (default: trunk-based with short-lived branches); required reviewers; commit message format.
     May TomDLC make local commits (never pushes) so it can build slices in parallel git worktrees? yes / no (default: ask). -->

## Dependencies
<!-- Allowed registries, license policy, approval needed for new dependencies. -->

## Deployment
<!-- Release cadence, freeze windows, environments, who approves production releases. -->

## Mandated
<!-- Tools, libraries or patterns that must be used (e.g. "all HTTP clients use lib/http"). -->

## Forbidden
<!-- Tools, libraries or patterns that must not be used. -->

## Stage plan presets
<!-- Named, reusable stage plans the user has approved before, e.g.
     **dependency-bump** (shape: dependency-update): plan skip, requirements skip, design skip, develop light, test light, deploy light, maintain skip.
     Not for: major versions or anything touching auth. The orchestrator offers a matching preset when sizing a change. -->

## Learned rules
<!--
Corrections the user made that should apply from now on. The orchestrator adds
these with the user's consent, one per line:
- YYYY-MM-DD: <rule> (<why>)
-->
