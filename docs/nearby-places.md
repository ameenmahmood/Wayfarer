# Nearby place discovery

The dev itinerary sidebar replaces AI recommendations with Find places nearby. Users select a city/neighborhood/address or a located itinerary entry, one of five categories, and a radius of 0.5, 1, 2, 3 or 5 miles (default: 1 mile), converted to whole meters for Google. Google resolves the search center and Nearby Search (New) returns up to eight results ranked by distance. Ambiguous location text resolves to Google's first match; the resolved name is shown so users can refine the location. No device geolocation permission is requested.

The new authenticated `nearby` service action uses the existing server-only Google key. It validates categories, coordinates, radius and membership and retains the existing per-user rate limit. The selected fields exclude ratings, prices, photos and opening hours. Calls can incur Google Places charges. The backend is shared with production, but the new action does not change old actions or require an AI API key.

Results, names, addresses, resolved center data and attributions exist only in UI memory. Google Maps and applicable provider attribution appear with results. Google Maps links are opened for review. Save for later or Add to day opens the activity form, where the user enters their own title. Only the Google place ID and user-entered plan fields are retained; results are not put in IndexedDB or the service-worker cache. Places already linked to the trip are marked to prevent accidental duplicates. Viewers can search without creation controls. Search failures, no matches and offline/demo states are explicit.

The prior production AI endpoint is retained for backwards compatibility with older clients. The dev interface makes no AI requests. No OpenAI key or AI billing is needed for nearby discovery. The deferred live two-account verification remains unchanged.

Official references:
- https://developers.google.com/maps/documentation/places/web-service/nearby-search
- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/places/web-service/policies
