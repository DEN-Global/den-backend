# Persistence and Cloudflare integration stage

The additive initial migration is migrations/0001_foundation.sql. It creates namespaced new tables only. There are no drops, production credentials, seeded users, active country services or approved prices. Do not run it against an unidentified existing database. Compare its names/schema with the target, capture a schema/data backup and obtain the required production-operation approval first.

## Implemented storage constraints

- International trade starts locked. New international shipments require the master state and both active countries to allow international operations. Relocking retains existing records.
- Cross-border routes cannot be inserted as domestic or changed after creation to bypass insertion checks.
- Business activation timestamp is immutable once set; canonical verified-business keys are unique and immutable. Verified businesses cannot be deleted to restart a holiday. The verification integration must derive canonical keys reliably across accounts and preserve retention/privacy obligations.
- Facility memberships reference the matching business/facility and allow facility roles only. Platform admin roles cannot be inserted as warehouse employee roles.
- Shipment custody events have actor, time and facility links. Composite foreign keys prevent cross-business shipment/facility references. Event idempotency keys are unique per shipment. Corrections require new events; old events cannot be updated/deleted via ordinary SQL.
- Audit records are append-only via ordinary SQL triggers. Web Crypto SHA-256 chaining detects modified/removed/reordered events against a separately trusted head and count. Database owners can remove triggers or rewrite the whole database; a separate protected checkpoint is required. A checkpoint publisher and atomic chain append adapter are not yet implemented.

## Authentication and transaction boundary still required

SQL cannot establish the caller's authenticated Primary Super Admin identity. Every endpoint must authenticate a secure session, derive permissions from trusted storage and invoke policy checks before SQL mutations. No endpoints are deployed. Protect primary identity provisioning independently from ordinary role assignment.

Persist a trade transition with compare-and-swap on revision and its hash-linked audit append in one transaction. Do not rely on an earlier authorization read followed by an unguarded write. New bookings must recheck both source and destination country controls, not just the single-country policy helper. Payments, role assignment and in-progress exception operations need corresponding transactional endpoints. The initial shipment schema supports warehouse-business-linked shipments; marketplace/consumer-only delivery models require later additive schemas.

## Cloudflare direction

Workers will host versioned APIs, D1 relational records and R2 private documents. Device GPS requires consent and delivery-scoped read/write checks; use latest-location storage and selective durable milestones rather than persisting every point. Decide polling/WebSockets after measuring volume. Keep payments/identity/maps behind provider adapters, with payment sandbox integrations first.

D1's binding API supports prepared statements and transactional batches. SQLite tests validate the migration locally; they do not prove Cloudflare D1 runtime equivalence. Run the same important invariants in a local Cloudflare runtime before deployment. The Node SQLite module is a test dependency only, not intended for Workers runtime.

New Cloudflare project tooling should use cf per the installed skill because this project has no Wrangler configuration. No cloudflare.config.ts or remote resource was created in this stage. Establish account/environment identifiers and CLI/runtime versions before generating executable configuration. Keep development, staging and production resources separate; do not auto-provision resources or spend money.

Sources reviewed 2026-11-04:
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/d1/sql-api/sql-statements/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/cf/agents/index.md (referenced by installed cf guidance; deployment setup pending)
- https://nodejs.org/api/sqlite.html (local installed Node v24.18.0 runtime was also tested directly)

## Rollback and validation

All schema tests use fresh in-memory local databases. No production/staging database operations were executed. Restore the prior application artifact to disable consumers of new code. Preserve added tables and historical records; do not ship automatic destructive down migrations. Validate backup restoration before any real production migration.

Next: trusted authentication/session implementation, primary identity provisioning, API transactions, business verification/registration endpoints, operational UI, provider sandbox integrations and end-to-end tests. Existing automated checks are policy, audit-chain and local SQLite integration tests, not a complete application security assessment.
