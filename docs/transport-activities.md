# Explicit transport activities

Transportation entries keep the existing agenda layout and expand inline. Their four main controls are From, To, Pickup, and Method. Add transport is the shortcut for creating one; selecting Transportation in the ordinary Add plan form uses the same controls.

Locations can reference an existing plan, a searched Google place, or a user-entered label and coordinates. References use stable entry IDs, so reordering cannot silently change the journey. A deleted or unresolved referenced location needs review; the app never substitutes a neighboring stop. Google result names are shown with attribution during search; saved labels come from the traveler’s query or own plan.

## Estimates and maps

- Only explicit, complete Transportation entries request ground routes. Ordinary activities and old arrival metadata never trigger route calls.
- Taxi/car use driving routes, walking and cycling use their corresponding methods, and bus/train use public transit estimates. Exact booked services need checking. Ferry/Other support a manually entered timetable duration instead of inventing a road route.
- Pickup dates/times use the existing activity date, start, and local-time metadata. Estimates show duration and arrival, including the date for overnight arrivals. They never overwrite a booked arrival or move another activity.
- Relevant route inputs form a shared in-memory request key. The editor and map share requests, debounce input changes, and limit concurrent requests. Reordering, title/note edits, and navigation reuse the same result. Refresh explicitly recalculates. Responses for old inputs cannot replace the current estimate.
- Provider duration, geometry, warnings, and timestamps remain in memory. They are not written to trip records. User-entered manual minutes and chosen route inputs sync normally.
- The map projects endpoints without adding duplicate itinerary records and draws returned geometry only for the corresponding transport activity. Flight airport connections remain separate. External Google Maps links use the selected transport’s endpoints and method; unsupported ground methods open the destination instead.
- Schedule checks use known transport durations and existing activity times, without inferring travel gaps between ordinary stops. The former general stop-optimization control is replaced by Add transport in the itinerary.

## Existing trips and permissions

Existing Transportation activities need their explicit endpoints selected before a new route can calculate. Existing titles, dates, costs, notes, booked arrivals, and legacy arrival/booking metadata are retained. Legacy details remain readable on their original activity or inside the transport row’s More details disclosure. This release does not infer or rewrite existing journeys.

Viewers can inspect transport details but have no save controls. Existing save/sync authorization remains in place. The optional `transport` object lives in the existing entry JSON payload, which already supports additional fields; this release requires no backend migration or new API action.

## Verification

Tests cover route eligibility, stable endpoints, deleted references, overnight arrival, manual fallback, deduplicated requests, stale responses, viewers, preserved bookings/times, transport-only map requests, legends/alerts, and creating an endpoint without inserting an extra activity. Browser QA uses the isolated local demo on desktop and mobile; live provider calls are exercised through the controlled route API tests, not a personal production trip.

Release validation: 32 test files / 277 tests passed, along with the production build and browser checks at 1440px, 390px, and 320px widths. Verified creation, inline saving, reordering with stable endpoints, unchanged neighboring times, and mobile save controls. No horizontal page overflow was observed.
