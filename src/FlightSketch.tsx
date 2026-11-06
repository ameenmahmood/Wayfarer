import type { Entity, Entry } from "./model";
import { flightGroundPairs, type FlightConnection } from "./flights";
export default function FlightSketch({
  entries,
  flights,
  focused,
  fitMode,
  localIds,
  onSelect,
}: {
  entries: Entity<Entry>[];
  flights: FlightConnection[];
  focused?: FlightConnection;
  fitMode: "all" | "flight" | "local";
  localIds: string[];
  onSelect: (id: string) => void;
}) {
  const points = entries.filter(
    (entry) =>
      Number.isFinite(entry.data.lat) && Number.isFinite(entry.data.lng),
  );
  const fitIds =
    fitMode === "flight" && focused
      ? [focused.from.id, focused.to.id]
      : fitMode === "local"
        ? localIds
        : points.map((entry) => entry.id);
  const domain = points.filter((entry) => fitIds.includes(entry.id));
  if (!domain.length)
    return (
      <p className="flight-map-note">
        Add both airport coordinates to preview a flight in the local demo.
        Connected mode resolves linked Google places live.
      </p>
    );
  const minLat = Math.min(...domain.map((entry) => entry.data.lat!)),
    maxLat = Math.max(...domain.map((entry) => entry.data.lat!));
  const minLng = Math.min(...domain.map((entry) => entry.data.lng!)),
    maxLng = Math.max(...domain.map((entry) => entry.data.lng!));
  const xy = (entry: Entity<Entry>) => ({
    x: 40 + ((entry.data.lng! - minLng) / Math.max(maxLng - minLng, 0.1)) * 360,
    y:
      260 - ((entry.data.lat! - minLat) / Math.max(maxLat - minLat, 0.1)) * 210,
  });
  const byId = new Map(points.map((entry) => [entry.id, entry]));
  return (
    <div className="sketch flight-sketch">
      <svg
        viewBox="0 0 440 310"
        role="img"
        aria-label="Illustrative flight and ground connections, not a navigational map"
      >
        <rect width="440" height="310" fill="var(--surface)" />
        {[80, 160, 240, 320, 400].map((x) => (
          <path key={x} d={`M${x} 0V310`} stroke="var(--border)" />
        ))}
        {[60, 120, 180, 240, 300].map((y) => (
          <path key={y} d={`M0 ${y}H440`} stroke="var(--border)" />
        ))}
        {fitMode !== "local" &&
          flights.map((flight) => {
            if (!byId.has(flight.from.id) || !byId.has(flight.to.id))
              return null;
            const a = xy(flight.from),
              b = xy(flight.to);
            return (
              <path
                key={flight.from.id}
                d={`M${a.x} ${a.y} Q${(a.x + b.x) / 2 + 35} ${(a.y + b.y) / 2 - 20} ${b.x} ${b.y}`}
                fill="none"
                stroke="#79b8de"
                strokeWidth="3"
                strokeDasharray="6 6"
              />
            );
          })}
        {flightGroundPairs(entries).map(
          ({ from, to }) =>
            byId.has(from.id) &&
            byId.has(to.id) && (
              <path
                key={`${from.id}-${to.id}`}
                d={`M${xy(from).x} ${xy(from).y}L${xy(to).x} ${xy(to).y}`}
                stroke="#467568"
                strokeWidth="3"
              />
            ),
        )}
        {points.map((entry) => {
          const p = xy(entry);
          return (
            <g
              key={entry.id}
              tabIndex={0}
              role="button"
              aria-label={`Select ${entry.data.title}`}
              onClick={() => onSelect(entry.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(entry.id);
                }
              }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r="8"
                fill="#467568"
                stroke="white"
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={p.y + 22}
                textAnchor="middle"
                fill="var(--text)"
                fontSize="11"
              >
                {entry.data.title.length > 24
                  ? entry.data.title.slice(0, 24) + "…"
                  : entry.data.title}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="sketch-label">
        Illustrative connections · not for navigation
      </span>
    </div>
  );
}
