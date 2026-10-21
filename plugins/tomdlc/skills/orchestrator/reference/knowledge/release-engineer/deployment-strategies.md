# Choosing a deployment strategy

The architect chooses the strategy in Design (as an ADR); the release-engineer implements it. Combine it with `zero-downtime-release.md`.

## Strategies

| Strategy | How | Rollback | Needs | Fits |
|---|---|---|---|---|
| Recreate | Stop the old version, start the new | Redeploy the old version (downtime again) | Nothing extra | Development environments; batch jobs; when downtime is acceptable |
| **Rolling** | Replace instances a few at a time | Roll back the same way (minutes) | Old and new versions compatible side by side; health checks | Most stateless services; the default for low risk |
| Blue/green | Stand up the full new environment, switch traffic at once | Switch back (seconds) | Double capacity during the switch; shared data compatible with both versions | High-availability services where instant rollback matters |
| **Canary** | Send a small, growing share of traffic to the new version while comparing metrics | Shift traffic back (seconds) | Traffic splitting; good metrics to compare; enough traffic for a signal | User-facing services at moderate and high tiers |
| Shadow / dark launch | Copy production traffic to the new version without returning its responses | Nothing to roll back | Side-effect-free handling of mirrored requests | Risky rewrites, performance validation |
| Feature-flag release | Deploy the code dark; enable the feature by flag, for some users then all | Turn the flag off (seconds) | A flag system with owners and cleanup | Separating deploy from release; any tier |

## How to choose
1. **Can old and new versions run side by side?** Their data, API and message formats must be compatible both ways. If not, fix that first (expand then contract); otherwise only recreate is safe.
2. **How fast must rollback be?** Seconds means blue/green, canary or flags. Minutes means rolling is fine.
3. **Is there enough traffic to judge a canary?** With little traffic, a canary's error rate means nothing. Use synthetic checks plus a longer bake, or blue/green.
4. **Cost:** blue/green doubles capacity during the switch; canary and rolling don't.
5. **Risk tier:**
   - low: rolling, or recreate where downtime is acceptable
   - moderate: canary or blue/green for user-facing services
   - high: canary with automatic rollback triggers, plus feature flags for risky features

## Continuous delivery or continuous deployment
- **Continuous delivery** (the default): every change on `main` is releasable, and a person decides when it goes to production. That's the go/no-go in `06-release.md`.
- **Continuous deployment:** every change that passes the pipeline goes to production automatically. It fits only when automated tests, canary analysis and rollback are proven, and only at low and moderate tiers. The user must approve this choice explicitly, and the production-change guard still prevents agents from deploying.

## Software that isn't a service
- **Libraries and CLIs:** publish versioned packages; pre-releases (`-rc`) for early adopters. "Rollback" means yanking a bad version and publishing a fix.
- **Mobile and desktop apps:** use the store's staged rollout (a percentage of users), with remote feature flags for risky features. Users can't be forced to update, so the APIs must stay backward compatible.
- **Infrastructure:** plan, review and apply, in stages (development, staging, production), with the plan output attached to the release record.

## Artifacts
- Version every artifact with the release version **and** the commit SHA. Deploy by immutable digest.
- Keep the artifacts of the current and previous releases (at least) until the next release is proven. Keep release records, SBOMs and provenance as long as compliance requires.
- Clean up old, unreleased build artifacts automatically.

Facts checked against primary sources on 2026-10-14.
