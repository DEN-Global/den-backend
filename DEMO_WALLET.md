# Retired demo wallet

The user requested removal of the demo wallet. All wallet mutation routes, including /api/services/wallet/demo, now return LIVE_MONEY_DISABLED (423). GET /api/services/wallet excludes historical `DEN demo:` records from balances and transactions; those immutable entries remain stored for audit history. No simulated funds can become real balances.

Provider connection, funding, transfers, and withdrawals remain disabled pending real payment-provider integration. The UI shows Wallet, provider-connection status and recorded transaction history.

The PostgreSQL integer guard compatibility fix is retained for existing platform writes.
