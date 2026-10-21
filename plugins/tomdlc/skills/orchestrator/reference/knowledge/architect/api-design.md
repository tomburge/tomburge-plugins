# API design

## The contract is a file
- HTTP APIs: an OpenAPI 3.1 or 3.2 document (3.2 is the latest; check your tools support it before choosing it). Events and messages: AsyncAPI or JSON Schema. gRPC: `.proto` files.
- Store it in the repo (e.g. `api/`) as the source of truth. Code is checked against it, not the other way round.
- In CI, the devsecops-engineer lints it (e.g. Spectral or Redocly), diffs it for breaking changes against the main branch (e.g. oasdiff), and contract tests verify the implementation. DAST uses it to find every endpoint.

## Conventions
- **Resources and methods:** plural nouns for collections (`/orders`, `/orders/{id}`). `GET`, `PUT` and `DELETE` are idempotent. `POST` creates or acts; for creates with side effects such as payments, accept an `Idempotency-Key` header (a common convention; the IETF draft for it expired without becoming an RFC, so define its behavior in the contract).
- **Status codes:** use them precisely: 400 invalid input, 401 not authenticated, 403 not allowed, 404 not found (also for resources the caller may not know exist), 409 conflict, 422 semantically invalid, 429 rate limited, 5xx only for server faults.
- **Errors:** one envelope everywhere, such as RFC 9457 problem details (`type`, `title`, `status`, `detail`, `instance`) plus a `requestId` that matches the logs. Never include stack traces or internal identifiers.
- **Pagination:** cursor-based for large or frequently changing collections; offset only for small, stable ones. Always cap the page size.
- **Data formats:** timestamps in ISO 8601 UTC; money as integer minor units plus a currency code; IDs as opaque strings.
- **Input constraints in the schema:** types, `maxLength`, `maxItems`, enums, formats and `additionalProperties: false`. These are security controls, not just documentation; they stop oversized and unexpected input at the boundary.
- **Security on every operation:** declare the authentication scheme, and the scopes or roles per operation, matching the authorization matrix in the functional design. Public operations are marked explicitly.
- **Rate limits:** document them, and return 429 (RFC 6585) with a `Retry-After` header (RFC 9110). The `RateLimit` and `RateLimit-Policy` headers are still an IETF draft, not an RFC; if you use them, say which draft version.

## Versioning
- Additive changes (new optional fields, new endpoints) are not breaking.
- Breaking changes include:
  - removing or renaming a field
  - changing a type
  - making an optional field required
  - changing an error code or status
  - tightening validation
- A breaking change needs a new version (`/v2/` or a media-type version) and a deprecation plan for the old one: announce it, add `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) headers, and set a removal date.

## Events
- Every event has a schema with a version. Consumers ignore unknown fields.
- Consumers are idempotent: they deduplicate by event ID.
- Document ordering guarantees (usually per key, not global), the retry policy and the dead-letter handling.

## Data model notes
- Index for the queries the API actually runs; check query plans for the hot paths.
- Schema changes follow expand-then-contract: add, backfill, switch reads, then remove in a later release.
- Validate data migrations with a dry run, plus row counts or checksums before and after.

Facts checked against primary sources on 2026-10-14.
