# Recovery drills

RPO and RTO in the requirements are promises. Until a backup has been restored and the clock measured, nobody knows whether they hold. Used by the release-engineer (to prepare the first drill) and the SRE (to keep them running).

**Agents never run drills against production.** They prepare the procedure and commands; the user runs them, or approves each production step.

## Default RTO and RPO tiers

| Tier | RTO | RPO | Typical backup and replication |
|---|---|---|---|
| low | 24 h | 24 h | Daily backups; restore from backup in the same region |
| moderate | 4 h | 1 h | Point-in-time recovery or hourly backups; a standby or multi-zone database |
| high | 1 h | 15 min, or near-zero for transactional data | Continuous log shipping or synchronous replication; multi-zone, and a secondary region where the RTO needs it |

These are starting points. The requirements-analyst confirms them with the user and writes them as NFRs (e.g. NFR-n: "RTO 4 h, RPO 1 h for the orders database"). Different data stores may have different targets.

The targets drive the design:
- **RPO** sets the backup frequency and the replication mode. Backups every 24 hours can't meet a 1-hour RPO.
- **RTO** sets how much is standing by: restore from backup, a warm standby, or active failover.
- Both set how often drills run, and the drill measures them against these numbers.

A stateless service has no data to lose. Its RPO is about its configuration and secrets: they must be recoverable from IaC, the secrets store and their backups at the point the RPO names. Its RTO is the time to redeploy from known-good artifacts.

## Scenarios

| Scenario | What it proves |
|---|---|
| Accidental deletion of records | Point-in-time restore of part of the data, without a full rollback |
| Data corruption | Detection, and restore to the last good point |
| Loss of an instance or zone | Failover works and meets the RTO |
| Loss of a region (high tier) | The secondary region can take over |
| Compromise (e.g. ransomware, stolen admin credentials) | A clean restore from backups the attacker couldn't reach |

### Region failover drill
For any strategy above backup and restore: fail the production workload over to the DR region and back, on the schedule in the frequency table, in a window the user approves. Measure the real RTO and RPO against the NFRs: the time from the decision to fail over until the critical journeys work in the DR region, and the newest data that made it across. Check the parts people forget: DNS or Route 53 health-check failover, secrets and KMS keys in the DR region, service quotas there, IaC state or CDK bootstrap in the DR region, and alarms and dashboards that only watch the primary. For backup and restore, the drill is restoring from the cross-region copy into a fresh stack in the DR region. Agents prepare the runbook and commands; the user runs it.

## Restore drill procedure
1. Pick a backup the way an incident would: the latest, or the last known-good point.
2. Start a timer. Restore into an isolated non-production environment, built from the same IaC as production.
3. Verify integrity: row counts or checksums against the source, application smoke tests, and checks that the restored data is usable and not just present.
4. Measure:
   - **RTO achieved:** the time from start to a working service
   - **RPO achieved:** the gap between the backup point and the moment of the simulated failure
5. Record the result in `07-operations.md`: date, scenario, measured RTO and RPO against targets, pass or fail, and follow-up actions with owners.
6. Destroy the drill environment and any copies of real data. Restored production data inherits its data class and controls.

## Backups
- Follow 3-2-1: three copies, on two different media or services, with one off-site or in a separate account.
- At least one copy is immutable (write-once or object lock), so a compromised admin can't delete it.
- Back up everything needed to rebuild: data, secrets (escrowed securely), configuration, IaC state, and encryption keys or their recovery path.
- Encrypt backups. Restrict access to people other than day-to-day production admins.
- Monitor backup jobs; a silently failing backup is the most common way recovery fails.

## Game days
A planned exercise where you inject a failure in a pre-production environment and watch the system and the team respond.
- Write a hypothesis ("if the cache cluster dies, p95 stays under 1 s and no errors reach users"), the blast radius, and abort criteria first.
- Typical injections: kill an instance, add latency to or block a dependency, fail over the database, expire a certificate, exhaust a connection pool.
- Check detection (did the alert fire?), response (did the runbook work?) and recovery.
- Experiments in production need the user's explicit approval for each one, and are never run by agents.

## Frequency by risk tier

| Tier | Drills |
|---|---|
| low | One restore drill before the first production release |
| moderate | A restore drill before the first release and at least yearly; a game day yearly |
| high | A restore drill before the first release and quarterly; game days quarterly, including zone failover; a region failover exercise yearly |

Facts checked against primary sources on 2026-10-14.
