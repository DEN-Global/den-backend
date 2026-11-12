# DEN Global Supabase migration

The dedicated project is `xhqxadhkcadxnzvbkfwr` (`eu-west-1`). The baseline schema and timestamp widening migrations have been applied. DEN data has been copied from Cloudflare D1 and row-count checked. Row-level security is enabled on every application table without browser-facing policies; the API connects with a private server-side database URL.

The API adapter and Vercel function are prepared locally. No Cloudflare resource has been removed. The Vercel production API still needs its private Supabase connection string and remaining secrets before cutover.

## Apply the database migration

From this directory, authenticate the Supabase CLI in a local terminal, link this repo to the dedicated project, and apply the migration:

```sh
supabase login --output-format text
supabase link --project-ref xhqxadhkcadxnzvbkfwr
supabase db push
```

The CLI may ask for a database password while linking. Enter it directly in the terminal and do not paste it into chat or commit it to the repository.

The current data import copied and count-checked 54 rows across 43 DEN tables. It deliberately invalidated existing sessions and skipped rate counters and one-time email codes. For a future re-import, use a private terminal environment variable named `SUPABASE_DATABASE_URL` and run `node scripts/migrate-d1-to-supabase.mjs` from this directory. The script checks that the destination tables are empty, copies and count-checks records inside a transaction, and prints counts only.

## Vercel API environment

Before routing production API traffic to the new function, set these server-only variables on the `den-global` Vercel project:

- `SUPABASE_DATABASE_URL` — the project's transaction-pooler PostgreSQL connection string, using SSL.
- `APP_ORIGIN` — `https://den-global.vercel.app`.
- `PRIMARY_ADMIN_ID` — keep `disabled-preview-admin` until secure owner provisioning is completed.
- `MFA_ENCRYPTION_KEY` — preserve the existing key so any already-enrolled MFA secrets remain decryptable.
- `RESEND_API_KEY` and `SIGNIN_EMAIL_FROM` — required for email verification and email-code sign-in.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` — needed for browser push notifications.

Do not move the existing D1 rows or change the production API route until the PostgreSQL schema is applied and its data has been imported and checked. Keep the Cloudflare D1 database and workers available for rollback until the Vercel API cutover is confirmed.
