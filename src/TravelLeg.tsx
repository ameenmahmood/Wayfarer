import { useEffect, useState, useId } from "react";
import {
  Footprints,
  Car,
  Bike,
  TramFront,
  ChevronDown,
  TriangleAlert,
} from "lucide-react";
import type { Entity, Entry } from "./model";
import { api, demo, save } from "./store";
import { travel, entryBounds, formatTravelDuration } from "./schedule";
import { Button, Notice, useAsyncAction } from "./ui";

export default function TravelLeg({
  previous,
  entry,
  mode,
  canEdit,
  onScheduleChange,
}: {
  previous: Entity<Entry>;
  entry: Entity<Entry>;
  mode: string;
  canEdit: boolean;
  onScheduleChange?: () => void;
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
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const LegIcon =
    (
      {
        WALK: Footprints,
        DRIVE: Car,
        BICYCLE: Bike,
        TRANSIT: TramFront,
      } as const
    )[selectedMode as "WALK" | "DRIVE" | "BICYCLE" | "TRANSIT"] || Footprints;
  const modeLabel =
    (
      {
        WALK: "Walking",
        DRIVE: "Driving",
        BICYCLE: "Cycling",
        TRANSIT: "Transit",
      } as Record<string, string>
    )[selectedMode] || "Travel";
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
    onScheduleChange?.();
  }
  return (
    <section
      className="travel-leg"
      aria-label={`Travel from ${previous.data.title} to ${entry.data.title}`}
    >
      <button
        className="travel-summary"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((v) => !v)}
      >
        <LegIcon size={15} />
        <span>
          {modeLabel} ·{" "}
          {Number.isFinite(duration)
            ? `${manualTime === undefined && !estimate ? "~" : ""}${formatTravelDuration(duration)}${manualTime !== undefined ? " · manual" : " estimate"}`
            : "Set travel time"}
        </span>
        {Number.isFinite(duration) && gap < duration && (
          <TriangleAlert size={13} aria-label="Insufficient travel time" />
        )}
        <ChevronDown className="travel-summary-chevron" size={14} />
      </button>
      <div
        className={`travel-expanded ${expanded ? "open" : ""}`}
        id={detailsId}
      >
        <div className="travel-controls">
          <label>
            <span className="visually-hidden">
              Travel to {entry.data.title}
            </span>
            <select
              aria-label={`Travel method to ${entry.data.title}`}
              value={selectedMode}
              disabled={!canEdit || a.busy}
              onChange={(e) =>
                a.run(() =>
                  update({ fromId: previous.id, mode: e.target.value }),
                )
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
              aria-label="Set time manually"
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
            Manual time
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
                <span className="visually-hidden">Travel minutes</span>
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
              <Button
                type="submit"
                aria-label="Save time"
                disabled={!canEdit || a.busy}
              >
                Save
              </Button>
            </form>
          ) : (
            <Button
              aria-label="Calculate travel time"
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
                    throw Error(
                      "Route unavailable. Enter travel time manually.",
                    );
                  setLive({
                    minutes: r.minutes,
                    key,
                    warnings: r.warnings || [],
                  });
                })
              }
            >
              {a.busy ? "Calculating…" : "Calculate"}
            </Button>
          )}
        </div>
        <div className="travel-status">
          <small role="status">
            {Number.isFinite(duration)
              ? `${formatTravelDuration(duration)} · ${manualTime !== undefined ? "manual time" : estimate ? (selectedMode === "DRIVE" ? "Google Maps estimate · average traffic" : "Google Maps estimate · live, not saved") : "rough straight-line estimate"}`
              : "No estimate yet · calculate or set a manual time"}
          </small>
          {manualTime === undefined && (
            <details className="travel-help">
              <summary>About estimates</summary>
              <p>
                Live calculations require internet and are not saved. Rough
                estimates exclude roads, traffic and timetables. Choose a manual
                time to keep your own estimate offline.
              </p>
            </details>
          )}
        </div>
        {Number.isFinite(duration) && gap < duration && (
          <Notice>
            Insufficient travel time before {entry.data.title}: allow{" "}
            {formatTravelDuration(duration)}.
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
      </div>
    </section>
  );
}
