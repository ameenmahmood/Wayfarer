# Ideas

Ideas is a shared trip board for options that have not necessarily been scheduled. Statuses are **Considering**, **Passed**, and **Approved**. Categories are Activity, Restaurant, Hotel, Flight, Transport, and Other. Every card has a title, optional reference link, notes, location, and optional estimate in its original currency. Status and category filters are independent.

Owners and editors can add, edit, remove, and schedule ideas. Viewers can browse, filter, follow references, and view existing linked plans. Approved does not mean booked or scheduled. Ideas do not enter expense reports or planned itinerary totals. Adding an idea to the itinerary copies its estimate into an ordinary itinerary entry, never an actual expense.

## Scheduling

Add to itinerary opens the existing activity editor for review. Hotel becomes Lodging; Transport becomes Transportation. Choose a date/time and review duration, destination time zone, and other details before saving. Saving approves the idea and opens the itinerary on the chosen day. Existing linked plans offer View in itinerary instead of another Add button. Removing an idea retains its plan; removing a plan permits scheduling the idea again with a new record, preserving the old deletion tombstone.

Local promotion writes the idea and new entry in one IndexedDB transaction guarded by the idea version. Shared synchronization remains per record, as with the existing app: it is not a remote multi-record transaction. Interrupted synchronization can temporarily show the Approved idea before the plan arrives. Pending changes and failures use the existing sync controls. Two collaborators promoting an idea concurrently cannot create two active linked plans: a server uniqueness constraint and RPC conflict result prevent this. A losing promotion can require discarding its conflict in Settings; nothing is silently overwritten.

## Storage and backend

`idea` records use the existing IndexedDB entities store and idempotent mutation queue, requiring no browser database reset. Membership RLS, owner/editor RPC checks, version conflicts, and deletion tombstones apply. Migration **006_trip_ideas.sql** adds the kind, validates idea payloads server-side, and prevents duplicate active itinerary links. It is installed on the shared Supabase backend. No authentication or invitation settings changed. The Ideas tab is included in the production frontend release.

New setup: apply all numbered migrations in order using the existing README instructions. No additional keys, providers, or billable integrations are needed.

## Verification

- PostgreSQL tests: member reads, outsider denial, viewer write denial, editor changes, input validation, stale versions, idempotent retries, duplicate promotion prevention, removal and tombstone protection.
- IndexedDB tests: offline persistence, local atomic promotion, concurrent promotion guards, hotel field conversion, original estimates, removing an idea without removing its entry, and re-adding after entry deletion.
- Sync transport tests: queue an offline idea, reconnect, lose a response after commit, retry without duplicates.
- UI tests: add/edit/filter, review the itinerary form, open the chosen day, linked-plan button, cancel/confirm idea removal, and viewer controls.
- Browser review: desktop and 320/390px layouts; create three demo ideas across the statuses; review and schedule a transport idea; reload and confirm persistence.

Two independently signed-in live browsers have not been used for end-to-end collaboration verification. SQL authorization tests and controlled sync transport tests cover that behavior without presenting the demo as live collaboration.
