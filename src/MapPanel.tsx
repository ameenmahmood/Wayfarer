import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, ExternalLink, RefreshCw } from "lucide-react";
import type { Entity, Entry } from "./model";
import { api, demo } from "./store";
import { Notice, Button } from "./ui";
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
  selected,
  onSelect,
  tripId,
  mode = "WALK",
}: {
  entries: Entity<Entry>[];
  selected: string;
  onSelect: (id: string) => void;
  tripId: string;
  mode?: string;
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
  const locationKey = JSON.stringify(
    entries.map((e) => [e.id, e.data.placeId, e.data.lat, e.data.lng]),
  );
  const [mapVersion, setMapVersion] = useState(0);
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const configured = !demo && !!import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  const located = entries.filter(
    (e) => (e.data.lat != null && e.data.lng != null) || e.data.placeId,
  );
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
    const bounds = new window.google.maps.LatLngBounds();
    async function draw() {
      const points: any[] = [];
      for (let i = 0; i < located.length; i++) {
        const e = located[i];
        let lat = e.data.lat,
          lng = e.data.lng;
        if (e.data.placeId && !demo) {
          try {
            const p = await api("place", tripId, { placeId: e.data.placeId });
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
        const position = { lat, lng };
        points.push({ id: e.id, position });
        const marker = new window.google.maps.Marker({
          position,
          map: map.current,
          label: String(i + 1),
          title: e.data.title,
          zIndex: e.id === selected ? 10 : 1,
        });
        marker.addListener("click", () => onSelectRef.current(e.id));
        markers.current.set(e.id, marker);
        bounds.extend(position);
      }
      if (points.length === 1) {
        map.current.setCenter(points[0].position);
        map.current.setZoom(15);
      } else if (points.length > 1) map.current.fitBounds(bounds, 50);
      if (points.length > 1 && !demo) {
        for (let i = 1; i < points.length; i++) {
          try {
            const route = await api("route", tripId, {
              origin: points[i - 1].position,
              destination: points[i].position,
              mode,
            });
            if (!active) return;
            setRouteWarnings((w) => [
              ...new Set([...w, ...(route.warnings || [])]),
            ]);
            if (route.polyline) {
              const path = new window.google.maps.Polyline({
                path: window.google.maps.geometry.encoding.decodePath(
                  route.polyline,
                ),
                strokeColor: "#467568",
                strokeWeight: 4,
                map: map.current,
              });
              paths.current.push(path);
            }
          } catch (err: any) {
            if (active) setError(err.message);
          }
        }
      }
    }
    void draw();
    return () => {
      active = false;
      markers.current.forEach((m) => m.setMap(null));
      paths.current.forEach((p) => p.setMap(null));
    };
  }, [ready, mapVersion, locationKey, mode, tripId]);
  useEffect(() => {
    const marker = markers.current.get(selected);
    if (marker && window.google?.maps) {
      marker.setAnimation(window.google.maps.Animation.BOUNCE);
      const timer = setTimeout(() => marker.setAnimation(null), 700);
      return () => clearTimeout(timer);
    }
  }, [selected]);
  useEffect(() => {
    for (const entry of entries)
      markers.current.get(entry.id)?.setTitle(entry.data.title);
  }, [entries.map((e) => `${e.id}:${e.data.title}`).join()]);
  return (
    <section className="map-card">
      <div className="section-head">
        <h3>Your day, on the map</h3>
        <MapPin size={18} />
      </div>
      {configured ? (
        <>
          <div ref={ref} className="google-map" />
          {!ready && !error && (
            <div className="notice">Loading live Google map…</div>
          )}
        </>
      ) : !tripId.startsWith("demo") ? (
        <div className="empty">
          <MapPin size={28} />
          <h3>Your places, ready to connect</h3>
          <p>
            Configure Google Maps for a live view. Keep adding addresses and
            coordinates to your itinerary offline.
          </p>
        </div>
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
