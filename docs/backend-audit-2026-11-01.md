# Backend audit — November 1, 2026

## Outcome and deployment status

The audit found reproducible authorization-lifecycle and data-integrity bugs. Migration **007_backend_audit_hardening.sql** is installed on the hosted Supabase project. The hardened `travel-services` function is deployed as **version 16**, with JWT verification enabled. Existing trip records, memberships, email settings, and invitations were not used as test fixtures or reset. No sign-in emails were sent and no service credentials were printed.

Browser-side fixes for paginated synchronization, atomic cache merging, exact financial totals, and CSV protection were reviewed in dev and approved for production publication following this audit. They are included in the audit-hardening frontend release. This report is not a certification that the application has no vulnerabilities.

## Findings and fixes

| Finding | Impact | Fix and status |
| --- | --- | --- |
| Missing optimistic version accepted | An authorized editor could submit a null version and overwrite a newer record without a conflict. This did not grant access to other trips. | Reject missing/negative versions and missing mutation identities. **Backend deployed.** |
| Unused invitations survived member removal | A removed member could use another still-pending invitation issued to the same email to regain access. | Member removal revokes that account's unused invitations for the trip. Accepted invitations already cannot restore revoked access. **Backend deployed.** |
| Incomplete and mistyped payloads accepted | Missing expense/item participants, missing snapshot metadata, string-valued numeric fields, invalid category budgets, and malformed template data could be stored and break reports or editing. | Strict JSON types, required arrays, money/snapshot checks, valid dates/times when supplied, paired coordinates, and validated template items. **Backend deployed.** |
| Trip record identity not enforced | An owner could create an additional trip-shaped record under an existing trip ID, corrupting the workspace's structure. | Require trip entity ID to equal trip ID; child writes require an existing active trip. **Backend deployed.** |
| Arbitrary rate-limit keys | Signed-in clients could allocate arbitrary bucket names in the limiter table; caller-supplied quotas were insufficiently constrained. | Allow only seven supported actions, enforce server ceilings of 4 AI or 20 other calls per user/minute, and bound saturated counters. **Backend deployed.** |
| Large request bodies buffered before rejection | The server read the entire request before checking its length. | Stream with a 30,000-byte bound, including multibyte input; reject declared oversized bodies early. **Server deployed.** |
| Transport error messages could echo credentials | Google's structured errors were already sanitized, but other thrown errors had no general redaction. | Redact configured Google, exchange-rate, and AI keys from all returned service errors. **Server deployed.** |
| Download row cap treated as a complete snapshot | A truncated API response could remove still-existing records from the local cache. Server records were not deleted by this code. | Ordered keyset pagination, continue even on short pages, fail without returning partial data, and merge under one transaction with the pending-edit queue. **Included in the approved frontend release.** |
| Financial aggregate overflow | Individually valid large amounts could sum beyond JavaScript's exact integer range. | Reject unrepresentable report totals and balances instead of silently rounding. **Included in the approved frontend release.** |
| CSV formula prefixes behind whitespace | Existing escaping covered direct formula prefixes but not whitespace/control characters preceding them. | Neutralize both forms before CSV export. **Included in the approved frontend release.** |

Additional hardening pins Edge Function SDK versions to the locally audited versions and explicitly places `pg_temp` last in application function search paths. Direct access to internal validation helpers remains revoked. Invitation validation now bounds email length and pending counts and ignores already accepted invitations when counting pending capacity.

## Verification evidence

- **171 tests across 22 files passed.** Production build passed; the browser-key safety check passed. The previous release had 148 tests. New regression coverage includes actual PostgreSQL authorization/validation and controlled synchronization/endpoint transports.
- Before fixes, six new regression tests failed against the existing migrations, reproducing missing-version overwrites, missing expense/item participants, missing snapshot metadata, duplicate trip identities, and unrestricted limiter keys.
- PostgreSQL tests cover revoked-member re-entry through a spare invitation, malformed money data, invalid versions, role enforcement, internal helper access, oversized tombstones, idempotence, conflicting edits, and duplicate Ideas promotion.
- Sync tests cover responses capped below the requested page size, later-page failures, invalid ordering, lost acknowledgements, concurrent edits, deletion tombstones, and an offline edit made while a download is in flight. Partial downloads never reach the cache-pruning stage.
- Endpoint tests cover sessions, membership, deleted trips, allowed origins, rate exhaustion, viewer AI denial, oversized multibyte bodies, streaming UTF-8 decoding, and key redaction. Controlled upstream responses are used; these tests do not incur Google or AI charges.
- Live database inspection: all **five application tables** have RLS enabled. Anonymous users have no read privileges. Authenticated users have no raw insert/update/delete privileges. Anonymous users cannot execute application RPCs. Internal validators are not executable directly by authenticated clients. Untrusted roles cannot create objects in `public`.
- Live authentication settings: email provider enabled, signup enabled, anonymous sign-in disabled, email auto-confirm disabled. The deployed function continues to require JWT verification and independently verifies the session and trip membership.
- Live API probes: anonymous entity/membership reads **401**; unauthenticated travel-service request **401**; approved production-origin preflight **200**; unapproved-origin preflight **403**. No private rows were printed and no Google request was made by these probes.
- Aggregate live integrity checks returned **zero** trip-identity mismatches, active orphan records, expenses missing split arrays, expenses missing snapshot metadata, templates missing item arrays, or unsupported limiter buckets. These checks did not display trip contents and do not prove the absence of past exploitation.
- The deployed database was inspected after migration: strict version checks, invitation revocation, bucket allowlisting, snapshot validation, and explicit temporary-schema ordering were all present. Migration history confirms 001–007 installed.
- `npm audit` reported **0 known vulnerabilities** in the installed dependency tree at audit time. This is advisory coverage, not a guarantee against unknown vulnerabilities.

## Security advisor interpretation

After deployment, a separate error-level security advisor run returned **zero findings**. The warning-level run reported ten authenticated `SECURITY DEFINER` callability warnings and one leaked-password-protection warning; no other warning categories appeared. The ten functions are intentionally callable application RPCs, with explicit authentication, membership, owner/editor, or recipient checks. Removing their execute grants would disable the corresponding workflows; tests exercise their authorization checks. They are not callable anonymously.

Leaked-password protection is disabled in Supabase. Wayfarer's UI uses email links, not passwords, so it does not rely on password strength screening. Review that setting if a password-based flow is introduced. Email verification remains enabled.

## Remaining limits

- This is a code, database-permission, configuration, dependency, and regression audit—not an independent penetration test or historical access-log investigation. No audit can establish zero vulnerabilities.
- Full end-to-end testing with two independently signed-in live accounts remains outstanding; that workflow was previously postponed. SQL and controlled transport tests do not replace it.
- Google Cloud key restrictions, project quotas, billing alerts, Gmail inbox placement, and provider account security cannot be fully verified through this Supabase/repository audit. Per-user limits do not replace project-level billing safeguards.
- Remote revocation cannot erase previously downloaded browser copies. Clearing browser storage can remove unsynchronized changes. Neither behavior is changed or disguised by this audit.
- Sync remains per record on the server; local batch writes are atomic, remote multi-record promotion is not. Concurrent remote changes during a paginated pull can require another sync to appear; UUID keyset pagination avoids shifting-offset losses. The client stops safely rather than pruning if a pull fails or exceeds its bounded page count.

## Official references

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions and function privileges](https://supabase.com/docs/guides/database/functions)
- [Supabase JavaScript query limits and pagination](https://supabase.com/docs/reference/javascript/select)
- [Supabase authenticated security-definer advisor warning](https://supabase.com/docs/guides/observability/advisors?lint=0029_authenticated_security_definer_function_executable)
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
