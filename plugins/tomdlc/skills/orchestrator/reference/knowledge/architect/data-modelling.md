# Data modelling

Add a **Data Model** section to `03-design.md`: the stores, the entities in each, keys, the main queries and their indexes, retention, and how the schema will change over time. Record the choice of store as an ADR.

## 1. Choose the store by access pattern
Start from the queries and writes the requirements need, not from a favorite technology. Default to a relational database unless the access patterns clearly need something else.

| Store | Use when | Avoid when |
|---|---|---|
| **Relational** (the default) | Data has relationships and constraints; you need transactions, ad-hoc queries and reporting | Extreme write throughput on simple keys; truly schemaless data |
| Document | Self-contained aggregates read and written as a whole; varied shapes per record | Many cross-document relationships or joins; multi-record transactions |
| Key-value | Lookups by a single key at very high rate (sessions, caches, feature flags) | Any query other than by key |
| Wide-column | Massive write volume with queries known in advance (time series, events per entity) | Ad-hoc queries; small datasets |
| Search index | Full-text search, relevance, faceting | As the source of truth: it's a derived copy |
| Time-series | Metrics and measurements over time, with downsampling | General entity data |
| Graph | Queries that traverse relationships of unknown depth | Simple one-to-many data |
| Log or stream | Ordered events consumed by several readers; replay | Querying current state |
| Cache | Speeding up reads of data stored elsewhere | As the only copy of anything |

Use one store per kind of need. Every additional store adds backup, security, monitoring and consistency work, so justify each one.

## 2. Relational modelling
- **Normalize to third normal form first**, then denormalize deliberately, only for a measured read need, and record why. Every denormalized copy needs an owner that keeps it in sync.
- **Keys:** use surrogate primary keys (sortable UUIDs such as UUIDv7 or ULID, or database sequences). Don't expose sequential IDs where enumeration matters (see the threat model). Enforce natural uniqueness with unique constraints.
- **Constraints in the database:** not-null, foreign keys, unique and check constraints. The database is the last line of defense against bad data.
- **Many-to-many** goes through a join table that can carry its own attributes (e.g. role, added_at).
- **Time:** store instants in UTC (`timestamp with time zone` or equivalent); keep the user's time zone separately when it matters.
- **Money:** integer minor units plus a currency column.
- **Audit columns:** `created_at`, `updated_at`, and `created_by` where accountability matters.
- **Soft delete:** only if there's a real need to restore. It complicates every query and unique constraint, and it doesn't satisfy erasure requests, so personal data still needs real deletion or anonymization.
- **Multi-tenancy:** a `tenant_id` on every tenant-owned row, enforced by the database where possible (row-level security), not only by application code.

## 3. Non-relational modelling
- **Design from access patterns:** list every read and write with its key and frequency, then shape records so each common access is one lookup.
- Group data that's read together; duplicate data deliberately, and document which copy is the source of truth.
- Choose partition keys with high cardinality and even load; avoid "hot" keys such as today's date.
- Plan secondary indexes up front; they're costly to add later.

## 4. Indexes
- Index for the queries the system actually runs: filters, joins and sorts on the hot paths. Check query plans for those paths.
- Composite indexes: put equality columns first, then range or sort columns.
- Don't over-index: every index slows writes and takes space. Remove unused ones.
- Bound every list query with pagination (see the API design guide).

## 5. Schema changes and migrations
- **Version the schema** with a migration tool, and keep migrations in the repo, reviewed like code.
- **Expand, then contract:** add the new column or table; deploy code that writes both; backfill; switch reads; stop writing the old; remove it in a later release. Every step must work with both the current and previous release, so rollback is always possible.
- **Large tables:** use online schema-change techniques. Batch and throttle backfills, make them resumable, and run them separately from deploys.
- **Moving data between stores:** dual-write with reconciliation, or change data capture (CDC), then cut over once the copies match.
- **Verify every migration:** dry-run it on a production-sized copy (with masked data), and compare row counts and checksums before and after.

## 6. Retention and deletion
For each entity: its data classification, its retention period, how it's deleted (hard delete, anonymization, crypto-shredding), and how deletion reaches backups, caches, search indexes and analytics copies. This must match the requirements' retention and data subject rights.

Facts checked against primary sources on 2026-10-14.
