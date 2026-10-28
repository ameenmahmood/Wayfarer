# Backend and hosting verification

Verified on October 27, 2026 (America/New_York).

Primary application: https://ameenmahmood.github.io/Wayfarer/

## Corrected during verification

- Rebuilt the frontend with the configured public Supabase URL and anon key; the previous deployment was still in local demo mode.
- Corrected Edge Function CORS for the actual frontend origin. The function accepts an exact comma-separated origin allowlist and returns `401` for missing authentication.
- Corrected Supabase Auth Site URL and redirect allowlist. They previously pointed to `localhost:3000` with no production redirects.
- Removed the private ChatGPT hosting gate with the owner's approval, then moved primary hosting to GitHub Pages at the owner's request. Users need only Supabase email login.
- Added the `/Wayfarer/` base path to assets, callbacks, invitation links, legal links, the manifest and service-worker registration/cache. Cache cleanup is isolated to this app's path.
- Kept local credential files and Supabase CLI runtime files out of Git. GitHub's build uses only public client configuration variables; server secrets stay in Supabase.
- Isolated automated tests from the real `.env.local` backend configuration.

## Live checks that passed

- Migration `001` is recorded as applied locally and remotely.
- Supabase email Auth endpoint responds successfully and email login is enabled. The owner confirmed the email-link flow, and the backend records a recent successful sign-in.
- All five application tables have RLS enabled. The authenticated role has no direct INSERT/UPDATE/DELETE grants on application tables.
- GitHub Pages CORS preflight succeeds with the exact allowed origin.
- Anonymous Edge Function calls and anonymous trip reads return `401`.
- GitHub Actions completed the tests, production build, artifact upload and deployment successfully.
- The GitHub Pages site opens in a browser in connected mode without ChatGPT authentication. Legal links resolve under `/Wayfarer/`.

## Production database smoke test

The actual deployed Postgres functions were exercised inside a transaction ending in `ROLLBACK`, using the existing owner's identity as local RLS/JWT claims for that transaction. This is a database-layer test, not a browser session or a newly minted login token. No test data was committed and no invitations were sent.

Assertions passed for owner trip creation, entry creation/editing, stale-version conflicts, deletion tombstones, idempotent expense retry receipts, itemized expense reconciliation, invalid expense rejection, personal packing creation, invitation creation/revocation, and denial of direct authenticated writes.

## Automated checks

34 tests pass across the money, scheduling, IndexedDB, synchronization, PostgreSQL and offline-shell suites. The service-worker test covers both root hosting and `/Wayfarer/`, including protection of unrelated apps' caches on the shared github.io origin.

## Remaining verification limits

- The inspection browser did not share the owner's completed login session. Consequently, authenticated browser trip/expense save flows on the new domain are not claimed as inspected end to end. Login was confirmed by the owner and the Auth record; database saves were verified independently by the rollback-only production test.
- Two distinct signed-in collaborators and a real browser disconnect/reconnect were not live-tested. The automated sync and permission suites cover those behaviors at transport/IndexedDB/Postgres levels.
- Google Maps browser/server keys, AI, and exchange-rate-provider secrets are not configured. Live maps, route calculations, optional AI and automatic exchange-rate fetching remain unavailable. Manual plans, manually entered locations, expenses, manual rate snapshots and packing do not require those optional services.
