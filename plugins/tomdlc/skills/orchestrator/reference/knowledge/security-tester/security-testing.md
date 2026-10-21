# Security testing

Only test local or explicitly designated test environments, with synthetic data. Never production or third-party systems.

## Test patterns by threat

Write each pattern as an automated test where possible, citing its `T-n` or `AC-n`.

| Threat | Tests |
|---|---|
| **Broken object-level authorization (IDOR)** | As user A, request user B's resource by ID through every endpoint that takes an ID, including nested and bulk endpoints; as tenant A, try tenant B's IDs. Expect 403 or 404 and no data. |
| **Function-level authorization** | Call admin and privileged operations as a normal user, and as an unauthenticated client. Check that hidden UI isn't the only protection. |
| **Mass assignment** | Send extra fields (`role`, `isAdmin`, `ownerId`, `price`) on create and update. Expect them ignored or rejected. |
| **Authentication and tokens** | Expired, not-yet-valid, wrong-audience, wrong-issuer and tampered tokens; `alg: none` and algorithm confusion; replayed tokens after logout; brute-force attempts hitting the rate limit or lockout; password reset tokens reused or guessed |
| **Sessions** | Session ID changes at login (no fixation); logout invalidates the session server-side; cookies have `Secure`, `HttpOnly` and an appropriate `SameSite` |
| **Injection** | Payloads for each sink the code uses (SQL, NoSQL operators, OS commands, LDAP, template expressions, headers with CRLF). Expect them treated as data. |
| **XSS** | Script payloads in every reflected and stored field, rendered in each output context (HTML, attribute, JavaScript, URL). Check the CSP. |
| **SSRF** | URL inputs pointing at `localhost`, private ranges, cloud metadata addresses (e.g. `169.254.169.254`), other schemes (`file:`, `gopher:`), and redirects to them |
| **Files** | Oversized, wrong type with the right extension, path traversal in names (`../`), archives that expand hugely, and polyglot files |
| **CSRF and CORS** | State-changing requests without a token or from another origin; CORS reflecting arbitrary origins with credentials |
| **Resource exhaustion** | Huge payloads, deep nesting, enormous page sizes, expensive search queries. Expect limits to be enforced. |
| **Business logic** | Negative quantities, skipping workflow steps, replaying one-time operations, race conditions (send the same request in parallel) |

## DAST
- Start with a baseline scan (passive) in CI against an ephemeral or staging environment, then a full active scan before release at the moderate and high tiers.
- Scan **authenticated**, with a dedicated test account per role, and exclude logout and destructive endpoints from crawling.
- Feed the scanner the API contract (OpenAPI) so it covers every endpoint, not only the ones it can crawl.
- Triage every result. Record false positives with a reason; tune the scanner rather than ignoring results.

## Fuzzing
- Targets: parsers, decoders, protocol handlers, file importers, and anything that takes complex untrusted input.
- Start with property-based tests. At the high tier, add coverage-guided fuzzing (libFuzzer, AFL++, Jazzer, Go's built-in fuzzing, Atheris).
- Seed the corpus with real-shaped samples. Time-box runs in CI (e.g. 10 minutes per target), and keep crashing inputs as regression tests.

## Release-candidate scans
Re-run SCA and container scans against the exact release candidate. New CVEs appear daily.

## Live-only checks
Live probes (TLS versions, headers on real responses, auth on the deployed endpoint, throttling) follow the rules in the tester's test-depth guide, "Tests you can't run": mark them UNVERIFIED until their first run, assert what the platform guarantees, dry-run them against a stub, and triage each first-run failure as a test defect or a system defect.

## Evidence
For each `T-n` verified, record the test name, what it attempts, the expected result and the actual result. For each finding, give a reproduction (request and response, with secrets redacted), severity, CWE ID, and which stage should have caught it.

Facts checked against primary sources on 2026-10-14.
