import { useEffect, useState } from "react";
import type { Entity, Entry } from "./model";
import { api, demo, save } from "./store";
import { travel, entryBounds } from "./schedule";
import { Button, Notice, useAsyncAction } from "./ui";

export default function TravelLeg({
  previous,
  entry,
  mode,
  canEdit,
}: {
  previous: Entity<Entry>;
  entry: Entity<Entry>;
  mode: string;
  canEdit: boolean;
}) {
  const arrival =
    entry.data.arrival?.fromId === previous.id ? entry.data.arrival : undefined;
  const selectedMode = arrival?.mode || mode;
  const [manual, setManual] = useState(String(arrival?.manualMinutes ?? 15));
  const [live, setLive] = useState<{
    minutes: number;
    key: string;
    warnings: string[];
  }>();
  const a = useAsyncAction();
  const key = JSON.stringify([previous.data, entry.data, selectedMode]);
  const manualTime = arrival?.manualMinutes;
  const estimate = live?.key === key ? live : undefined;
  const rough = travel(previous.data, entry.data, selectedMode);
  const duration = manualTime ?? estimate?.minutes ?? rough;
  let gap = Infinity;
  try {
    if ((previous.data.endDate || previous.data.date) <= entry.data.date)
      gap =
        (entryBounds(entry.data).start - entryBounds(previous.data).end) /
        60000;
  } catch {
    /* Schedule warnings handle invalid times. */
  }
  useEffect(() => {
    setManual(String(arrival?.manualMinutes ?? 15));
  }, [arrival?.manualMinutes]);
  async function update(next: Entry["arrival"]) {
    if (
      next?.manualMinutes !== undefined &&
      (!Number.isInteger(next.manualMinutes) ||
        next.manualMinutes < 0 ||
        next.manualMinutes > 10080)
    )
      throw Error("Enter 0–10080 whole minutes.");
    await save({ ...entry, data: { ...entry.data, arrival: next } });
  }
  return (
    <section
      className="travel-leg"
      aria-label={`Travel from ${previous.data.title} to ${entry.data.title}`}
    >
      <div className="travel-controls">
        <label>
          Travel to {entry.data.title}
          <select
            aria-label={`Travel method to ${entry.data.title}`}
            value={selectedMode}
            disabled={!canEdit || a.busy}
            onChange={(e) =>
              a.run(() => update({ fromId: previous.id, mode: e.target.value }))
            }
          >
            <option value="WALK">Walking</option>
            <option value="DRIVE">Driving</option>
            <option value="BICYCLE">Cycling</option>
            <option value="TRANSIT">Public transit</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={manualTime !== undefined}
            disabled={!canEdit || a.busy}
            onChange={(e) =>
              a.run(() =>
                update({
                  fromId: previous.id,
                  mode: selectedMode,
                  ...(e.target.checked
                    ? { manualMinutes: Number(manual) }
                    : {}),
                }),
              )
            }
          />
          Set time manually
        </label>
        {manualTime !== undefined ? (
          <form
            className="travel-manual"
            onSubmit={(e) => {
              e.preventDefault();
              a.run(async () => {
                const n = Number(manual);
                if (!Number.isInteger(n) || n < 0 || n > 10080)
                  throw Error("Enter 0–10080 whole minutes.");
                await update({
                  fromId: previous.id,
                  mode: selectedMode,
                  manualMinutes: n,
                });
              });
            }}
          >
            <label>
              Travel minutes
              <input
                aria-label={`Travel minutes to ${entry.data.title}`}
                type="number"
                min="0"
                max="10080"
                required
                value={manual}
                disabled={!canEdit}
                onChange={(e) => setManual(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={!canEdit || a.busy}>
              Save time
            </Button>
          </form>
        ) : (
          <Button
            disabled={a.busy || demo || !navigator.onLine}
            onClick={() =>
              a.run(async () => {
                const point = (e: Entry) => ({
                  placeId: e.placeId,
                  lat: e.lat,
                  lng: e.lng,
                });
                if (
                  ![previous.data, entry.data].every(
                    (e) => e.placeId || (e.lat != null && e.lng != null),
                  )
                )
                  throw Error(
                    "Choose a Google place or add coordinates for both activities, or enter travel time manually.",
                  );
                const departure = new Date(
                  entryBounds(previous.data).end,
                ).toISOString();
                const r = await api("route", entry.tripId, {
                  origin: point(previous.data),
                  destination: point(entry.data),
                  mode: selectedMode,
                  departure,
                });
                if (!Number.isFinite(r.minutes) || r.minutes < 0)
                  throw Error("Route unavailable. Enter travel time manually.");
                setLive({
                  minutes: r.minutes,
                  key,
                  warnings: r.warnings || [],
                });
              })
            }
          >
            {a.busy ? "Calculating…" : "Calculate travel time"}
          </Button>
        )}
      </div>
      <small role="status">
        {Number.isFinite(duration)
          ? `${duration} min · ${manualTime !== undefined ? "manual time" : estimate ? "Google Maps estimate · live, not saved" : "rough straight-line estimate"}`
          : "No estimate yet · calculate or set a manual time"}
      </small>
      {!estimate && manualTime === undefined && (
        <small>
          Live calculations require internet. Rough estimates exclude roads,
          traffic and timetables.
        </small>
      )}
      {Number.isFinite(duration) && gap < duration && (
        <Notice>
          Insufficient travel time before {entry.data.title}: allow {duration}{" "}
          minutes.
        </Notice>
      )}
      {estimate?.warnings.map((w) => (
        <small key={w}>{w}</small>
      ))}
      {a.error && (
        <Notice tone="error">
          {a.error} You can set a manual time instead.
        </Notice>
      )}
    </section>
  );
}
