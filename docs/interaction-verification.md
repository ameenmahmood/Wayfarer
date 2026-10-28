# Interaction and scrolling verification — October 27, 2026

This audit fixes controls that appeared interactive but did not lead to distinct destinations, and verifies manual planning with local sample data. Production trip data was not altered.

## Changes

- My trips now opens a trip library; cards, sidebar trips and Trip dashboard open the selected itinerary. Account avatar, profile and workspace controls open settings. Mobile navigation closes on selection and supports Escape, focus containment and background isolation.
- Section changes bring the selected content into view. Day and section rails support touch, visible scroll controls and keyboard navigation. The sidebar scrolls independently, including on short screens. Hidden mobile navigation is removed from keyboard navigation.
- Dialog headers stay visible while their contents scroll. Background scroll locking survives the transition from navigation to a dialog; closing restores focus and scrolling.
- Newly created pending trips retain owner editing controls, and last-known roles remain available offline. Server authorization still enforces every operation. Viewers see an explanation; budget management requires owner access.
- Itemized expenses with no items can no longer silently become equal splits. Split validation explains disabled Save controls. Repeated asynchronous actions are guarded, packing controls show their busy state, and icon-only item removal buttons have accessible names.
- Online-service failures show the backend's recovery message. Map retry resets failed script loading. Demo maps stay illustrative even if a production browser key exists locally.

## Automated coverage

Run `npm test` and `npm run build`. The UI suite exercises trip library/account/appearance controls; packing creation, editing, checkboxes, personal lists, templates and deletion; itinerary editing, saved-place duplication and deletion; itemized expense creation, validation, editing, item removal and deletion; budget updates; repayment creation/deletion without increasing spending; trip creation; feasible route preview/acceptance and conflict reporting; and navigation-to-dialog scroll locking. Existing tests cover money, schedules, SQL permissions, IndexedDB, sync retries, conflicts, tombstones, and offline shell behavior. Online-service error handling is also tested.

## Browser checks

Local sample data was used at 1280×720, 390×844, and intermediate/short viewports. Dialog contents overflow vertically within the viewport; the mobile day rail scrolls horizontally; section switching makes the selected content visible; navigation and account settings open and close correctly. Previously saved local entries remain after reload. No full-page horizontal overflow appeared at mobile width.

## Limits

Authenticated production collaboration was not re-tested through the browser because the automation browser does not share the user's Supabase session. Existing server tests exercise authorization separately. Live Google, AI and rates require configured services; disabled demo/role-dependent controls are intentional and explained. No claims of live authentication, routes or collaboration are based on demo tests.
