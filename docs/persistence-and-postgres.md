# Persistence: SQLite in development, PostgreSQL in production

The platform talks to one narrow database interface: `prepare(sql).bind(...args)` with
`first()`, `all()`, `run()`, and `batch([...])`. Two adapters implement it.

| Adapter | File | Used by |
| --- | --- | --- |
| Node SQLite (`node:sqlite`) | `src/local-database.js` | `npm run dev`, the test suite |
| PostgreSQL (`pg`) | `src/postgres-database.js` | the Vercel API function |

Keeping the runtime SQL in one dialect (SQLite-flavoured, as written by the domain modules)
means development and tests never need a cloud database. The PostgreSQL adapter translates
the few constructs that differ:

- positional `?` placeholders become `$1..$n`, ignoring quoted literals
- `json_extract(x,'$.k')` becomes `(x::jsonb)->>'k'`
- `group_concat(x)` becomes `string_agg(x,',')`
- `json_group_array` / `json_object` become `jsonb_agg` / `jsonb_build_object`
- `x IS ?` becomes `x IS NOT DISTINCT FROM ?`
- `ON CONFLICT(key) DO UPDATE SET count=count+1` names its table, because PostgreSQL cannot
  resolve the bare column against `EXCLUDED`

Millisecond timestamps are stored as `BIGINT`. The adapter registers a `pg` type parser so
int8 values come back as JavaScript numbers; otherwise `sequence + 1` would concatenate
strings. JSON values are returned as text, matching what the SQLite adapter produces, so
responses are byte-compatible between the two backends.

## Transactions and invariants

`batch([...])` runs inside `BEGIN`/`COMMIT` on a single pooled client and rolls back on
failure. The concurrency guards rely on this: a batch inserts a row into
`den_transaction_guards` whose `valid` column is a `BOOLEAN CHECK`, then performs the
mutation in the same transaction. A violated invariant raises a check or trigger exception,
which rolls the whole batch back. The request handler maps PostgreSQL error codes `23505`,
`23503` and `23514` to the same `CONCURRENT_OR_DUPLICATE_CHANGE` response that SQLite
constraint failures produce.

The append-only and state-machine guarantees (audit chain, custody events, wallet entries,
workspace choice, verified-business identity, trade locks) are enforced by triggers in the
database, so they hold regardless of which application process writes.

## Migrations

- `migrations/*.sql` — the SQLite/D1 history, applied by the local adapter.
- `migrations/postgres/*.sql` — the PostgreSQL baseline and follow-ups, applied by
  `npm run db:migrate`.

`db:migrate` accepts either `SUPABASE_DATABASE_URL` (a `pg` connection, for example the
Supavisor pooler) or `SUPABASE_PROJECT_REF` with `SUPABASE_ACCESS_TOKEN` to run the same
files through the Supabase Management API. Applied files are recorded with a SHA-256
checksum in `den_schema_migrations`; a changed file is reported as
`MIGRATION_CHECKSUM_MISMATCH` instead of silently reapplying.

Two dialects mean schema changes belong in both directories when they affect behaviour the
PostgreSQL deployment depends on. The PostgreSQL baseline uses database functions and
triggers rather than SQLite-specific syntax.

## Configuration

| Variable | Purpose |
| --- | --- |
| `SUPABASE_DATABASE_URL` | pooler connection string used by the API function and `db:migrate` |
| `MFA_ENCRYPTION_KEY` | base64 32-byte key that encrypts TOTP secrets and push subscriptions |
| `APP_ORIGIN` | exact browser origin allowed to send state-changing requests |
| `PRIMARY_ADMIN_ID` | the single primary super-admin user id, or `disabled` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase Auth sends and verifies the sign-up code |
| `RESEND_API_KEY`, `SIGNIN_EMAIL_FROM` | alternative: Resend delivers the codes |
| `DEN_SANDBOX_PAYMENTS` | sandbox payment mode |

No secret is committed. Sensitive values are stored as Vercel environment variables.

## Verification

`node scripts/check-postgres.mjs` drives the real request handler against the configured
database: sign-in, session expiry, CSRF, workspace choice, business registration,
authorization denials, an authenticated write, the audit chain and numeric sequences. It
created the account it uses directly, because registration requires a delivered email code.

`test/postgres-adapter.test.js` covers the SQL translation without a database.
