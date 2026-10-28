# Production navigation and search follow-up

The prior audit missed an important difference: demo mode already has a trip, while a signed-out production account has none. Creating a trip in that state opened a combined appearance/setup/login dialog. Dashboard used the same fallback. This follow-up tests the connected configuration explicitly.

| Control | Expected destination / action |
| --- | --- |
| Brand, workspace, My trips (sidebar and breadcrumb) | Trip library, with a distinct empty state |
| Trip dashboard | Current itinerary or empty dashboard; never configuration |
| Create a trip (sidebar plus, dashboard, library), Plan a new trip | Trip form; inline passwordless sign-in only when needed to save |
| Account avatar / profile / Sign in / load trips | Account sign-in, without appearance/setup controls |
| Sync indicator when signed in | Sync status, pending changes and retry controls |
| Settings & account | Appearance choices |
| Privacy & offline data | Privacy explanation and legal links |
| Section tabs | Itinerary, map, expenses, packing, members respectively |
| Add a plan / Add expense / Add item / Edit trip | Corresponding form, never account or settings |
| Search or Enter in the place query | Authenticated Places Text Search; loading, adjacent error, results or empty state |
| Select a place result | Links its place ID; user-authored title/notes remain editable |
| Mobile Open/Close navigation | Opens/closes the navigation, restores page access |
| Dialog close / Escape | Closes dialog and restores focus/scrolling |

Browser checks exercised every navigation destination in connected signed-out mode on desktop and mobile, including both dashboard creation buttons, library creation, all account entry points, privacy, and every appearance choice. Production-mode React tests separately exercise an authenticated owner and each trip section's creation form, inline email transport, draft restoration, and owner identity after sign-in. Existing UI and SQL suites continue to cover editing, splitting, repayment, templates, permissions, synchronization and routing. These tests do not claim an actual authenticated production browser session.

Search diagnostics found that localhost origins received HTTP 403 before Google could be called, and the backend initially had no GOOGLE_MAPS_SERVER_KEY secret. Explicit localhost origins were added alongside the existing production allowlist. The function now uses SDK-maintained CORS headers. Handler tests execute the actual Edge Function source with a controlled Google transport, verifying the Text Search endpoint, query, server-key header, field mask, missing-secret errors, and continued rejection of unauthorized users/non-members/unknown origins. Real Google search still requires a valid server secret, billing, Places API (New), and trip membership.


Final local verification: 64 tests across nine suites passed, and the connected production build passed. Deployed preflights returned 200 with matching origins and SDK retry headers for localhost/127.0.0.1 development origins and GitHub Pages; an untrusted origin returned 403. Anonymous Edge Function and trip-data requests remained 401. GOOGLE_MAPS_SERVER_KEY is now present by secret name (its value was never read or displayed). A privileged temporary-account live test was rejected by automatic approval review and did not run. A real authenticated Google result is being checked through the user's existing signed-in development session instead.


Follow-up: 65 tests pass after adding a credential-redaction test. The user verified a real authenticated search reaches Google; Google's response is HTTP 403 with API_KEY_HTTP_REFERRER_BLOCKED and an empty referrer. This confirms the server secret currently refers to a website-restricted key. The remaining fix is Google Cloud configuration: a separate private server key with appropriate server application restrictions and API restrictions for Places API (New)/Routes, stored as GOOGLE_MAPS_SERVER_KEY. Browser-key website restrictions stay unchanged. Detailed Google errors are deployed and redact credentials. Production browser checks verified every visible navigation/dialog entry point against its expected destination after deployment.
