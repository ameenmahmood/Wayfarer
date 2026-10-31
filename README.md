# Wayfarer

A private travel planner for you and invited friends. Plan activities, explore a map, split expenses, and organize packing in one shared trip workspace.

**Live application:** [ameenmahmood.github.io/Wayfarer](https://ameenmahmood.github.io/Wayfarer/)

Anyone can open Wayfarer. Sign in by email to create and save your own trips. Each trip is private to its owner and invited members.. This is not a travel marketplace: there is no public trip discovery, payment processing, or booking import.

## What you can do

| Area                 | Current behavior                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trips                | Create multiple private trips with destinations, dates, travelers, time zones, base currencies, and budgets.                                                                                                                           |
| Itinerary            | Use daily, whole-trip, and saved-place views. Add activities, restaurants, transport, flights, lodging, and notes through a simplified form with optional details. Times display in 12-hour format.                                    |
| Reordering           | Drag an activity’s three-bar handle, use its up/down arrow keys, or use the move buttons. Reordering changes display order without changing reservation times. Move or duplicate plans between days.                                   |
| Travel between stops | Choose walking, driving, cycling, or public transit. Calculate a live estimate when available, or enter travel minutes manually. Rough estimates are labeled.                                                                          |
| Map                  | Open a dedicated, nearly full-window map without the activity list or sidebar. Change day, trip scope, and transport; select a stop to view its details and edit it when permitted. Returning to Itinerary preserves the selected day. |
| Nearby places        | Find cafés, restaurants, attractions, parks, and museums around a destination or itinerary stop. Search radii use miles. Review results before adding a place to a day or saving it for later.                                         |
| Route proposals      | Preview a suggested stop order, travel estimates, savings, and conflicts before applying changes. Fixed reservations and supported opening windows constrain the proposal.                                                             |
| Expenses             | Track budgets, categories, planned costs, actual spending, itemized splits, currencies, repayments, balances, and suggested settlements. Export expenses as CSV.                                                                       |
| Packing              | Maintain shared or personal lists with categories, quantities, assignments, notes, packed status, and reusable templates.                                                                                                              |
| Members              | Owners invite editors or viewers, change access, and revoke invitations or membership. Signed-in recipients see pending invitations even without the original link.                                                                    |
| Appearance           | Follow the system theme or remember an explicit Light/Dark choice. Signed-out accounts use person icons and clear Sign in labels.                                                                                                      |

Owners can customize the trip banner using **Change cover**. Curated city and landscape presets include suggestions based on local keyword matches, such as NYC → New York skyline. This is a preset catalog, not a live image-search service. Photos require internet and have a gradient fallback.

To delete a trip, an owner opens **Edit trip → Delete trip** and confirms the named trip. Connected deletion requires internet and no pending/conflicted edits for that trip. It removes the trip from the app for all travelers and revokes invitations. Records remain tombstoned for synchronization; there is no in-app undo or physical database purge.

The former **Adjust schedule** button and its reminders have been removed. The internal scheduling module and its tests remain in the source. **Optimize day** remains available for supported daily plans. Nearby-place discovery replaced the AI recommendation interface; no AI key is needed for the current interface.

## Run locally

Use **Node.js 24**, matching the GitHub Actions build.

```sh
git clone https://github.com/ameenmahmood/Wayfarer.git
cd Wayfarer
npm ci
npm run dev -- --port 5174
```

Open [http://127.0.0.1:5174/](http://127.0.0.1:5174/).

Without Supabase configuration, the app starts a clearly labeled **local demo** with a separate Japan sample trip. Demo travelers, maps, and route estimates are illustrative; it does not simulate successful authentication, invitations, or collaboration. To connect to your backend, copy `.env.example` to `.env.local` and configure both Supabase variables below. Restart after changing environment variables.

```sh
npm test
npm run build
npm run preview -- --port 4173
```

The preview opens at [http://127.0.0.1:4173/](http://127.0.0.1:4173/) with the default base path. The production service worker is enabled in builds, not during Vite development.

## Architecture

- **React + TypeScript + Vite:** responsive interface and a static build that GitHub Pages can serve continuously without a running development computer.
- **IndexedDB + idb:** local trip records and a persistent, versioned mutation queue. Edits are saved locally before synchronization.
- **Supabase:** passwordless Auth, Postgres with row-level security, Realtime invalidations, and the `travel-services` Edge Function. Membership and role checks run on the server.
- **Temporal polyfill:** IANA time zones, cross-zone arrival times, and daylight-saving validation.
- **Integer minor units + BigInt intermediate arithmetic:** deterministic expense splitting and currency conversion.

Google Maps and place lookup are configured on the hosted installation. A fresh clone needs its own service configuration. Automatic exchange rates require a separately configured provider; manual rate snapshots remain available.

## Service configuration

### Browser environment

Keep `.env.local` out of Git. The example contains no secrets.

| Variable                             | Purpose                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                  | Supabase project URL.                                                           |
| `VITE_SUPABASE_ANON_KEY`             | Public browser anon key. Server authorization remains mandatory.                |
| `VITE_GOOGLE_MAPS_BROWSER_KEY`       | Optional browser-visible Google Maps key, restricted by website origin and API. |
| `VITE_PRIVACY_URL`, `VITE_TERMS_URL` | Public legal-page URLs; default to the bundled `privacy.html` and `terms.html`. |
| `VITE_BASE_PATH`                     | Deployment base path; the Pages workflow sets `/Wayfarer/`.                     |

Never put a Supabase service-role key, SMTP password, Google server key, AI key, or exchange-provider secret in a `VITE_` variable.

### Supabase

1. Create a project and enable email sign-in and first-time account creation. Keep email verification enabled. Configure a custom SMTP sender and exact deployed/local redirect URLs.
2. Link the project and apply **all migrations**, in order:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --linked
   npx supabase functions deploy travel-services
   ```

3. Review `supabase/config.toml` for your own deployment. It includes the current Pages Site URL, development callbacks, a one-minute email interval, and branded confirmation/magic-link templates. Preview before applying:

   ```sh
   npx supabase config diff --project-ref YOUR_PROJECT_REF
   npx supabase config push --project-ref YOUR_PROJECT_REF
   ```

   Configure SMTP credentials in Supabase, not in this repository. The two HTML templates preserve Supabase’s secure `{{ .ConfirmationURL }}`. Authentication settings and templates are **not** deployed by the Pages workflow.

4. Set Edge Function secrets in Supabase. Set `ALLOWED_ORIGIN` to the exact allowed origins, separated by commas, such as `https://ameenmahmood.github.io,http://127.0.0.1:5174,http://localhost:5174`. Origins have no path; Auth redirect URLs include the application path.
5. Add the browser environment variables, restart, and sign in. Connected mode does not upload the demo trip or convert its sample travelers into real members.

| Migration                             | Purpose                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `001_private_trips.sql`               | Tables, RLS, membership, validation, mutation receipts, and invitation RPCs.                     |
| `002_delete_trips.sql`                | Owner-only deletion, trip-wide tombstones, and deletion-aware invitation/mutation checks.        |
| `003_missing_conflict_entity.sql`     | Correct JSON null for conflicts involving a missing record.                                      |
| `004_invitation_inbox.sql`            | Recipient-only invitation discovery, acceptance by ID, and safe acceptance retries.              |
| `005_internal_validation_helpers.sql` | Restrict direct execution of internal validation helpers and pin the money helper’s search path. |

All five migrations are installed on the current hosted backend. If an existing database was initialized manually, verify its schema and migration history before using migration repair. **Do not reset the database to fix an “already exists” error.**

### Sign-in and invitations

The account popup contains one introduction and the email form. First-time users receive an email confirmation; returning users receive a sign-in link. The form normalizes addresses, prevents immediate repeat requests, shows a resend countdown, and explains request failures. A successful request is not an inbox-delivery guarantee. Check Spam/Junk/Promotions and open the newest email; requesting another link can invalidate an earlier one. See [the email delivery audit](docs/auth-delivery.md) and [Supabase’s delivery troubleshooting](https://supabase.com/kb/troubleshooting/not-receiving-auth-emails-from-the-supabase-project-OFSNzw).

A signed-out user can draft a trip, but must sign in before saving it. Drafts survive reloads in the same tab through session storage; save/cancel clears them. Open the sign-in link in that same tab to retain a draft.

Under **Members**, owners create email-bound editor/viewer invitations. Wayfarer does **not** send invitation emails: copy and share the invitation link yourself. After signing in with the exact invited email, the recipient can choose **Trip invitations → Join trip**, including when already viewing another trip. Pending invitations refresh on reconnect, on request, and every 30 seconds. Links remain valid for seven days unless accepted or revoked. Acceptance retries for an existing member are safe; a used invitation cannot restore revoked membership. See [invitation behavior](docs/invitations.md).

### Google Maps, Places, and Routes

1. Enable Google Cloud billing and **Maps JavaScript API**, **Places API (New)**, and **Routes API**.
2. Restrict the browser key to Maps JavaScript API and the allowed websites. Include the production URL `https://ameenmahmood.github.io/Wayfarer/` and the local development URLs you use. A `RefererNotAllowedMapError` points to the browser key’s website restrictions.
3. Set **`GOOGLE_MAPS_SERVER_KEY`** in Supabase Edge Function secrets. Use a separate key restricted to Places API (New) and Routes API, with application restrictions appropriate for the server environment. A website-restricted browser key cannot serve server requests with no HTTP referrer.
4. Deploy `travel-services`, set the browser key, and rebuild the frontend. Place search and route calculations require a signed-in trip member and a matching CORS origin. A Places-enabled browser key alone does not configure the server function.
5. Publish and review the bundled privacy/terms pages, including your operator/contact details. Keep Google and third-party attribution visible.

Place lookup and nearby discovery retain only a linked **place ID**, plus the traveler’s own entered plan fields. Google result names, addresses, coordinates, opening hours, matrices, and polylines are fetched into UI memory and are not stored in IndexedDB, Postgres, or the service-worker cache. Map errors leave the itinerary usable. **Offline Google map tiles are not provided.**

Route optimization uses supported pairwise estimates and a bounded scheduling heuristic, rather than assuming Google’s waypoint optimization handles every mode and scheduling constraint. Transit does not support intermediate waypoints. The app limits a proposal to 10 single-day stops plus optional endpoints and chunks matrix requests to at most 96 elements.

Fixed reservations retain their times; flexible stops use supplied/supported opening windows. Unknown, complex, overnight, or exceptional opening hours need manual checking. Multi-day stays are excluded from stop optimization. Transit and traffic estimates use a departure snapshot and may differ at travel time. A proposal is approximate, **not a mathematical optimum or a booking guarantee**. Nothing is applied until accepted. Applying a proposal synchronizes separate versioned records; the remote changes are not one trip-wide transaction.

### Other optional services

`EXCHANGE_RATE_URL` can point to an HTTPS provider accepting `base` and `symbols` and returning a date/rates object. `EXCHANGE_RATE_KEY` is sent server-side as a Bearer token. Adapt the provider response if needed; no public rate feed is assumed. Each expense saves its own rate snapshot and date.

The Edge Function retains a legacy AI action for older clients. The current nearby-place interface does not call it, and **does not require an OpenAI key or AI billing**. Any optional provider secrets remain server-side.

## Money rules

- Amounts use currency minor units, including zero- and three-decimal currencies. Equal, weighted, and percentage splits use largest-remainder allocation, with participant-ID tie breaking. Percentages total 10,000 basis points.
- Exact subtotal shares must reconcile. Itemized expenses assign each item once; **items + tax + tips + fees must equal the total**. Extras are allocated equally or proportionally to subtotal/item shares.
- Saved positive rational exchange rates convert amounts using half-up rounding; base-currency participant shares reconcile to the rounded converted total. Market movements do not silently change saved balances.
- Planned itinerary estimates, actual expenses, and repayments are separate. Repayments reduce balances without increasing spending. Suggested settlements preserve net balances; no payment is processed.
- Trip base currency is immutable after creation. Editing/deleting expenses recalculates balances. CSV exports quote fields and neutralize spreadsheet-formula injection.

## Offline access, synchronization, and privacy

Production builds cache the application shell and bundled JS/CSS after an online visit. Previously loaded trip data and queued edits remain in IndexedDB. Live maps, place search, route calculations, initial sign-in, and collaboration updates require internet. Fonts and external cover photos can fall back offline. Storage quotas, private browsing, eviction, and browser policies can limit persistence.

Every mutation carries an immutable operation ID and expected record version. Server receipts prevent retrying a committed expense or repayment from creating a duplicate. Concurrent financial edits require explicit conflict resolution in the **Sync status** dialog, opened from the status control in the top bar. Deletions use tombstones and take precedence over stale edits. Personal packing lists are protected by assignment/ownership checks. Failed, pending, and conflicting edits remain visible for recovery.

Owners manage trip settings, budgets, invitations, and access. Editors change plans, expenses, repayments, and shared packing; viewers have read access. Application tables use RLS and reject direct client writes. Internal validation helpers are not exposed as callable client RPCs. The public website does not grant access to trip records.

Synchronization uses a full pull of visible records after sign-in, reconnect, and changes, with Realtime invalidations and a 30-second fallback. **Pagination is not implemented**: keep the Supabase API row limit above your visible workspace record count. Another account cannot reuse a connected browser cache; use separate browser profiles for separate travelers.

**Clearing browser storage can remove unsynchronized changes. Revoking access cannot erase copies already downloaded by another traveler.** IndexedDB is not encrypted by this application. Trip deletion has no in-app recovery and retains database tombstones. See [deletion details](docs/trip-deletion.md).

## Deployment

GitHub Pages serves the static app at `/Wayfarer/`. The Supabase backend handles authentication and shared data separately. No development computer needs to remain running.

Every push to `main` runs `.github/workflows/pages.yml`: install dependencies, run tests, build with the Pages base path, precache the shell, and deploy after successful checks. Set repository **variables** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally `VITE_GOOGLE_MAPS_BROWSER_KEY`. Only these public browser values enter the build. `scripts/configure-github-pages.mjs` can copy them from an ignored local environment using GitHub CLI. The workflow rejects a missing connected-mode configuration rather than publishing a demo accidentally.

Backend migrations, SMTP/templates, and Edge Function changes need their own Supabase deployment. For a Pages-shaped local build in PowerShell:

```powershell
$env:VITE_BASE_PATH = '/Wayfarer/'
npm run build
npm run preview -- --port 4173
```

Visit `http://127.0.0.1:4173/Wayfarer/`. Invitation URLs, callbacks, legal links, the manifest, and offline caches respect the base path. Refresh after a production deployment if the browser still shows an older cached interface.

Google Maps/Places/Routes usage, Supabase usage beyond plan allowances, SMTP delivery, and any configured exchange provider can incur charges. Set quotas and alerts appropriate to your accounts; this repository does not provision paid subscriptions or quote current prices.

## Verification and remaining limits

**Latest verified suite: 141 passing tests across 18 files.** GitHub Actions runs the full suite and production build before deployment.

- Money tests cover currency precision, rounding, invalid and itemized splits, saved rates, balance reconciliation, settlements, repayments, edits/deletions, and CSV safety.
- Time/route tests cover time zones, daylight-saving gaps/ambiguity, fixed reservations, multi-day lodging, conflicts, endpoints, unavailable routes, and proposal bounds.
- Real IndexedDB behavior with a controlled sync transport covers offline queues, lost responses, idempotent retries, concurrent changes, deletion precedence, and fresh downloads after invitation acceptance.
- Actual migration/RPC SQL runs in embedded PostgreSQL/PGlite. Tests cover roles, wrong-email invitations, recipient isolation, revocation, deletion, raw-write denial, personal packing, and internal helper permissions. Test-only crypto substitutes do not validate hosted token entropy or SMTP delivery.
- UI tests cover signed-out navigation, trip drafts, invitation recovery, map/day preservation, expanded map rendering, drag and keyboard reordering, account dialogs, resend cooldowns, and error recovery. Google SDK/API tests use controlled responses.
- Browser checks have covered desktop and phone layouts, light/dark settings, map-only navigation, stop details/editing, activity ordering across reloads, covers, expense/packing workflows, and the simplified signed-out/sign-in interface.

The owner confirmed live passwordless sign-in, invitation joining, Google Maps, and place search. A reported missing confirmation email was found in Spam. A complete two-device Realtime/offline/conflicting-expense demonstration remains separately unverified; automated transport/database coverage is not a claim that this live workflow was performed. Browser storage and mail delivery remain subject to the browser/provider.

For connected end-to-end verification: create a disposable owner trip, invite a distinct second account, join and edit from separate browser profiles, edit offline and reconnect, deliberately conflict on an expense, split an itemized expense and settle it, preview/apply a live route, then verify access revocation. Never use private live trips as disposable test data.

## Official integration references

- [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Realtime Postgres changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Google Maps key security](https://developers.google.com/maps/api-security-best-practices)
- [Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search), and [storage/attribution policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Routes waypoint optimization](https://developers.google.com/maps/documentation/routes/opt-way), [transit restrictions](https://developers.google.com/maps/documentation/routes/transit-route), [route matrices](https://developers.google.com/maps/documentation/routes/compute_route_matrix), and [Routes policies](https://developers.google.com/maps/documentation/routes/policies)

Further implementation notes: [invitations](docs/invitations.md), [email delivery](docs/auth-delivery.md), [covers](docs/trip-covers.md), [nearby discovery](docs/nearby-places.md), and [trip deletion](docs/trip-deletion.md). Older verification reports in `docs/` describe their own snapshots and should not be read as current test counts or additional live verification claims.
