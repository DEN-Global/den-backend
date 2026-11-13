# Flutterwave wallet funding (Nigeria, NGN)

Uses the v3 hosted checkout API, server-side verification by transaction reference, and a signed v3 webhook. No card or bank details enter DEN. Transfers and payouts are not enabled.

## Production setup

1. Set FLUTTERWAVE_SECRET_KEY as a Vercel Production Secret (live v3 key).
2. Choose a random shared secret and save it as FLUTTERWAVE_WEBHOOK_SECRET in Vercel and as Secret hash in Flutterwave Settings → Webhooks.
3. Set webhook URL to https://den-global.vercel.app/api/payments/flutterwave/webhook . Enable retries.
4. After webhook settings are saved, set FLUTTERWAVE_FUNDING_ENABLED=true in Vercel and redeploy. Until all three variables are present and enabled, funding is disabled.

Schema: den_wallet_funding has owner-scoped idempotency keys, unique references and unique provider transaction IDs. RLS is enabled; browser roles have no grants. The backend role accesses it through the existing PostgreSQL adapter.

Checkout creation records the intended NGN amount and account email before asking Flutterwave for a link. No funds are credited then. Confirmation verifies the reference, successful status, exact amount, NGN currency and customer email using the server key. Credits and credited status are committed atomically with a unique provider transaction ID. Duplicate callbacks/webhooks return the existing result. Pending payments remain available for explicit Check payment, including after the browser closes. Provider timeouts retain the same request reference.

The callback's status/transaction_id are never trusted. A signed webhook prompts the same independent verification. A pending verification returns 503 to allow webhook retry. A transaction limit of NGN 100–100,000 applies; this is a DEN funding limit, not a claim about Flutterwave limits. Provider fees are shown in hosted checkout.

Validation uses mocked Flutterwave responses and disposable SQLite records. No live payment is initiated during setup or testing. A real card/bank payment must be completed by the account holder in Flutterwave checkout.

Production packaging overlays only the new module, services-api.js, a minimal webhook dispatch in the verified production app.js, and the new environment forwarding in api/index.js. It preserves the deployed Supabase authentication implementation.

Official references:
- https://developer.flutterwave.com/api/charge/standard
- https://developer.flutterwave.com/docs/transaction-verification
- https://developer.flutterwave.com/docs/webhooks

## Current rollout status

Funding remains disabled. The dashboard inspected on 2026-11-13 showed v3 test keys and incomplete activation. The additive PostgreSQL migration is not applied: CLI lacks REFERENCES permission on den_users, and the dashboard SQL editor could not reach its server. Apply the included migration with the existing database owner before enabling funding. No database permissions were weakened.
