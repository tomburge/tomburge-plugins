# Commands for the user: runbooks that run as written

Any agent that hands the user commands to run (deploys, live tests, drills, health checks, teardown) follows these rules. Each one comes from a live run where a runbook step failed, printed something other than its "Expected" line, or nearly did harm. The orchestrator's principle "commands for the user never sign them out" applies on top.

## Structure
- **Every step has an "Expected" block, and every expected value is one you've seen the service return,** not one inferred from the template. Where you haven't seen it, say so ("ASSUMPTION: not yet observed") so a mismatch is triaged rather than treated as a failure.
- **Guards halt.** A check that decides whether to continue must stop the script, not just print a word: `if ($id -ne '111111111111') { 'STOP: wrong account'; exit 1 }` in PowerShell, `[ "$id" = 111111111111 ] || { echo STOP; exit 1; }` in sh. A line that only prints `STOP` gets scrolled past.
- **Split a review from the change it reviews.** "Run the diff, answer `y` only if the prompt matches" doesn't work for a user pasting a block, or for a non-interactive run. Give the diff as one step with its stop rule, and the deploy as the next step.
- **Order follows risk:** drills and rehearsals in the lower environment, then the go/no-go, then the production change. Never schedule a drill after the change it was meant to de-risk.
- **One copy of each command.** When two documents need the same commands (an operations runbook and an infra runbook), keep the commands in one and point to them from the other, so they can't drift apart.
- **Keep the reviewed artifact read-only.** If later steps rebuild (a CI re-run, an SBOM step), have them write elsewhere (`cdk.out-ci/`, a fresh plan file) or re-verify the hashes before use. A rebuild without the release's parameters (for example a version context value) makes a later diff show changes that aren't real.

## PowerShell
- **Quote comma lists:** `--regions 'us-east-1,us-west-2'`. Unquoted, PowerShell makes an array and the program receives `us-east-1 us-west-2`.
- **`npm run <script> '--' --flag`:** quote the `--` so PowerShell passes it through.
- **Don't redirect a stream twice** (`2>&1 2>&1` is a parse error). When you rewrite `Tee-Object` lines into a script, check the result.
- **Exit codes:** `$LASTEXITCODE` holds the last native command's code. Read it on the next line, before any other native command runs.

## Prefix filters
- `starts_with(Name, 'app-prod-api-')` also matches `app-prod-api-usw2`. Where names share a prefix, filter by exact names, a tag, or a stack's resource list.

## AWS facts that expected outputs must reflect (observed 2026-10)
| Service | What it actually returns |
|---|---|
| DynamoDB global tables | `describe-table` in one region lists only the **other** regions' replicas under `Replicas` |
| DynamoDB delete | Deleting a table with point-in-time recovery on leaves a `SYSTEM` backup named `<table>$DeletedTableBackup`, kept free for 35 days. A teardown sweep shows it; report it and don't delete it |
| CloudWatch Logs | `describe-log-groups --log-group-name-pattern` printed `None` for retention that `--log-group-name-prefix` showed as `30`; use `--log-group-name-prefix` |
| CLI pagination | With auto-pagination, some commands (e.g. `logs filter-log-events`) apply `--query` per page, so `length(events)` prints one number per page (`0 0 0`). Sum them, or add `--no-paginate` when one page is enough |
| Secrets Manager | `RotationEnabled` is absent (`null`), not `false`, on a secret that never had rotation. A secret deleted by CloudFormation stack deletion was removed with no recovery window |
| Security Hub | `get-findings` rejected a `ResourceId` filter key (`InvalidInputException: Invalid parameter 'Filters'`). A `ResourceTags` filter (`[{"Key":"service","Value":"<name>","Comparison":"EQUALS"}]`) worked. Check a filter key against the `AwsSecurityFindingFilters` reference before using it |
| Security Hub, GuardDuty in organizations | A member account's hub or detector may be administered by a delegated admin account. Check `get-administrator-account` before enabling, disabling or changing standards; if an administrator is returned, the change belongs to the org admin |
| SNS email | An unconfirmed email subscription expires after 3 days, so `SubscriptionsPending` drops from 1 to 0 |
| CloudFormation drift | Disabled or default settings can come back as `null` (`SSESpecification` with `SSEEnabled: false`; a replica's `PointInTimeRecoverySpecification` with `false`). An API Gateway access log destination is stored without the `:*` that CDK's log group ARN ends with. Baseline these by logical ID, property path and value, so a real change to the same property still counts |
| CDK diff | Retained Lambda versions show as `[-] AWS::Lambda::Version ... orphan` when a new version replaces them. That's not a removal; stop rules should allow `orphan` lines and stop on any other `[-]` |
| Cost Explorer API | Each request costs $0.01; say so next to the command |

When a run shows something this table doesn't cover, add it (with the date) after the run.

## CloudWatch Logs Insights saved queries
Synth, `cdk-nag`, `terraform validate` and CloudFormation don't check a query's syntax: a malformed `queryString` deploys and fails only when someone runs it, often during an incident.
- **Run every saved query once in dev** before the slice that adds it is done: `aws logs start-query` with the definition's own query string and log groups, then `get-query-results` until `Complete`. Put that in the slice's Done-when and the dev smoke steps.
- **After `stats ... by <field>`, don't list `<field>` in a later `fields` command:** it's rejected with `Ephemeral field is already defined`. Use `display <field>, ...` to pick output columns. Listing a stats result alias in `fields` is fine (checked 2026-10-19).
