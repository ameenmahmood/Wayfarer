# Wayfarer

A working private trip planner with a React + TypeScript interface, IndexedDB persistence, and an optional Supabase backend. The default installation is a clearly labeled **local demo**. It never simulates successful sign-in, invitations, cloud synchronization, live maps, or AI.

**Current hosting:** [ameenmahmood.github.io/Wayfarer](https://ameenmahmood.github.io/Wayfarer/). The login page is publicly reachable; trip records require Supabase email login and membership. No ChatGPT account is required.

The GitHub Pages workflow builds and tests every push to `main`. Public browser configuration comes from repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; optional `VITE_GOOGLE_MAPS_BROWSER_KEY` is also supported. Server secrets remain in Supabase. Run `node scripts/configure-github-pages.mjs` to copy only these public values from your ignored local environment into repository variables. The workflow requires connected-mode settings and will not silently publish a demo build.

GitHub Pages uses `/Wayfarer/` as the application base. For a matching local production build, set `$env:VITE_BASE_PATH='/Wayfarer/'` before `npm run build`, then visit `/Wayfarer/` on the preview server. Auth callbacks, invitation URLs, legal pages, the manifest, and offline cache paths respect this base.

## Run locally

Requires Node.js 22.12+ (verified here with Node 24).

```powershell
cd "C:\Users\ameen\OneDrive\Documents\ChatGPT\TravelPlanner\wayfarer"
npm ci
npm run dev -- --port 5174
```

Open http://127.0.0.1:5174. To verify the production/offline build:

```powershell
npm test
npm run build
npm run preview -- --port 4173
```

Visit http://127.0.0.1:4173 once while online. The production service worker precaches the application shell and every bundled JS/CSS asset. Development mode intentionally does not register it. Browser storage quotas, private browsing, and eviction policies can affect offline persistence. External photography and fonts may fall back offline; Google tiles are never cached.

## Why this stack

- **React, TypeScript, Vite:** a small client application, portable static hosting, established tooling. Components are separated by product area, with pure money and scheduling modules.
- **IndexedDB / idb:** persistent records plus an immutable operation queue, stored together in a transaction. The app saves locally before making network requests.
- **Supabase:** one managed Postgres database, email-link Auth, Realtime invalidations, and one Edge Function. No separate custom application server, password database, message broker, payment provider, or external queue is needed.
- **Temporal polyfill:** explicit IANA zones, cross-zone flights, and rejection of ambiguous/nonexistent daylight-saving times.
- **Integer minor units + BigInt intermediate arithmetic:** exact deterministic reconciliation across currency precisions.

The source includes the migration and Edge Function. Supabase is now configured on the hosted build. The installed migration, Auth endpoint, CORS, and rejection of anonymous data/function requests were verified live. The owner also confirmed successful email sign-in. Google Maps, AI, and automatic exchange rates remain unconfigured; manual planning and manual rate snapshots remain available.

## Connect the backend

1. Create a Supabase project. In Authentication, enable email magic links, configure an SMTP sender for reliable delivery, and allow your exact local and deployed redirect URLs. Auth handles link expiry and email verification; this app never manages passwords.
2. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY`. The anon key is designed for browser use; the service-role key must never be placed here. Rebuild/restart after changing Vite variables.
3. Apply `supabase/migrations/001_private_trips.sql` using the SQL editor, or the Supabase CLI:

   ```text
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push --linked
   supabase functions deploy travel-services
   ```

4. Configure Edge Function secrets through the Supabase dashboard. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied by Supabase. Set `ALLOWED_ORIGIN` to exact allowed origins separated by commas. The current Pages origin is `https://ameenmahmood.github.io` (no path). The default for an unconfigured development deployment is `http://127.0.0.1:5173`. Redirect URLs, by contrast, include the application path: `https://ameenmahmood.github.io/Wayfarer/`. The checked-in Auth config contains this production Site URL and callback allowlist.
5. Sign in from **Settings & account**. Create a new trip. The local sample trip is not uploaded into connected mode. Keep demo data in a separate browser profile if switching modes; there is no automatic conversion of fake sample members into real accounts.
6. Under **Members**, the owner creates an email-bound editor/viewer invitation and copies its link. Share that link yourself. The recipient signs in with the matching email, then accepts it. Invitation creation does **not** email the friend. The link expires after seven days, is single-use, and can be revoked by the owner.

The earlier Sites host remains available during migration, but its ChatGPT gate was removed at the owner's request. The primary GitHub Pages deployment uses Supabase email login only. Public frontend access does not grant trip access; Supabase independently checks membership and role.

If you apply the initial SQL through the dashboard before using the CLI, inspect the complete schema first, then mark that existing migration with `supabase migration repair 001 --status applied --linked`. This updates tracking only. Verify with `supabase migration list --linked` and `supabase db push --linked --dry-run`. Do not reset the database to solve an already-existing-table error.

The migration enables RLS on every application table. Direct REST writes are denied. `apply_change` checks membership, role, personal-list ownership, immutable record identity, money/split validity and record version. Trip settings/budgets/base currency are owner-managed. Editors change plans, expenses, repayments and shared lists; viewers read. Memberships are authoritative; archived participant IDs remain in financial history after revocation.

The app fetches visible records on sign-in/reconnect, after mutations, every 30 seconds, and on Realtime invalidations. With no network, previously loaded data stays in IndexedDB. This is a small-group design: synchronization currently performs a bounded-by-your-data full pull rather than cursor-based pagination. Keep the Supabase API row limit above the number of records in your workspace until pagination is added.

## Google Maps configuration and billing

1. Enable billing and **Maps JavaScript API**, **Places API (New)**, and **Routes API** in Google Cloud.
2. Create a browser key restricted by exact HTTP referrers and Maps JavaScript API. Put only that key in `VITE_GOOGLE_MAPS_BROWSER_KEY`.
3. Configure a separate server key as `GOOGLE_MAPS_SERVER_KEY` in Supabase secrets, restricted to Places API (New) and Routes API. Use the restrictions appropriate to your server environment. Never put it in a `VITE_` variable. Use quotas, budget alerts, and billing controls.
4. Before enabling Google in production, make the supplied `public/privacy.html` and `public/terms.html` available on a **publicly accessible** legal-pages host and set `VITE_PRIVACY_URL` / `VITE_TERMS_URL` to those URLs. A private Sites access gate also protects its static legal pages; that alone does not meet Google's public-policy requirement. Adjust the privacy page to identify your installation's operator and contact route.
5. Rebuild/redeploy the client and deploy the Edge Function. Errors for missing configuration, quota, billing and unavailable routes are displayed; the saved itinerary continues working.

Map markers and polylines use Google Maps. The unconfigured demo renders an **illustrative area sketch**, with no actual navigational geometry, and labels it accordingly. It never presents this as Google Maps or live directions. Itinerary selection highlights the corresponding marker; marker selection highlights/scrolls the entry. External Google directions links can be used independently.

Place search retains only a linked **place ID**. Names, addresses, coordinates, notes and hours in saved records are traveler-authored (or explicitly labeled sample/AI content), not copied place search results. Google places, coordinates, hours, route matrices and polylines are fetched live into component memory and are not stored in IndexedDB, the backend, or the service worker cache. Accepting a route saves the traveler's chosen ordering/times, preserving their original authored opening-hours field. Do not copy provider content into durable records in future changes without reviewing current terms. Google's and third-party attributions remain visible. Review EEA terms if applicable to your billing address.

Route requests use the current Routes API. Transit does not support intermediate waypoints, so the app uses pairwise routes and a matrix, including for other modes. It **does not assume Google's waypoint optimizer solves appointment or opening-hour constraints**. Matrix queries are chunked to at most 96 elements per request, with up to 12 total points (10 stops plus endpoints).

### Route scheduling boundaries

- Bounded insertion heuristic, at most 10 single-day stops, not a guaranteed mathematical optimum.
- Fixed appointments keep their local start times. Flexible stops are inserted into feasible slots with supplied/regular opening windows and leg estimates; start/end locations, departure time and durations affect feasibility.
- Multi-day hotel stays are displayed across days and excluded from stop optimization. Cross-zone flights are supported in the itinerary with separate arrival zones; optimize one destination-local zone at a time.
- Google regular opening windows are used transiently when simple enough. Missing, complex, overnight, holiday and split hours need manual verification. Unknown hours are not a promise that a venue is open.
- The matrix is one departure snapshot; traffic and transit durations may differ at actual per-leg departure times. Recheck transit schedules before travel. A feasible proposal is approximate, not a booking or timetable guarantee.
- A proposal shows estimated travel, savings (or additional travel required), and conflicts; the original remains unchanged until accepted. Acceptance saves individual versioned records; it is not a cross-record transaction. Concurrent edits can require per-record conflict resolution.
- Local demo estimates use great-circle distance and assumed speeds with a small buffer; they do not model streets, traffic or transit timetables. They are labeled **LOCAL DEMO**, not live Google estimates.

## Money rules

- All amounts are integer minor units; currency precision comes from `Intl.NumberFormat` (e.g. USD 2, JPY 0, KWD 3).
- Equal, weighted and percentage splits use largest-remainder allocation. Remainder ties use participant ID order. Percentages are stored as integer basis points, totaling 10,000.
- Exact shares are minor-unit amounts of the subtotal, excluding tax/tip/fees. Shares must sum exactly. Itemized splits allocate each item only among its selected participants. **Items + tax + tip + fees must equal the stated total**. Extras are allocated equally or in proportion to subtotal/item shares exactly once.
- Exchange snapshots are positive rational numbers (numerator/denominator), with date and source saved on the expense. Conversion adjusts source/base precision and uses half-up rounding. Base-currency participant shares are allocated from the rounded base total, so totals reconcile. Later market changes do not change records. Editing a rate is an explicit expense edit subject to conflict checks.
- Actual spending excludes estimates and repayments. Planned itinerary costs are listed separately in original currencies. Expense linkage does not automatically delete an estimate.
- Suggested settlements preserve net balances. Recording repayments changes balances, not spending. Partial repayments are supported; delete an erroneous repayment and enter its correction. No payments are processed.
- The trip base currency is immutable after creation to prevent silent reinterpretation of existing budgets and repayments.
- CSV exports actual expenses with original and converted minor amounts and rate snapshot details; fields are quoted and spreadsheet formula injection is neutralized. Repayments are shown separately in the UI.

## Optional exchange rates and AI

Set `EXCHANGE_RATE_URL` to an HTTPS endpoint accepting `base` and `symbols` query parameters and returning `{"date":"YYYY-MM-DD","rates":{"USD":0.0067}}`. `EXCHANGE_RATE_KEY` is sent as a server-side Bearer token. Rates are fetched only on request and persisted as expense snapshots. Manual entry always remains available. This adapter must be matched to your provider's schema; no public rate feed is assumed.

For optional AI, set server-only `AI_API_KEY` and optionally `AI_MODEL` (default `gpt-4.1-mini`, replace with a model available to your account). The function validates output and limits each signed-in user to four AI requests per minute; other service actions are limited to 20 per minute. Limits are stored in Postgres. No provider secret enters the browser.

The request includes only destination, dates, interests, budget, available time, and up to 20 existing activity titles. Suggestions are unverified, never bookings, and never auto-added. When a Google server key is present, possible place matches are fetched for review; this does not verify current availability or opening hours. Add selected ideas to saved places, then confirm the details yourself. Manual planning works with AI disabled.

## Offline, conflicts, and privacy

Each edit and its immutable operation are committed in one IndexedDB transaction. Operations are ordered and carry a unique ID plus expected server version. Retrying a committed operation returns its receipt instead of adding a second expense/repayment. Another edit made while an acknowledgment is lost gets its own operation and expected version. The queue survives reloads and reconnects.

Concurrent changes return the server version for comparison. Financial edits are never automatically merged. **Settings** shows local/server JSON and lets you keep the server version or explicitly reapply your latest version. Remote deletions are tombstones; they cannot be silently resurrected. Pending/failed/conflicting changes stay visible. Revoked users cannot replay old receipts to obtain new server access. Failed unauthorized changes remain local for review; they are not silently uploaded.

Personal packing records and personal templates are filtered by owner at the database level. Shared lists are available to trip members. Templates reset packed state and respect the destination list's personal/shared scope.

**Clearing storage can destroy unsynchronized edits. Remote access revocation cannot erase previously downloaded copies.** IndexedDB is not encrypted by this app; use a protected device/browser profile. Signing out hides cached connected trip records; another account cannot reuse that cache. Use a separate browser profile for a different account. Offline access depends on a locally retained auth session; initial sign-in needs internet.

## Verification

`npm test`: **33 tests passing** across six files as of this delivery. `npm run build`: TypeScript + production build pass. `npm audit`: zero known dependency vulnerabilities after upgrading the test runner.

- Money: deterministic rounding, randomized allocations, JPY/KWD precision, item assignments, equal/exact/percentage/weighted splits, invalid splits, rate snapshots/conversion, balance reconciliation, editing/deletion, repayments, CSV safety.
- Time: cross-zone instants and flights, DST gaps/ambiguity, multi-day lodging, overlap/unavailable-route/opening-hour checks, fixed appointments, infeasible proposals, endpoint legs and 10-stop bounds.
- Browser storage: idempotent initialization, offline creation/edit/deletion and persistence. Connected-client tests use a fake transport plus real IndexedDB behavior to check ordered queue replay, lost acknowledgment, conflict review, and tombstones.
- PostgreSQL: the **actual migration and RPCs execute in embedded Postgres/PGlite**, with test auth helpers and test-only substitutes for `pgcrypto` token generation/hashing. Tests cover invitation acceptance/wrong email/reuse/revocation, both members editing, version conflicts, duplicate operation receipts, itemized settlement, viewer/direct-write denial, personal-list isolation and revoked-access receipt replay. These tests do not validate Supabase's hosted auth, SMTP, network Realtime, or cryptographic entropy.
- Service worker: actual script precaches production asset paths, serves the shell on failed navigation, and never intercepts Google requests. A browser-level network disconnect/reload was not available through the preview tools; no live two-device offline-sync test is claimed.
- Browser QA: desktop dashboard, 390px phone layout, route preview/apply, sample itemized split editor, repayment recalculation without spending increase, and theme persistence were checked interactively. Dark theme computed colors and no horizontal document overflow were confirmed. System appearance uses the native `prefers-color-scheme` media query; there was no system-theme emulation control in the browser tool, so both OS states were not driven automatically.

### Demonstration

In local demo, open the Japan sample. Choose **Optimize day**, set departure to **07:00** and driving, preview the labeled approximate proposal, then accept it. In **Expenses**, inspect the itemized izakaya dinner, then record Maya's suggested repayment: actual spending stays $80.40 while her remaining balance reaches $0.00. Packing changes and manual plans persist across reloads.

For the full connected owner/friend/offline workflow, configure services above, then:

1. Owner signs in and creates a trip. Under Members, create an editor invitation for the friend's email.
2. Friend uses a separate browser profile, signs in with that email, and accepts the link. Both add/edit different plans; verify last-editor stamps and Realtime refresh (30-second fallback).
3. Disconnect the friend's device, edit a plan and shared packing item, reload offline, reconnect and click sync. Pending operations should clear exactly once.
4. Both edit the same expense while disconnected. Reconnect: one version wins the compare-and-swap; the other displays a conflict. Compare/reapply deliberately. Delete an entry remotely and ensure old offline edits cannot resurrect it.
5. Enter a two-item expense with different participants and extras, choose a rate snapshot if needed, review reconciled shares, then record suggested repayments. Actual spending remains unchanged.
6. Fetch a live route matrix, review savings/conflicts, and accept the proposal. Revoke the friend's access and verify future API access fails. Already downloaded copies can still exist.

These scenarios are exercised at the domain/transport/Postgres level in the tests; **a live hosted two-account demonstration awaits credentials**.

## Likely billable services

Google Maps loads, Places searches/details, Routes queries and matrix **elements** can incur usage-based charges. Supabase database/storage/egress, Realtime, Edge Functions, email delivery and hosting may incur charges beyond included allowances. Optional AI token usage and the chosen exchange-rate provider can also be billable. No subscriptions or paid services were provisioned for this implementation. Set project quotas/alerts before enabling keys; this README does not quote prices or free-tier amounts.

## Official integration references

- [Supabase passwordless email links](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Postgres changes / Realtime](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Google Routes waypoint optimization and restrictions](https://developers.google.com/maps/documentation/routes/opt-way)
- [Transit routes do not support intermediate waypoints](https://developers.google.com/maps/documentation/routes/transit-route)
- [Compute Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [Places policies: caching and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Routes policies: display, caching and attribution](https://developers.google.com/maps/documentation/routes/policies)
- [Google Maps API security practices](https://developers.google.com/maps/api-security-best-practices)

No email/file booking imports, marketplace, payment processing or public trip discovery are included.
