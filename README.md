# DEN backend

**One Network. Every Journey.**

Initial shared domain policy implementation for DEN Global. This is a tested library, not a deployed API or a complete application.

## Run checks

Node.js 24 or later; no external packages or secrets required.

```sh
npm test
npm run check
```

## Implemented

- Default-locked international trade policy with exclusive Primary Super Admin identity checks, MFA evidence and five-minute authentication freshness.
- Revision preconditions and audit event generation for activation/relocking.
- Country controls, explicit permissions, tenant-scoped history and controlled in-progress continuation.
- Three specialized international role assignment policy, available only after activation.
- Six facility employee roles with tenant/facility isolation and multiple membership support.
- Warehouse business 30-day commission holiday, approved country/currency pricing selection, rejection of overlapping rules, and exact minor-unit calculations.

- Protected Primary/Lesser Super Admin hierarchy and ordinary-admin boundaries.
- Configurable marginal progressive commission calculations.
- Automatic collection eligibility: explicit enablement, seven days after notice, scoped valid mandate, disputes/holds and amount limits.
- Public account-mode exclusion, five-community rider limit and permitted private-chat routing.

## Security boundary and remaining work

Do not expose these functions directly to clients. An authenticated backend must construct actors and load permissions, memberships, conversation participants, admin levels, business approval timestamps and pricing approval records from trusted storage. Never trust client-supplied MFA claims, primary identity, approval status or business activation dates.

Community joins must enforce the cap in an atomic transaction. Chat routing must also validate active conversation membership, order/customer/rider assignments and organization tenancy on every send/read. Progressive schedule selection must validate country, currency, effective dates and plan before calculation. Collection still needs authenticated finance approvals, idempotent provider integration, reconciled invoice state and mandate validation from trusted records.

The authentication provider, MFA challenge flow, persistent database, transaction adapter, tamper-evident audit storage, rate limits and HTTP endpoint integration are not implemented yet. Policy audit outputs are not immutable audit records. Revision checks require atomic database compare-and-swap when integrated. For booking/payment creation, recheck lock revision and country flags in the same transaction as the new operation. Persist authorization and role assignments atomically as well.

The commission function receives the business activation timestamp; database uniqueness for verified businesses and immutable first activation are still required to prevent free-period resets. Example rates exist only in tests; no production rate or deductions are activated. Holiday calculations use elapsed 30×24 hours in UTC and apply to eligible new transactions at their transaction time.

All dashboards, consumer/rider/seller applications, payments, warehouse operations, tracking, twelve signature upgrades, competitor verification and Cloudflare deployment remain pending. Read [requirements](docs/master-requirements.md) and [decisions](docs/decisions.md).

## Rollback

This repository is new and has no deployed resources or database changes. Disable use of this package or revert its consuming release to roll back. Do not remove historical data or drop future additive schema changes as an automatic rollback operation.
