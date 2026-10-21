# Pipeline gates

## Where each check runs

| Stage | Checks | On failure |
|---|---|---|
| Pre-commit (local) | Format, fast lint, secrets scan | Commit blocked |
| Pull request | Build, unit tests, coverage (no decrease), SAST, SCA and license policy, secrets scan, IaC scan, API contract lint and breaking-change check, suppression check | Merge blocked |
| Main branch build | Container scan, SBOM, signing and provenance (per tier) | Artifact not published |
| Staging | Deploy, smoke tests, contract tests, DAST (per tier) | Promotion blocked |
| Release | Re-scan the release candidate; verify signatures and provenance | Release blocked |
| Scheduled | Dependency and container re-scans of deployed artifacts | Ticket or page, per severity |

## Thresholds
- Take them from the security check criteria in `01-plan.md`. Usually: fail on any new critical or high finding.
- For findings that already existed in a legacy codebase, record them with waivers and fail only on new ones. Don't weaken the scanner configuration to hide them.

## Suppressions
Every tool-level suppression is an accepted risk and must be traceable to a waiver in `state.json`:
- inline markers: `nosemgrep`, `# nosec`, `// NOLINT`, `# noqa: S…`, `#checkov:skip`
- ignore files: `.trivyignore`, `.gitleaksignore`, `.snyk`, osv-scanner ignores, dependency audit allowlists

Write each one with the rule ID, the waiver ID and the expiry, e.g.:

```
# nosemgrep: python.lang.security.audit.eval -- W-3, expires 2026-12-31: input is a constant table
```

Then:
- Keep a **Suppressions** inventory in `04-develop.md`: file, rule, waiver ID, expiry.
- Add a CI step that searches for suppression markers and ignore-file entries, and fails when one has no `W-n` reference. Optionally, fail on expired waivers too.
- The security-reviewer flags any new suppression without a waiver.

If the brief's waivers have no ID yet, list the suppressions under Questions for the user, so the orchestrator can create the waivers.

## API contracts
When the design defines API contract files:
- Lint them (e.g. Spectral, Redocly).
- Diff them against the main branch for breaking changes (e.g. oasdiff, buf breaking). Fail on a breaking change unless the version was bumped.

**Small scale:** use the standard tools with their stock rules and fail thresholds. Don't write custom gate scripts (suppression ledgers, allow-lists, policy engines) unless a high finding needs one; then write the smallest check that closes it, with a handful of tests.

## IaC gates
The "IaC scan" in the pull request row expands to the steps below for Terraform or CDK. Agents never apply; the pipeline or the user does.

- **Format, validate, lint:** `terraform fmt -check`, `terraform validate`, `tflint`. CDK: `cdk synth` with cdk-nag (AwsSolutions pack) as an aspect, so violations fail the synth.
- **Security scan:** Checkov or Trivy config on the code, and on the plan JSON (`terraform show -json tfplan`) or `cdk.out/` templates. Same thresholds and suppression rules as above (`#checkov:skip` comments, Checkov `Metadata` skips, `#trivy:ignore` comments and cdk-nag acknowledgements or `NagSuppressions` all cite `W-n`). Prowler's IaC provider (5.25.0 and later) is another option: `prowler iac ... -M sarif` writes SARIF 2.1.0 for GitHub Code Scanning and `import-findings.ts`, with critical and high mapped to `error`, medium to `warning`, and low and informational to `note`.
- **Policy as code** on the plan JSON with OPA/Conftest (or Checkov custom policies): no public stores, required tags, no destroy of protected resources, allowed regions and instance types.
- **Plan or diff posted for review** on the pull request (`terraform plan`, `cdk diff`). The security-reviewer reads it with `../security-reviewer/iac-review.md`.
- **Apply** only from the pipeline with an OIDC role per environment (trust pinned to the repo and protected branch or environment), or by the user. Prod needs a manual approval. The apply uses the reviewed plan: a saved `tfplan` artifact or the synthesised cloud assembly from the same run. If the plan changed, review again.
- **Drift check** scheduled per `../platform-engineer/environments.md`; drift is reported as a finding.

| Gate | Low | Moderate | High |
|---|---|---|---|
| fmt / validate / lint (or synth + cdk-nag) | Required | Required | Required |
| Security scan (Checkov or Trivy config) | Required | Required, on code and plan | Required, on code and plan |
| Policy as code on plan JSON | Optional | Required | Required |
| Plan / diff posted and reviewed | Required | Required | Required, two reviewers for prod |
| Apply | User or pipeline; prod approval by the user | Pipeline via OIDC; manual approval for prod | Pipeline via OIDC; two-person approval for prod, saved plan only |
| Drift check | Monthly | Weekly | Daily |

## Credential-free builds
Builds and tests run third-party code (install scripts, test frameworks, synth), so they must not see cloud credentials.
- **In CI:** the build and test jobs get no cloud role. Only the deploy job assumes a role (OIDC), and it runs no dependency installs.
- **Locally:** run the build with no `AWS_*` variables and an isolated home directory, so the CLI's config, SSO cache and credentials files aren't on the default paths: set `HOME` (and `USERPROFILE` on Windows) to a fresh empty folder for the build, and install dependencies with scripts disabled (`npm ci --ignore-scripts`, `pip install --only-binary :all:` where practical). Delete the folder afterwards.
- **Warn, don't block,** when credentials exist under the real home: an isolated home keeps them off the default paths, but code can still read them by absolute path. Record that residual risk; logging out of SSO before a release build closes it.
- Never require the user to delete their credentials or log out of other sessions to build. That breaks their other work and they'll route around it.

## Promotions through a pipeline

When deploys run from CI instead of the user's terminal, the pipeline carries out TomDLC's promotions; it doesn't replace them. The user still approves each promotion in TomDLC with the single word "Approve" (recorded in `environments.promotions`), and the pipeline enforces the same path and records the evidence.

**Set-up (GitHub Actions; GitLab protected environments with approval rules work the same way):**
- One **GitHub Environment** per TomDLC environment: `dev`, `stage`, `prod` (only those in the project's set). `stage` and `prod` have **required reviewers** (the people who say "Approve" in TomDLC), "prevent self-review" off for a sole maintainer, and deployment branches limited to `main` (or release tags).
- One **OIDC deploy role per environment, in that environment's AWS account**, trusting only that environment: the trust policy's `sub` condition is `repo:<org>/<repo>:environment:<env>`, or `repo:<org>@<owner-id>/<repo>@<repo-id>:environment:<env>` for repositories created, renamed or transferred after 15 July 2026 (or opted in to GitHub's immutable subject claims), never a branch wildcard. The role ARN is an environment variable (`vars.AWS_ROLE_ARN`), not a secret, and no long-lived keys exist anywhere.
- **Build once:** the build job produces the artifact (image digest, zipped bundle, `cdk.out` or saved Terraform plan per environment) and its identifier; deploy jobs only download it. A promotion deploys the identifier recorded in the TomDLC promotion, never a rebuild.
- The workflow is started with the **promotion ID** and the build as inputs, so its run is tied to one TomDLC promotion.

**Template** (`.github/workflows/promote.yml`; pin each action to a full commit SHA, shown here by tag for readability):

```yaml
name: promote
on:
  workflow_dispatch:
    inputs:
      environment: { description: "dev, stage or prod", required: true, type: choice, options: [dev, stage, prod] }
      promotion:   { description: "TomDLC promotion ID (P-n); empty for dev", required: false }
      build:       { description: "Git SHA or artifact digest being promoted", required: true }
permissions: { contents: read }
concurrency: { group: deploy-${{ inputs.environment }}, cancel-in-progress: false }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}          # stage and prod wait here for the required reviewers
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v7
        with: { ref: ${{ inputs.build }} }          # exactly the promoted build
      - uses: aws-actions/configure-aws-credentials@v6
        with: { role-to-assume: ${{ vars.AWS_ROLE_ARN }}, aws-region: ${{ vars.AWS_REGION }} }
      - name: Check the account before deploying
        run: |
          actual=$(aws sts get-caller-identity --query Account --output text)
          test "$actual" = "${{ vars.AWS_ACCOUNT_ID }}" || { echo "::error::account $actual is not ${{ vars.AWS_ACCOUNT_ID }}"; exit 1; }
          echo "accountBeforeDeploy=$actual" >> "$GITHUB_STEP_SUMMARY"
      - name: Deploy (the reviewed plan or synthesized assembly for this environment)
        run: ./scripts/deploy.sh "${{ inputs.environment }}"
      - name: Read back what's running
        run: echo "deployedBuild=$(./scripts/deployed-build.sh "${{ inputs.environment }}")" >> "$GITHUB_STEP_SUMMARY"
```

**Recording it in TomDLC:** after the run, the user pastes the run URL and the two summary values. The orchestrator records them in the promotion's `checks` (`accountBeforeDeploy`, `deployedBuild`, `at`) and links the run in `06-release.md`. A failed account check, or a `deployedBuild` that isn't the promoted build, stops the promotion like any other failed gate.

**Rules:**
- The production guard still blocks agents from triggering deploys: `gh workflow run promote.yml` is a pipeline change only the user makes.
- Don't let the pipeline promote on its own schedule (no auto-promotion from dev to stage on merge) unless the user has said so in `practices.md`. Then the orchestrator still records each promotion, and its approval is the GitHub Environment review, linked as evidence.
- The plan or diff the user reviewed must be the one applied: for Terraform, save the plan as an artifact in the plan job and apply that file; for CDK, deploy the synthesized `cdk.out` from the build job.

## Pipeline security
- Pin third-party actions and images to a commit SHA or digest.
- Give jobs the least-privilege token; read-only by default.
- Use OIDC federation for cloud access instead of stored keys.
- Never echo secrets; mask them in logs.
- Protect the pipeline configuration with CODEOWNERS and required review. Pipeline changes are high-risk changes.
- Don't run untrusted pull requests from forks with secrets or write tokens.
- High tier: ephemeral, isolated runners for builds that produce release artifacts.

## Minimal base images
Pick the smallest base image the runtime allows, and record why:

| Base | Use when |
|---|---|
| Distroless | The app is a static binary or needs only a language runtime; no shell or package manager |
| Chainguard / Wolfi | You want a minimal glibc image with frequent CVE fixes |
| `-slim` (Debian) | You need glibc and a few OS packages |
| Alpine | Small image and musl is known to work for this app |

Avoid Alpine/musl when the app uses glibc-dependent native modules (common with Python wheels and Node addons), or when musl's DNS resolver behaviour causes problems (search domains, TCP fallback). Use `-slim` or Wolfi instead.

Rules:
- Pin the base image by digest, not just by tag.
- Use multi-stage builds: compilers, package managers and build tools stay in the build stage and don't ship.
- Run as a non-root user (`USER` with a numeric UID).
- No shell in the runtime image where the runtime allows it.
- Rebuild when the base image gets CVE fixes: a scheduled rebuild (e.g. weekly) plus the container scan gate. A digest-update bot (Renovate, Dependabot) opens the pull request.
- Record the base image, its digest and the update cadence in `04-develop.md`.

## Reusable pipeline templates
Define the security gates once, in a versioned, reusable definition, instead of copying steps into each repo:
- GitHub Actions: reusable workflows (`workflow_call`) or composite actions
- GitLab CI: `include:` of a project template
- Azure Pipelines: `extends:` or step templates from a template repo

Rules:
- Repos call the template with parameters (language, paths, tier). They don't copy its steps.
- Pin the template by commit SHA, or by an immutable release tag. Not a branch.
- The template has named owners in CODEOWNERS, and every change needs their review. A template change is a high-risk change: it affects every repo that uses it.
- A repo opts out of a gate only with a parameter that names the waiver, e.g. `skip_dast: W-7`, so the opt-out is visible in the calling file. The template fails if the waiver ID is missing.
- Release new versions with a changelog that says which gates or thresholds changed. Roll out upgrades with automated pull requests to calling repos, and give a deadline for leaving old versions.

## Speed
Aim for pull request feedback in under 10 minutes:
- Cache dependencies, keyed on lockfiles.
- Run independent jobs in parallel.
- In monorepos, trigger by changed paths.

A slow pipeline gets bypassed.

Facts checked against primary sources on 2026-10-14.
