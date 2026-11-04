# DEN shared backend

Authenticated warehouse partner API and shared DEN domain policies. This is a working development slice, not the completed ecosystem or a production launch.

## Run locally

Use Node 24.22 or later. Keep `den-backend` and `den-warehouse` as sibling directories.

```sh
npm ci
npm test
npm run check
npm run build
npm run dev
```

Build the warehouse frontend first (`npm ci && npm run build` in its directory). Open http://localhost:8787. Local SQLite data survives restarts in ignored `.data/`; its generated encryption key is stored with restrictive file permissions. These are development credentials and must never be copied into production.

Register a local test reviewer, then explicitly provision the first local Primary:

```sh
DEN_ALLOW_LOCAL_ADMIN_PROVISION=1 node scripts/local-admin.mjs reviewer@example.test
```

Restart the local server after this command. Enroll MFA in Security before reviewing applications. This CLI only touches the local SQLite file; no public administrator bootstrap endpoint exists.

## Implemented

- Password authentication with scrypt, server-side hashed sessions, CSRF/origin checks, bounded JSON, rate limits, logout, encrypted TOTP enrollment and fresh MFA authorization.
- Pending business registration, facility creation/editing, submission, independent administrative business and facility approval, and tenant isolation.
- Email-bound, expiring, single-use staff invitations with revocation; six facility roles and owner-controlled removal. Invitation delivery is manual in development.
- Permission-checked, immutable operational notes with idempotency. Notes do not move inventory or establish secure custody.
- Atomic audit chaining and concurrent-write guards. SQL protects business activation dates and append-only records.
- Default-locked trade controls with authenticated Primary identity, fresh MFA and revision comparison. Specialized roles confer no unlock authority.
- Shared policies for 30-day business commission holiday, progressive commissions, account modes, rider communities, chat routing and collection eligibility. Example rates are test fixtures, not activated billing.

## Verification

54 automated tests cover policies, SQL constraints, actual HTTP flows, negative authorization cases, concurrency, restart persistence, and the Worker running on workerd with D1 and real password hashing. `npm run build` validates the Cloudflare Vite/cf bundle. See [warehouse acceptance](docs/warehouse-acceptance.md), [requirements](docs/master-requirements.md) and [decisions](docs/decisions.md).

## Production boundaries

No remote resources have been provisioned. `cf` configuration requires explicit database ID, origin and Primary identity outside development. Cloudflare authentication and reviewed environment configuration are still required. The local Node/SQLite adapter is not part of the Worker bundle.

Email ownership verification, password/account recovery, MFA recovery, production administrator provisioning, independent audit checkpoints, security monitoring and a reviewed launch configuration remain unfinished. Do not open public onboarding before these are implemented. No live identity verification, documents, payments, carrier, maps, legal approvals or automatic deductions are connected.

Inventory accounting, full shipment/custody transitions, offline synchronization, QR/code handoffs, consumer/rider/merchant apps, complete finance/admin portals and the wider master requirements remain to be built. The international booking endpoint fails closed; unlocking alone cannot create live bookings.

## Deployment and rollback

Use separate development, staging and production databases and keys. Review and apply additive migrations in order after backup; never point local tests at production. Configure same-origin frontend assets/API, secret MFA key, trusted Primary identity, cookie HTTPS and origin before deployment. No deploy command is executed by this repository automatically.

Rollback application code to the previous known build. Preserve database history and audit records; do not drop migrations or erase data to roll back. Test backup restoration and forward fixes in staging before any production migration.
