import { useEffect, useState, useId } from "react";
import { Temporal } from "@js-temporal/polyfill";
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
import {
  travel,
  entryBounds,
  formatTravelDuration,
  formatTime,
} from "./schedule";
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
  const duringStay =
    (previous.data.endDate || previous.data.date) > entry.data.date;
  let gap = Infinity;
  let departureLabel = "";
  let arrivalLabel = "";
  try {
    // A stay's checkout is not the departure for outings during that stay.
    if (
      previous.data.start &&
      (previous.data.endDate || previous.data.date) <= entry.data.date
    ) {
      const departure = entryBounds(previous.data).end;
      const label = (epoch: number, zone: string) => {
        const local =
          Temporal.Instant.fromEpochMilliseconds(epoch).toZonedDateTimeISO(
            zone,
          );
        const clock = formatTime(
          `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,
        );
        return local.toPlainDate().toString() === previous.data.date
          ? clock
          : `${local.month}/${local.day} · ${clock}`;
      };
      departureLabel = label(
        departure,
        previous.data.endZone || previous.data.zone,
      );
      if (Number.isFinite(duration))
        arrivalLabel = label(
          departure + Math.ceil(duration) * 60000,
          entry.data.zone,
        );
      if (entry.data.start)
        gap = (entryBounds(entry.data).start - departure) / 60000;
    }
  } catch {
    // Unknown or invalid departure times must not produce a made-up arrival.
    departureLabel = "";
    arrivalLabel = "";
  }
  const conflict = Number.isFinite(duration) && gap < duration;
  const journeyLabel =
    (
      {
        DRIVE: "Drive",
        WALK: "Walk",
        BICYCLE: "Cycle",
        TRANSIT: "Transit",
      } as Record<string, string>
    )[selectedMode] || "Travel";
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
        aria-label={`${modeLabel} to ${entry.data.title} · travel settings`}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((v) => !v)}
      >
        <LegIcon className="travel-block-icon" size={15} />
        <span className="travel-block-title">
          {journeyLabel} ·{" "}
          {Number.isFinite(duration)
            ? `${manualTime === undefined && !estimate ? "~" : ""}${formatTravelDuration(duration)}`
            : "Set time"}
          {Number.isFinite(duration) && (
            <small>
              {" "}
              ·{" "}
              {manualTime !== undefined
                ? "manual"
                : estimate
                  ? "Google Maps"
                  : "rough"}
            </small>
          )}
        </span>
        <ChevronDown className="travel-summary-chevron" size={16} />
        <span className="travel-block-times">
          {departureLabel ? (
            <>
              {departureLabel} <span aria-hidden="true">→</span>{" "}
              {arrivalLabel || "Arrival not calculated"}
            </>
          ) : duringStay ? (
            "Departure varies during stay"
          ) : (
            "Departure time needed"
          )}
        </span>
        {conflict && (
          <span className="travel-block-conflict">
            <TriangleAlert size={14} aria-hidden="true" />
            {formatTravelDuration(Math.ceil(duration - gap))} late
          </span>
        )}
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
        {conflict && (
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
