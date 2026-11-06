import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Navigation,
  ExternalLink,
  RefreshCw,
  Plane,
} from "lucide-react";
import type { Entity, Entry } from "./model";
import { api, demo } from "./store";
import { Notice, Button } from "./ui";
import FlightSketch from "./FlightSketch";
import { flightConnections, flightGroundPairs, flightTiming } from "./flights";
declare global {
  interface Window {
    google: any;
    wayfarerMapsReady: () => void;
    gm_authFailure: () => void;
  }
}
let mapsPromise: Promise<void> | undefined;
function loadMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    const fail = (message: string) => {
      clearTimeout(timeout);
      mapsPromise = undefined;
      s.remove();
      reject(Error(message));
    };
    const timeout = setTimeout(
      () =>
        fail(
          "Google Maps took too long to load. Check your connection and try again.",
        ),
      15000,
    );
    window.wayfarerMapsReady = () => {
      clearTimeout(timeout);
      resolve();
    };
    s.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}&callback=wayfarerMapsReady&libraries=geometry&loading=async`;
    s.onerror = () =>
      fail(
        "Google Maps could not load. Check connectivity and key restrictions.",
      );
    document.head.appendChild(s);
  });
  return mapsPromise;
}
export default function MapPanel({
  entries,
  contextEntries = entries,
  selected,
  onSelect,
  tripId,
  mode = "WALK",
  expanded = false,
  lookupPlace,
}: {
  entries: Entity<Entry>[];
  contextEntries?: Entity<Entry>[];
  selected: string;
  onSelect: (id: string) => void;
  tripId: string;
  mode?: string;
  expanded?: boolean;
  lookupPlace?: (
    id: string,
  ) => Promise<{ location: { latitude: number; longitude: number } }>;
}) {
  const ref = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    markers = useRef(new Map<string, any>()),
    paths = useRef<any[]>([]),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [retry, setRetry] = useState(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const flights = flightConnections(entries, contextEntries);
  const mapEntries = [
    ...new Map(
      [
        ...entries,
        ...flights.flatMap((flight) => [flight.from, flight.to]),
      ].map((entry) => [entry.id, entry]),
    ).values(),
  ];
  const positions = useRef(new Map<string, { lat: number; lng: number }>());
  const [geometryReady, setGeometryReady] = useState(false);
  const [focusedFlightId, setFocusedFlightId] = useState("");
  const focusedFlight =
    flights.find((flight) => flight.from.id === focusedFlightId) || flights[0];
  const [fitMode, setFitMode] = useState<"all" | "flight" | "local">("all");
  const flightKey = flights
    .map((flight) => `${flight.from.id}:${flight.to.id}`)
    .join("|");
  useEffect(() => {
    const flight = flights.find(
      (flight) => flight.from.id === selected || flight.to.id === selected,
    );
    if (flight) setFocusedFlightId(flight.from.id);
  }, [selected, flightKey]);
  const locationKey = JSON.stringify(
    mapEntries.map((e) => [
      e.id,
      e.data.placeId,
      e.data.lat,
      e.data.lng,
      e.data.date,
      e.data.type,
      e.data.flight?.arrivalId,
      e.data.arrival?.fromId,
      e.data.arrival?.mode,
    ]),
  );
  const [mapVersion, setMapVersion] = useState(0);
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const configured = !demo && !!import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  const located = mapEntries.filter(
    (e) => (e.data.lat != null && e.data.lng != null) || e.data.placeId,
  );
  const localIds = focusedFlight
    ? mapEntries
        .filter(
          (entry) =>
            entry.data.date === focusedFlight.to.data.date &&
            !flights.some((flight) => flight.from.id === entry.id),
        )
        .map((entry) => entry.id)
    : [];
  function fitIds(ids: string[]) {
    const points = ids.flatMap((id) =>
      positions.current.has(id) ? [positions.current.get(id)!] : [],
    );
    if (!map.current || !window.google?.maps || !points.length) return;
    if (points.length === 1) {
      map.current.setCenter(points[0]);
      map.current.setZoom(14);
    } else {
      const bounds = new window.google.maps.LatLngBounds();
      points.forEach((point) => bounds.extend(point));
      map.current.fitBounds(bounds, 45);
    }
  }
  function fitFlight(id = focusedFlight?.from.id) {
    const flight = flights.find((flight) => flight.from.id === id);
    if (!flight) return;
    setFocusedFlightId(flight.from.id);
    setFitMode("flight");
    fitIds([flight.from.id, flight.to.id]);
    onSelectRef.current(
      entries.some((entry) => entry.id === flight.from.id)
        ? flight.from.id
        : flight.to.id,
    );
  }
  useEffect(() => {
    if (!configured || !navigator.onLine) return;
    setReady(false);
    setError("");
    window.gm_authFailure = () =>
      setError(
        "Google Maps authorization or billing failed. Check key restrictions and enabled APIs. Your itinerary is still available.",
      );
    let canceled = false;
    loadMaps()
      .then(() => {
        if (canceled) return;
        map.current = new window.google.maps.Map(ref.current, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "cooperative",
          zoomControl: true,
        });
        setMapVersion((version) => version + 1);
        setReady(true);
      })
      .catch((e) => {
        if (!canceled) setError(e.message);
      });
    return () => {
      canceled = true;
    };
  }, [configured, retry]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    markers.current.forEach((m) => m.setMap(null));
    paths.current.forEach((p) => p.setMap(null));
    markers.current.clear();
    paths.current = [];
    setRouteWarnings([]);
    setGeometryReady(false);
    positions.current.clear();
    const bounds = new window.google.maps.LatLngBounds();
    async function draw() {
      const airportIds = new Set(
        flights.flatMap((flight) => [flight.from.id, flight.to.id]),
      );
      for (let i = 0; i < located.length; i++) {
        const e = located[i];
        let lat = e.data.lat,
          lng = e.data.lng;
        if (e.data.placeId && !demo) {
          try {
            const p = lookupPlace
              ? await lookupPlace(e.data.placeId)
              : await api("place", tripId, { placeId: e.data.placeId });
            lat = p.location.latitude;
            lng = p.location.longitude;
          } catch (err: any) {
            if (active) setError(err.message);
            continue;
          }
        }
        if (!active) return;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setError(
            "A place has no usable coordinates. Edit its location or try searching for it again.",
          );
          continue;
        }
        const position = { lat: lat!, lng: lng! };
        positions.current.set(e.id, position);
        const marker = new window.google.maps.Marker({
          position,
          map: map.current,
          label: airportIds.has(e.id)
            ? "✈"
            : String(entries.findIndex((entry) => entry.id === e.id) + 1),
          title: e.data.title,
          zIndex: e.id === selected ? 10 : 1,
        });
        marker.addListener("click", () =>
          onSelectRef.current(
            entries.some((entry) => entry.id === e.id)
              ? e.id
              : flights.find((flight) => flight.to.id === e.id)?.from.id ||
                  e.id,
          ),
        );
        markers.current.set(e.id, marker);
        bounds.extend(position);
      }
      const points = [...positions.current.values()];
      if (points.length === 1) {
        map.current.setCenter(points[0]);
        map.current.setZoom(15);
      } else if (points.length > 1) map.current.fitBounds(bounds, 50);
      for (const flight of flights) {
        const from = positions.current.get(flight.from.id),
          to = positions.current.get(flight.to.id);
        if (!from || !to) {
          setRouteWarnings((w) => [
            ...new Set([
              ...w,
              "Flight connection needs a map location on both airport stops.",
            ]),
          ]);
          continue;
        }
        const path = new window.google.maps.Polyline({
          path: [from, to],
          geodesic: true,
          strokeColor: "#79b8de",
          strokeOpacity: 0,
          strokeWeight: 3,
          icons: [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 1,
                strokeColor: "#79b8de",
                strokeWeight: 2,
                scale: 3,
              },
              offset: "0",
              repeat: "14px",
            },
          ],
          map: map.current,
          clickable: true,
        });
        path.addListener?.("click", () =>
          onSelectRef.current(
            entries.some((entry) => entry.id === flight.from.id)
              ? flight.from.id
              : flight.to.id,
          ),
        );
        paths.current.push(path);
      }
      setGeometryReady(true);
      if (!demo)
        for (const { from, to } of flightGroundPairs(entries)) {
          const origin = positions.current.get(from.id),
            destination = positions.current.get(to.id);
          if (!origin || !destination) continue;
          try {
            const leg = to.data.arrival;
            const route = await api("route", tripId, {
              origin,
              destination,
              mode: leg?.fromId === from.id ? leg.mode : mode,
            });
            if (!active) return;
            setRouteWarnings((w) => [
              ...new Set([...w, ...(route.warnings || [])]),
            ]);
            if (route.polyline)
              paths.current.push(
                new window.google.maps.Polyline({
                  path: window.google.maps.geometry.encoding.decodePath(
                    route.polyline,
                  ),
                  strokeColor: "#467568",
                  strokeWeight: 4,
                  map: map.current,
                }),
              );
          } catch (err: any) {
            if (active) setError(err.message);
          }
        }
    }
    void draw();
    return () => {
      active = false;
      markers.current.forEach((m) => m.setMap(null));
      paths.current.forEach((p) => p.setMap(null));
    };
  }, [ready, mapVersion, locationKey, mode, tripId, lookupPlace]);
  useEffect(() => {
    const marker = markers.current.get(selected);
    if (marker && window.google?.maps) {
      marker.setAnimation(window.google.maps.Animation.BOUNCE);
      const timer = setTimeout(() => marker.setAnimation(null), 700);
      return () => clearTimeout(timer);
    }
  }, [selected]);
  useEffect(() => {
    for (const entry of mapEntries)
      markers.current.get(entry.id)?.setTitle(entry.data.title);
  }, [mapEntries.map((e) => `${e.id}:${e.data.title}`).join()]);
  return (
    <section
      className={"map-card" + (expanded ? " expanded" : "")}
      aria-label="Trip locations map"
    >
      {!expanded && (
        <div className="section-head">
          <h3>Your day, on the map</h3>
          <MapPin size={18} />
        </div>
      )}
      {flights.length > 0 && (
        <div className="flight-map-tools" aria-label="Flight map controls">
          <div className="flight-map-chips">
            {flights.map((flight) => (
              <button
                key={flight.from.id}
                aria-pressed={focusedFlight?.from.id === flight.from.id}
                className={
                  focusedFlight?.from.id === flight.from.id ? "active" : ""
                }
                onClick={() => fitFlight(flight.from.id)}
              >
                <Plane size={14} />
                <span>
                  {flight.from.data.title}
                  {flight.from.data.flight?.number &&
                    ` · ${flight.from.data.flight.number}`}
                </span>
              </button>
            ))}
          </div>
          <div className="flight-fit-controls">
            <Button
              disabled={configured && !geometryReady}
              onClick={() => {
                setFitMode("all");
                fitIds(mapEntries.map((entry) => entry.id));
              }}
            >
              Fit all stops
            </Button>
            <Button
              disabled={configured && !geometryReady}
              onClick={() => fitFlight()}
            >
              Fit flight
            </Button>
            <Button
              disabled={configured && !geometryReady}
              onClick={() => {
                setFitMode("local");
                fitIds(localIds);
              }}
            >
              Fit local stops
            </Button>
          </div>
          {focusedFlight && <small>{flightTiming(focusedFlight)}</small>}
        </div>
      )}
      {entries.some(
        (entry) =>
          entry.data.type === "Flight" &&
          !flights.some((flight) => flight.from.id === entry.id),
      ) && (
        <p className="flight-map-note">
          Link the flight’s arrival-airport stop in Edit plan to show its
          connection. Flights don’t use road directions.
        </p>
      )}
      {configured ? (
        <>
          <div ref={ref} className="google-map" />
          {!ready && !error && navigator.onLine && (
            <div className="notice">Loading live Google map…</div>
          )}
        </>
      ) : !tripId.startsWith("demo") && !(demo && flights.length) ? (
        <div className="empty">
          <MapPin size={28} />
          <h3>Your places, ready to connect</h3>
          <p>
            Configure Google Maps for a live view. Keep adding addresses and
            coordinates to your itinerary offline.
          </p>
        </div>
      ) : flights.length ? (
        <FlightSketch
          entries={mapEntries}
          flights={flights}
          focused={focusedFlight}
          fitMode={fitMode}
          localIds={localIds}
          onSelect={(id) =>
            onSelectRef.current(
              entries.some((entry) => entry.id === id)
                ? id
                : focusedFlight?.from.id || id,
            )
          }
        />
      ) : (
        <div className="sketch">
          <svg
            viewBox="0 0 440 310"
            aria-label="Illustrative Tokyo area sketch, not a navigational map"
            role="img"
          >
            <defs>
              <pattern
                id="grid"
                width="44"
                height="37"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-12)"
              >
                <path
                  d="M 44 0 L 0 0 0 37"
                  fill="none"
                  stroke="var(--map-road)"
                  strokeWidth="8"
                />
              </pattern>
            </defs>
            <rect width="440" height="310" fill="var(--map-bg)" />
            <path
              d="M350 -20 Q280 70 348 155 T320 350"
              fill="none"
              stroke="var(--map-water)"
              strokeWidth="32"
            />
            <path
              d="M120 90 Q170 60 220 112 L242 190 156 205 105 160Z"
              fill="var(--map-park)"
            />
            <rect width="440" height="310" fill="url(#grid)" />
            <text x="61" y="67">
              SHINJUKU
            </text>
            <text x="180" y="224">
              SHIBUYA
            </text>
            <text x="277" y="128">
              CHIYODA
            </text>
            <text x="150" y="154" className="park-label">
              Gyoen garden
            </text>
            {located.slice(0, 8).map((e, i) => {
              const x = 80 + ((i * 97) % 290),
                y = 90 + ((i * 53) % 145);
              return (
                <g
                  key={e.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select ${e.data.title}`}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onSelect(e.id);
                    }
                  }}
                  onClick={() => onSelect(e.id)}
                  className="map-pin"
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={selected === e.id ? 19 : 15}
                    fill={selected === e.id ? "#bd724f" : "#467568"}
                    stroke="white"
                    strokeWidth="4"
                  />
                  <text
                    x={x}
                    y={y + 5}
                    textAnchor="middle"
                    fill="white"
                    style={{ fontSize: 13, fontWeight: 700 }}
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
          <span className="sketch-label">
            Illustrative area sketch · not for navigation
          </span>
        </div>
      )}
      {flights.length > 0 && (
        <div className="flight-map-legend">
          <span>
            <i className="flight-line-key" />
            Flight connection
          </span>
          <span>
            <i className="ground-line-key" />
            Ground route
          </span>
          <small>
            Planned airport connection, not an actual flight track. Scheduled
            times are entered by you.
          </small>
        </div>
      )}
      {routeWarnings.map((w) => (
        <Notice key={w}>{w}</Notice>
      ))}
      {configured && !navigator.onLine && (
        <Notice>
          Offline · live Google maps require internet. Saved itinerary details
          remain available.
        </Notice>
      )}
      {error && (
        <Notice tone="error">
          {error}
          <Button
            onClick={() => {
              setError("");
              setRetry(retry + 1);
            }}
          >
            <RefreshCw size={14} />
            Retry map
          </Button>
        </Notice>
      )}
      <div className="map-footer">
        <span className="small-icon">
          <Navigation size={15} />
          {configured
            ? "Live map · internet required"
            : "Live map is not configured"}
        </span>
        {located.length > 0 && (
          <a
            aria-label="Open Google Maps directions"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(located.at(-1)!.data.address || located.at(-1)!.data.title)}&travelmode=${({ WALK: "walking", DRIVE: "driving", BICYCLE: "bicycling", TRANSIT: "transit" } as any)[mode]}`}
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
      {!configured && (
        <p className="map-caption">
          Your saved places stay here offline. Live maps, directions, and place
          search need configured Google services.
        </p>
      )}
    </section>
  );
}
