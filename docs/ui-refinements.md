# Itinerary UI refinements

The existing agenda/map arrangement, trip dropdown, horizontal dates, whole-trip groups, and scrolling Add a plan remain the core layout.

- Activity rows use a shared icon/name/time/chevron grid. Times stay right aligned and long names wrap in their own column. Category colors use the existing theme variables and support light and dark themes.
- Activities open into compact read-only facts and primary actions. Editing is explicit. Booking references support copying; Google place details still load on request with attribution. Flight connection details and legacy travel metadata remain available.
- Transport opens into a summary before editing endpoints, pickup, method, or manual duration. The inline editor also links to the full plan form for title/date changes. These forms retain saved booking information.
- New ordinary activities have no default time and display Anytime. Existing saved times are unchanged. Explicit transport durations produce departure/arrival ranges, including next-day and cross-zone arrivals.
- Alerts represent missing transport setup, failed estimates, invalid times, overlaps, and supplied opening-hour conflicts. Missing optional opening hours do not create alerts. Each alert opens/focuses its activity. Hotel stays intentionally overlap other plans.
- The map retains only explicit transport routes and flight connections. Selecting a plan raises its pins and highlights its ground route; selecting a pin or route opens the agenda row. Selection does not request another route calculation. Desktop maps remain visible while the agenda scrolls.
- Mobile navigation has Itinerary, Map, Ideas, and More. A native modal sheet provides Expenses, Packing, Members, and Trip settings, with Escape, backdrop dismissal and focus restoration. Desktop retains all sections.
- The trip dropdown includes cover thumbnails, trip dates, switching, all trips, new trip and trip details. It closes on Escape, outside click, or leaving focus. No large image is added above the agenda.
- The mobile Add a plan scrolls with the itinerary, avoiding a duplicate floating CTA. Compact controls preserve usable tap targets; nested disclosures have no empty paragraphs or grid gaps.

No database migration or new service configuration is required.

Validation: 286 tests across 34 files, production TypeScript/Vite build, and browser checks at desktop and 320px/390px mobile widths in both themes. Checked row and segmented-label alignment, dropdown/sheet dismissal, flexible plan saving, transport summary/edit controls, and horizontal overflow. Live provider behavior is covered by controlled service tests; browser checks use local demo data.
