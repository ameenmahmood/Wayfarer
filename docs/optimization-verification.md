# Performance and usability optimization verification

This update follows the user's confirmation that live Places search works. Existing Supabase and Google service configuration was preserved.

## Changes

- Load itinerary, expense, packing, member, settings and trip-form code on demand. Keep navigation visible while a section loads, and offer recovery when a section fails. Every split application asset remains included in the offline shell precache.
- Preserve the selected day and itinerary state when switching between itinerary and map.
- Redraw/fetch maps only when location/order, transportation, trip or map instance changes. Renaming an entry and editing its notes no longer repeat place-details and route requests. Marker titles still update.
- Track map markers by entry ID so unavailable places do not shift selection onto another stop. Use close zoom for a single stop; rebuild markers after retry; time out failed map-script loading with a recovery message.
- Ignore responses from an older Places query after the user edits the query. Clear old result buttons immediately; retain explicit Search and Enter-key behavior. Keep Google result details transient.
- Use clearer packing-form labels: Item name, Category and Notes.

## Measured build results

Connected Vite production builds, before versus after:

| Initial JavaScript entry | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Uncompressed | 711.88 kB | 486.87 kB | 31.6% |
| Gzip | 207.57 kB | 142.43 kB | 31.4% |

These are bundle sizes, not page-load timing measurements. Remaining tools load as separate chunks. The service worker downloads all application chunks in the background for offline use, so this does not imply the same reduction in total offline-install download size. The build now has 12 precached JavaScript/CSS assets.

## Validation

72 tests in 11 suites passed, along with TypeScript and the connected production build. Added coverage checks stale search responses; map request counts after unrelated edits; marker selection with a missing earlier place; latest click callbacks; retry rebuilding; itinerary/map day preservation; loading progress; error isolation and recovery; and precaching split sections. Existing suites continue to check money, repayments, time zones, scheduling, SQL permissions, IndexedDB, sync conflicts/idempotency/tombstones and production navigation.

Browser checks used isolated local sample data to save an expense, add and pack an item, and switch between itinerary and map while retaining day two. A 390px mobile viewport showed no full-page horizontal overflow, and the modal remained within the viewport with its own scrolling. Connected signed-out dev and production navigation are checked separately. Map regression tests use a controlled SDK/API transport; no new authenticated live collaboration claim is made. The user independently confirmed the live Google search integration before this update.
