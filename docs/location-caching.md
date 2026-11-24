# Location requests and coordinate caching

The coordinate cache is shared in Supabase across refreshes, devices and approved
accounts. It is keyed by Google place ID, with a **29-day TTL** and an hourly
deletion job. Google permits coordinates to be cached for up to 30 days; using
29 days leaves a margin for scheduled cleanup. Place IDs may be stored indefinitely.
See [Google's service-specific terms, sections 15.3 and 20.3](https://cloud.google.com/maps-platform/terms/maps-service-terms).

## Normal behavior

* Loading a saved map location first checks the shared cache. A fresh entry returns
  coordinates without a Google request or a paid-budget reservation.
* New, missing or expired entries call Place Details with the `location` field mask
  only, then store the coordinates. Existing trip locations populate the cache on
  their first visit after deployment. There is no bulk prefetch job.
* Adding a stop preserves existing in-memory lookups. The itinerary and expanded
  map share those lookups. Simultaneous lookups in the same component are deduplicated.
  Concurrent cold misses in different devices/functions can still perform more
  than one lookup; each is subject to the existing budget and concurrency controls.
* Cache hits do not extend expiry. After expiry, coordinates are fetched again as
  needed. No full Google response, name, address, opening hours, route polyline,
  duration or matrix is stored in the coordinate table or browser storage.
* **Show routes** calculates road/transit routes explicitly. In the expanded map,
  open **Info** to find it. Changing the locations, day or transport mode clears
  the displayed routes; it does not automatically request replacements. Refreshing
  the page also does not recalculate those routes. **Refresh routes** recalculates
  the current view when requested. Flight connectors are drawn from airport
  coordinates without a Routes request.
* **Load place details** in an activity's expanded details fetches Google names and
  addresses for display in the current UI. Those details are not persisted. A full
  detail request also seeds the coordinate cache for later map use.
* Search, nearby discovery and route optimization are still explicit live requests.
  New map instances can still incur a Google map-load event. This cache does not
  cache Google map tiles or make live maps work offline.

## Access and cost enforcement

The Edge Function verifies the session, trip membership and active trip before a
cache lookup. A service-role-only RPC independently checks manual paid approval
even on a cache hit. Public clients cannot read or modify the cache or call its
internal RPCs. Missing approval or failed cache enforcement never falls through
to a Google request. Google cache misses and full detail requests retain the
existing minute, daily, monthly and concurrency checks.

Cached coordinate hits can be served after the monthly paid allowance is exhausted,
although creating a new Google map instance still requires its own allowance.
Revoking approval blocks future cache reads; it cannot erase an already displayed
result from another device. A failed cache write may cause another lookup later.
The small per-view in-memory cache rechecks the server after five minutes and
does not retain failed lookups.

## Deployment and maintenance

Apply migration 012, deploy `travel-services`, and publish the frontend. Migration
012 enables Supabase's built-in `pg_cron` and schedules the owner-run job
`wayfarer-expire-place-coordinates` with `0 * * * *` (hourly).
Monitor it under **Integrations → Cron** or through `cron.job_run_details`.
Investigate failed runs promptly; stale coordinates are rejected on reads even
if a cleanup run fails. Do not disable this job while cache data remains stored.

Embedded PostgreSQL tests exercise the cache table, RPC permissions, expiry and
deletion SQL. They exclude the hosted-only scheduler setup; verify `cron.job`
after deployment. Endpoint tests verify that a cache hit makes no upstream call
and no paid reservation, that misses use the minimal field mask, and that access
failures do not expose cached coordinates. UI tests cover explicit route requests
and retaining existing coordinate lookups.
