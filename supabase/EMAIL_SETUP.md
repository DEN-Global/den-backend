# Supabase email verification setup

Project: DEN Global (`xhqxadhkcadxnzvbkfwr`). DEN's production API already supports Supabase OTP through server-only `SUPABASE_URL` and `SUPABASE_ANON_KEY` (a publishable key is supported by that header). These are distinct from `SUPABASE_DATABASE_URL`.

## Domain-free Gmail option

Custom Gmail SMTP can be used without purchasing a domain. Enable Google 2-Step Verification and create an App Password named DEN Global. The user must create and enter the credential directly in Supabase; never paste it into chat, logs or Git.

| Setting | Value |
|---|---|
| Sender email | Gmail address used to authenticate |
| Sender name | DEN Global |
| SMTP host | smtp.gmail.com |
| Port | 465 |
| Username | Full Gmail address |
| Password | Google App Password, not the normal account password |

Gmail account eligibility, sending limits and abuse controls apply. After saving SMTP, apply the six-digit code templates and test actual delivery. Keep public registration disabled until delivery is ready. The Supabase default sender is restricted to project-team recipients; this free project rejects template updates without custom SMTP.

- App Password: https://myaccount.google.com/apppasswords
- SMTP settings: https://supabase.com/dashboard/project/xhqxadhkcadxnzvbkfwr/auth/smtp
- Reference: https://supabase.com/kb/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y

## Alternative: domain-based production delivery

1. Obtain a domain and an SMTP provider. Supabase supports providers such as Resend, Brevo and Amazon SES; choose based on your account and requirements.
2. Verify the sender domain's DNS records with that provider. Use a sender such as `verification@your-domain`.
3. Configure host, port, username, password, sender name and sender address under Supabase Authentication > Email > SMTP. Store credentials in the provider/dashboard, never Git.
4. Apply the scoped settings in `email-production.toml` using a separate CLI work directory with that file as `supabase/config.toml` and this repository's template at `supabase/templates/verification.html`. Run config diff before push and specify the project ref explicitly.
5. Confirm both the confirmation and magic-link templates contain `{{ .Token }}`. Codes must be six digits and expire after 600 seconds, matching DEN's UI.
6. Add the project URL and publishable key to the DEN Vercel project's server environment, then redeploy the verified production release. Never use a secret or service-role key here.
7. Test a real recipient inbox end to end before enabling general signup: request, receive, verify, reject reused/expired codes. Check that duplicate accounts remain protected. Do not treat readiness booleans as evidence of successful delivery.

DEN has its own password store and sessions. The existing Forgot password flow uses purpose-bound DEN reset codes and requires its separate email sender; Supabase OTP verification does not itself reset DEN passwords.

Official references:
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
