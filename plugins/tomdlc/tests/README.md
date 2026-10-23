# Tests

```sh
bun test                                   # every suite
bun test --test-name-pattern approval      # one suite
bun tests/suites/approval.ts               # one suite, with its own output
TOMDLC_KEEP_TEST_DIR=1 bun tests/suites/audit.ts   # keep the scratch workspace for debugging
```

Each suite in `suites/` drives the hook handlers and scripts the way Claude Code does: it writes a hook event as JSON to stdin and reads the decision from stdout. `lib/harness.ts` gives every suite a fresh temporary workspace with the fixtures it needs: a sample project, sample scanner reports and fake `semgrep` and `gitleaks` executables. It works on Windows, macOS and Linux.

| Suite | Covers |
|---|---|
| `claude-cli` | Blocking every shell route to launching Claude Code or GitHub Copilot CLI, without blocking mentions of the words |
| `hooks` | Production-change guard, ownership guard, report check, state validation, per-file scan |
| `state` | Change plans, skipped stages, slices, baseline, archived changes, session-start summary |
| `batch` | Approvals, findings register, resume point, waiver IDs, `ui` flag, shell-write ownership |
| `audit` | Hash-chained audit log, derived events, tamper and truncation detection, hook-only files |
| `approval` | Prompt audit with redaction, approval guard (user's words, time windows, quotes), document fingerprints and drift |
| `parallel` | Per-instance dispatch keys, failing closed on unidentified instances, git worktree resolution to the main checkout, unique report files |
| `web` | Web guard: secrets in queries and URLs, private and internal addresses for agents, audit logging |
| `environments` | Environment sets, separate accounts and the shared-account approval, dev deploys before promotion, one-word promotion approvals, the production guard's environment gate, HA/DR regions |
| `copilot` | GitHub Copilot CLI payloads recorded live: Write and Edit input fields (`path`, `file_text`, `old_str`, `new_str`) reach the secrets, ownership, approval and state guards and the artifact audit; subagent briefs are never logged as the user's prompts; the dispatch guard in both hosts' Agent payloads; PowerShell commands that Copilot reports as `Bash` |
| `lifecycle` | Skipped-stage dependencies, risk register, deployment record, saved reports, document-write audit, traceability checker, findings importer |
