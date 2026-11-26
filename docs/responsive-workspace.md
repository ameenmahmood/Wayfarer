# Responsive workspace refresh

Approved mobile and desktop concepts were implemented on November 26, 2026.

- Both appearances use forest green surfaces, mint actions, grouped activity rows, and contextual details.
- The trip-name control reveals the existing cover, trip summary, and owner controls. Desktop retains the collapsible sidebar and scrollable date cards.
- Desktop keeps the agenda to the left of the existing day map. Tablet stacks the map below the agenda; phones use the dedicated Map section.
- Each collapsed activity shows its title and time once. Travel controls and linked flight information are inside the expanded activity, rather than between every activity. Saved arrivals and bookings are preserved.
- Phones keep a single fixed Add action above five navigation items. More exposes Packing and Members.

## Verification

- `npm test`: 30 files, 262 tests passed, including new travel disclosure and More navigation regressions.
- `npm run build`: TypeScript, browser configuration check, Vite production bundle, and offline precache passed.
- Browser inspection at 1440 x 960, 768 x 1024, 390 x 844, and 320 x 812. No horizontal document overflow; date navigation remains independently scrollable.
- Checked mobile More > Packing, activity expansion/collapse, retained desktop trip dropdown, and desktop light/dark styling using the isolated local demo.
- The demo uses its existing illustrative map. Real authenticated maps and personal trip data were not modified during visual QA. Google Maps integration and attribution remain in the existing MapPanel implementation.

Production uses the existing GitHub Pages workflow on `main`; no backend migration or configuration changes are needed.

## Compact map card

The itinerary map begins directly with the map canvas. Flight connection and ground route keys remain in a slim footer with the external-directions link. The former map heading, permanent toll banners, and planned-airport-connection explanation are removed. A yellow alert control opens route warnings, offline/configuration information, and unlinked-flight guidance on demand. Serious map failures still open their recovery control automatically. Google attribution stays inside the SDK canvas.

Verified 263 tests, the production build, and the desktop alert popover using the isolated demo. Map tests cover hidden warning text, Escape/outside dismissal, clearing alerts on route changes, retained route keys, marker selection, and error retry.
