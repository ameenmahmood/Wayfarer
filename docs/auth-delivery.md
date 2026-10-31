# Authentication email delivery audit and dev fixes

Read-only production checks on October 31, 2026 confirmed: email sign-in enabled, first-time signup enabled, email verification required, Gmail SMTP enabled, a 30-email/hour Auth limit, a 60-second minimum interval, and production redirect settings matching the checked-in configuration. One reported request was matched to a confirmation-send timestamp and an unconfirmed account. This establishes that the registration request reached Auth, not that the recipient received it. No production SMTP, signup, verification, rate-limit, or template settings were changed in this audit. No diagnostic emails were sent.

All five application tables have RLS enabled and deny anonymous reads and direct client writes. The security advisor flagged intentionally exposed, permission-checked definer RPCs, an unpinned search path on assert_money, and authenticated execution of the internal validate_payload helper. Migration 005 pins that path and removes direct client execution of both internal helpers; authorized mutation RPCs still run validation. It was tested in dev and applied in the subsequently approved production release. The password-leak warning relates to password login, which this app does not implement.

## Sign-in changes

The email form explicitly allows first-time account creation; previously this was already the SDK default, so this change alone does not fix delivery. It normalizes addresses, prevents immediate repeated sends/Enter submissions, retains a per-address 60-second resend interval in page memory across dialogs, clears old success notices before retries, maps Auth error codes to actionable guidance, rejects offline requests, and explains that first-time emails can be confirmation messages. A success is labeled a request, never guaranteed delivery. The countdown is a UI courtesy; Supabase enforces real server limits.

Branded confirmation and magic-link HTML templates preserve {{ .ConfirmationURL }} and are managed by config.toml and published in the approved production release. First-time confirmation and returning-user links need separate templates. Local callback allowlist entries are included for ports 5173/5174; these were also applied in the approved production release. Changes do not disable email verification, bypass authentication, or change existing memberships. For future updates, review `supabase config diff` before applying settings; retain the existing SMTP credentials and provider limits. Migration 005 was deployed with `supabase db push --linked`. The user confirmed the reported missing email was in Spam; no authentication bypass was needed.

## What still establishes delivery

For a missing message whose API request succeeded, correlate the recipient and local request time with Supabase Authentication logs, and check the sender Gmail account for delivery failures/bounces and the recipient's Spam/Junk folders. Confirm the sender and SMTP username match the intended account and that Gmail allows SMTP/app-password access. Auth's send timestamp cannot diagnose a spam decision, delayed delivery, or a provider bounce by itself. Do not repeatedly resend while investigating: old links can expire/be invalidated and provider limits are shared across users. Do not disable email confirmation or auto-confirm users as a workaround.

If Gmail is not reliably delivering these messages, use a transactional SMTP provider with a verified sender domain as a separate configuration change. Do not assume switching providers guarantees delivery. Do not raise the Auth limit blindly: align it with the provider's actual allowance and logs. Until a recipient confirms receipt, describe inbox delivery as unverified.

Official references:
- https://supabase.com/kb/troubleshooting/not-receiving-auth-emails-from-the-supabase-project-OFSNzw
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
