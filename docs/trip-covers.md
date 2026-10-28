# Trip cover images

Owners can choose Change cover from the trip banner. Nine curated Unsplash presets cover Tokyo, New York, Paris, London, mountain landscapes, alpine scenery, ocean, forest and desert landscapes. Suggestions use local keyword matching on the trip title and destinations; NYC and New York select the skyline suggestion. This is a curated catalog, not live internet image search, and unknown destinations show the full preset selection. No new API keys or subscriptions are needed.

The picker previews selection and vertical framing before Save cover. Cancel leaves the original unchanged. Only the preset ID and crop position are stored on the trip. Existing trips keep their Tokyo cover until explicitly changed. This uses the existing IndexedDB, mutation queue and owner-only server trip-update permissions; no schema migration is required. Live collaborator verification remains deferred at the user's request.

Photos load directly from images.unsplash.com with no referrer and without transmitting trip names. They require internet and are not precached. If an image fails, a matching gradient remains. The selected preset and framing remain usable offline. The native slider and labeled buttons support keyboard input. The picker uses two columns at phone widths and three on desktop.

Images use the Unsplash license: https://unsplash.com/license. Source attribution is shown in the picker. No Google place imagery, arbitrary remote URL input, uploads, AI image generation or photo-search API is involved.

Verification includes local keyword matches and unknown destinations, cancel behavior, saving selected presets and crop positions to real IndexedDB, reopening saved settings, and a browser reload after selecting the NYC preset. Landscape and city images were visually inspected in the demo. Private production trips were not altered.
