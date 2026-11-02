# Display names and activity attribution

Migration 008 was applied to the shared Supabase backend on November 1, 2026 with explicit approval. This feature uses the existing email accounts and adds no separate login mechanism.

- `profiles.user_id` references the permanent Supabase Auth user ID. Sign-in/invitations still use the account email; names are not login identifiers or proof of identity.
- Users choose a 1–60 character name on first sign-in, with Not now available, and can edit it from their account control in the sidebar or desktop header. The linked email is shown only in their own account form. Names do not have to be unique.
- Profiles contain a name and update timestamp, not email. SQL RLS allows the account itself, current shared-trip members, and attribution lookup for visible trip records. Other accounts cannot browse the profile directory. Profile writes go through `set_display_name(new_name)`, which always uses `auth.uid()` and accepts no target user.
- The account name is overlaid on trip people for display, including expense and packing selections. Raw trip membership data is retained for synchronization and permission checks, including when saving budgets. Renaming never rewrites trip versions, expense IDs, balances, or permissions.
- `entities.created_by` / `created_at` are stamped on insert by a trigger and preserved on update, separately from the existing server-stamped editor fields. Connected clients cannot claim a different creator. The same fields are retained in IndexedDB and conflict resolution.
- Historical records remain without a creator; the last editor is not assumed to be the original author. New activity details show Added by; subsequent edits also show Updated by. Small labels remain inside expanded details on phones.
- Names are cached per account in the existing IndexedDB metadata store. Realtime profile invalidations and the existing synchronization fallback refresh shared names. Name changes themselves require internet in connected mode. The local demo saves a separate browser-only name and never simulates remote profile updates.

## Backend setup and deployment

Apply `supabase/migrations/008_display_names_and_creators.sql` to a development Supabase project using the usual linked migration workflow, then use the dev frontend. It adds the profile table, RLS/RPC, immutable creator fields/trigger, and the profiles Realtime publication. It does not delete or guess historical attribution, change trip JSON, or require an Edge Function change.

The existing connected dev configuration points to the shared production backend. Migration 008 has now been applied there with explicit user approval. A dry run confirmed it was the only pending migration. Older frontend clients remain compatible; new records they create also acquire server creator stamps. The first-run prompt appears only after a successful profile load, and a missing/unavailable profile service does not block normal trip planning. Other installations must apply this additive migration before publishing the new frontend.

For a browser-only preview, use the separately labeled demo at `http://127.0.0.1:5176/`, open the account control, choose a name, create an activity, and expand it. All demo changes stay in its separate IndexedDB origin.

## Verification

Embedded PostgreSQL tests execute migrations 001–008 and cover own-account updates, whitespace/length/email/control validation, anonymous/direct-write denial, profile isolation, new accounts without membership, revocation, server creator stamping, creator preservation across edits by another user, and conservative handling of old records.

UI tests cover first-sign-in prompting, saving/dismissing that prompt, the linked account form and error retry. Local store tests cover immutable creation metadata; normalization tests cover names without email-derived fallbacks. Browser checks use the labeled local demo, not a claim of live Supabase profile synchronization. Live multi-account browser verification remains pending signed-in sessions. No real account names were changed by the deployment checks.

The full suite passed with **201 tests across 27 files**, followed by a successful build. Live read-only metadata checks confirmed profile RLS, no anonymous profile reads or name RPC, no authenticated direct insert/update/delete, authenticated name RPC access, both creator columns, the enabled creator trigger, Realtime publication, and the recorded migration. Re-run these checks with `npx supabase db query --linked --file docs/verify-display-names.sql`.

The profile-table design follows [Supabase’s user-data guidance](https://supabase.com/docs/guides/auth/managing-user-data) and [row-level security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
