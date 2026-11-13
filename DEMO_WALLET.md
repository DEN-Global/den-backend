# Demo wallet

GET /api/services/wallet retains recorded balances and entries, and returns a separate demo object with currency balances and the latest 100 simulated entries. POST /api/services/wallet/demo accepts kind (deposit, transfer, withdraw), currency, positive integer amountMinor (maximum 10,000,000), idempotencyKey and recipientEmail for transfers.

All operations require an active authenticated account and existing CSRF checks. Demo entries use a reserved `DEN demo:` reference prefix and cannot spend other recorded balances. Transfers write equal and opposite entries atomically. Sorted user-row locks serialize debits in PostgreSQL, and a transaction guard rechecks the balance after locking. Repeated identical requests replay; changed requests with the same key conflict. Existing immutable ledger and notification triggers remain in effect. No schema change, card, bank detail, provider charge or real payout is involved.

The PostgreSQL adapter converts boolean transaction-guard predicates to integer CASE values to match the committed production schema; explicit integer guards are unchanged. Production packaging preserves the existing auth implementation and overlays only services-api.js and postgres-database.js.

Validation: services.test.js covers flow accounting, isolation, authorization, input limits, replay, overspending and competing withdrawals. postgres-wallet.test.js covers transaction guard translation and case-sensitive wallet aliases. Browser walkthrough uses two disposable local preview accounts, not production balances.
