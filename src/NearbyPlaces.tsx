import { useState } from "react";
import {
  Search,
  Coffee,
  Utensils,
  MapPin,
  Trees,
  Landmark,
  LoaderCircle,
  ExternalLink,
} from "lucide-react";
import { api, demo } from "./store";
import { days, type Entity, type Entry, type Trip } from "./model";
import { Button, Field, Notice, useAsyncAction } from "./ui";
const categories = [
  ["cafe", "Coffee & cafés", Coffee],
  ["restaurant", "Restaurants", Utensils],
  ["tourist_attraction", "Attractions", MapPin],
  ["park", "Parks", Trees],
  ["museum", "Museums", Landmark],
] as const;
type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  attributions?: { provider: string; providerUri?: string }[];
};
export default function NearbyPlaces({
  trip,
  tripId,
  entries,
  selected,
  date,
  canEdit,
  onPick,
}: {
  trip: Trip;
  tripId: string;
  entries: Entity<Entry>[];
  selected: string;
  date: string;
  canEdit: boolean;
  onPick: (placeId: string, date: string, type: string) => void;
}) {
  const anchors = entries.filter(
    (e) => e.data.placeId || (e.data.lat != null && e.data.lng != null),
  );
  const [anchor, setAnchor] = useState(
      anchors.some((e) => e.id === selected) ? selected : "",
    ),
    [location, setLocation] = useState(trip.destinations),
    [category, setCategory] = useState("cafe"),
    [radius, setRadius] = useState(1),
    [targetDate, setTargetDate] = useState(date),
    [places, setPlaces] = useState<Place[]>([]),
    [searched, setSearched] = useState(false),
    [centerLabel, setCenterLabel] = useState("");
  const a = useAsyncAction();
  function reset() {
    setPlaces([]);
    setSearched(false);
    a.setError("");
  }
  const entryType =
    category === "restaurant" || category === "cafe"
      ? "Restaurant"
      : "Attraction";
  return (
    <div className="nearby-places">
      <p>
        Find something worth stopping for. Choose where to look, then browse a
        category.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          a.run(async () => {
            reset();
            const activity = anchors.find((e) => e.id === anchor);
            const r = await api("nearby", tripId, {
              category,
              radius: Math.round(radius * 1609.344),
              ...(activity
                ? {
                    anchor: {
                      placeId: activity.data.placeId,
                      lat: activity.data.lat,
                      lng: activity.data.lng,
                    },
                  }
                : { location: location.trim() }),
            });
            if (!Array.isArray(r.places))
              throw Error("Places could not be loaded. Please retry.");
            setPlaces(r.places);
            setCenterLabel(r.centerLabel || location);
            setSearched(true);
          });
        }}
      >
        <fieldset disabled={a.busy} className="nearby-fields">
          <Field label="Search around">
            <select
              value={anchor}
              onChange={(e) => {
                setAnchor(e.target.value);
                reset();
              }}
            >
              <option value="">A city, neighborhood or address</option>
              {anchors.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.data.title}
                </option>
              ))}
            </select>
          </Field>
          {!anchor && (
            <Field label="Location">
              <input
                required
                minLength={2}
                maxLength={200}
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  reset();
                }}
                placeholder="Try Midtown Manhattan or Central Park"
              />
            </Field>
          )}
          <div
            className="nearby-categories"
            role="group"
            aria-label="Place category"
          >
            {categories.map(([id, label, Icon]) => (
              <button
                type="button"
                key={id}
                aria-pressed={category === id}
                onClick={() => {
                  setCategory(id);
                  reset();
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <div className="nearby-search-row">
            <Field label="Search radius">
              <select
                value={radius}
                onChange={(e) => {
                  setRadius(Number(e.target.value));
                  reset();
                }}
              >
                <option value={0.5}>0.5 miles</option>
                <option value={1}>1 mile</option>
                <option value={2}>2 miles</option>
                <option value={3}>3 miles</option>
                <option value={5}>5 miles</option>
              </select>
            </Field>
            <Button
              type="submit"
              className="primary"
              disabled={demo || a.busy || !navigator.onLine}
            >
              {a.busy ? (
                <>
                  <LoaderCircle size={16} className="spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Search size={16} />
                  Search nearby
                </>
              )}
            </Button>
          </div>
        </fieldset>
      </form>
      {demo && (
        <Notice>
          Nearby search requires a signed-in account and configured Google
          Places. This demo does not show simulated search results.
        </Notice>
      )}
      {!navigator.onLine && (
        <Notice>
          Reconnect to search Google Places. Previously saved plans remain
          available offline.
        </Notice>
      )}
      {a.busy && <p role="status">Looking for nearby places…</p>}
      {a.error && <Notice tone="error">{a.error}</Notice>}
      {searched && (
        <div className="nearby-result-heading">
          <span className="google-attribution" translate="no">
            Google Maps
          </span>
          <p>
            {places.length} places near {centerLabel} · within {radius}{" "}
            {radius === 1 ? "mile" : "miles"}
          </p>
          <small>
            Live results sorted by distance from the search center. Check
            current hours and availability before visiting.
          </small>
        </div>
      )}
      {searched && !places.length && (
        <Notice>
          No places found. Try another category, a wider radius or a different
          location.
        </Notice>
      )}
      {places.length > 0 && canEdit && (
        <Field label="Day for new activities">
          <select
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          >
            {days(trip.start, trip.end).map((d) => (
              <option key={d} value={d}>
                {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="nearby-results">
        {places.map((p) => {
          const existing = entries.some((e) => e.data.placeId === p.id);
          return (
            <section key={p.id} className="nearby-result">
              <h3>{p.displayName?.text || "Place"}</h3>
              <p>{p.formattedAddress}</p>
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName?.text || "Place")}&query_place_id=${encodeURIComponent(p.id)}`}
              >
                View on Google Maps <ExternalLink size={12} />
              </a>
              {(p.attributions || []).map((at, i) => (
                <small key={i}>
                  {at.providerUri?.startsWith("https://") ? (
                    <a href={at.providerUri} target="_blank" rel="noreferrer">
                      {at.provider}
                    </a>
                  ) : (
                    at.provider
                  )}
                </small>
              ))}
              {existing ? (
                <span className="pill">Already in your trip</span>
              ) : canEdit ? (
                <div className="nearby-result-actions">
                  <Button onClick={() => onPick(p.id, "", entryType)}>
                    Save for later
                  </Button>
                  <Button
                    className="primary"
                    onClick={() => onPick(p.id, targetDate, entryType)}
                  >
                    Add to day
                  </Button>
                </div>
              ) : (
                <small>Viewer access · ask an editor to add this place.</small>
              )}
            </section>
          );
        })}
      </div>
      <p className="nearby-note">
        Search results are fetched live and are not saved offline. Adding a
        place opens the activity form so you can give it your own name; only the
        place ID and your own plan details are retained.
      </p>
    </div>
  );
}
