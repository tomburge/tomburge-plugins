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

<!--
Don't write Mandated, Forbidden, Stage plan presets or Learned rules sections.
A TomDLC hook appends them below, generated from the `practices` register in
.tomdlc/state.json, and rewrites them whenever the register changes. Rules
come from the user; the orchestrator records them in the register.
-->
