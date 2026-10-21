# Codebase analysis

For an existing codebase, every later stage depends on an accurate picture of what's actually there. This method produces `docs/sdlc/00-codebase.md`: an as-is description, not a design proposal. Describe what you observe; mark anything inferred as such.

## Method

1. **Stack and build.** Identify languages, frameworks, package managers, build tools and runtime versions from manifests, lockfiles, Dockerfiles and CI config. Record how to build, run and test the project, with the exact commands you found.
2. **Decide what to read.** Skip vendored, generated and build-output directories (`node_modules`, `vendor`, `dist`, `build`, generated clients, migrations output). List what you skipped and why.
3. **Component inventory.** Identify the components (services, modules, packages, apps). For each, record:
   - path(s) and responsibility in one line
   - what it depends on and what depends on it
   - data it owns (tables, buckets, queues)
   - health: test presence, size and complexity hotspots, obvious debt (rated good / fair / poor, with a reason)
4. **Entry points (the attack surface).** List every way into the system:
   - HTTP/gRPC/GraphQL endpoints: method, path, handler, authentication required (yes / no / unclear), authorization check location
   - message consumers, scheduled jobs, CLI commands, webhooks and callbacks
   - admin interfaces and debug endpoints
   The threat-modeler uses this list as its starting point.
5. **Data stores and external integrations.** Databases, caches, object storage, queues, third-party APIs and identity providers, with how credentials are supplied (env var, secret manager, file, hard-coded).
6. **Dependency graph.** Internal dependencies between components, flagging cycles and components that everything depends on (coupling hotspots). Note notable third-party dependencies: outdated major versions, abandoned packages, known-vulnerable versions if a scanner is available.
7. **Tests and verification.** Where the tests are, what kinds exist, how to run them, and which components have little or no coverage relative to their risk. Note CI checks that already run.
8. **Security-relevant observations.** Where authentication and authorization happen (central middleware vs scattered checks), input validation approach, secrets handling, logging of sensitive data, crypto usage. Report observations, not a full review.
9. **Debt and risk signals.** Large files and functions, duplicated logic, TODO/FIXME clusters, dead code, inconsistent patterns, missing error handling.
10. **Scan coverage.** Be honest about what you read: analyzed in depth, skimmed, and not read. Later stages need to know where the picture is thin.

## Output: `00-codebase.md`

Start the file with a header recording what the analysis was made from:

```markdown
- **Commit:** <output of `git rev-parse HEAD`>
- **Branch:** <output of `git rev-parse --abbrev-ref HEAD`>
- **Date:** YYYY-MM-DD
- **Working tree:** clean | uncommitted changes (from `git status --porcelain`; list the affected paths if few)
```

If the project isn't a git repository, say so and record the date only.

**Refreshing on a later change.** Don't trust an existing `00-codebase.md` as is. Run `git diff --stat <recorded sha>..HEAD` and refresh the sections the changed paths touch (new or changed entry points, components, data stores, dependencies, tests). Then update the header to the new commit. If the diff is large or touches most components, redo the analysis. If the recorded commit no longer exists (history rewritten), redo it too.

Sections:
- Header (as above)
- Summary (one paragraph: what the system is and its overall shape)
- Stack & Commands (build, run, test, lint)
- Component Inventory (table)
- Entry Points (table)
- Data Stores & Integrations (table)
- Dependency Graph (Mermaid) and Coupling Hotspots
- Tests & Verification
- Security Observations
- Debt & Risk Signals
- Scan Coverage (in depth / skimmed / not read)

## Depth by risk tier

| Tier | Depth |
|---|---|
| low | Stack, commands, component list and entry points; skim the rest |
| moderate | Every section; read entry points and auth code in depth |
| high | Every section in depth for components handling confidential or restricted data; trace data flows end to end for the most sensitive operations |

Facts checked against primary sources on 2026-10-14.
