import TimeInput from "./TimeInput";
import { useEffect, useRef, useState } from "react";
import { Route, Check } from "lucide-react";
import type { Entity, Entry, Trip } from "./model";
import { api, demo, save } from "./store";
import { optimize, instant, formatTime, type Matrix } from "./schedule";
import { Field, Button, Notice, useAsyncAction } from "./ui";
export default function RoutePlanner({
  entries,
  trip,
  date,
  tripId,
  onDone,
  initialMode = "WALK",
  onEditEntry,
}: {
  entries: Entity<Entry>[];
  trip: Trip;
  date: string;
  tripId: string;
  onDone: () => void;
  initialMode?: string;
  onEditEntry?: (entry: Entity<Entry>) => void;
}) {
  const candidates = entries
    .filter(
      (e) =>
        e.data.date === date &&
        (e.data.endDate || e.data.date) === date &&
        e.data.type !== "Lodging",
    )
    .sort((a, b) => a.data.order - b.data.order);
  const initialDeparture =
    candidates
      .map((e) => e.data.start)
      .filter(Boolean)
      .sort()[0] || "09:00";
  const [departure, setDeparture] = useState(initialDeparture),
    [mode, setMode] = useState(initialMode),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [proposal, setProposal] = useState<ReturnType<typeof optimize>>(),
    [source, setSource] = useState(""),
    [unverifiedHours, setUnverifiedHours] = useState<string[]>([]),
    a = useAsyncAction();
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (proposal || a.error) {
      feedback.current?.scrollIntoView({ block: "nearest" });
      feedback.current?.focus({ preventScroll: true });
    }
  }, [proposal, a.error]);
  const hasLocation = (entry: Entity<Entry>) =>
    demo
      ? entry.data.lat != null && entry.data.lng != null
      : !!entry.data.placeId ||
        (entry.data.lat != null && entry.data.lng != null);
  const points = [
    ...candidates,
    ...[start, end]
      .filter(Boolean)
      .map((id) => entries.find((e) => e.id === id)!)
      .filter(Boolean),
  ].filter((e, i, all) => all.findIndex((other) => other.id === e.id) === i);
  const missingLocations = points.filter((e) => !hasLocation(e));
  async function preview() {
    setProposal(undefined);
    setUnverifiedHours([]);
    if (!candidates.length)
      throw Error(
        "No single-day stops to optimize. Add an activity to this day; lodging and multi-day entries stay unchanged.",
      );
    if (candidates.length > 10)
      throw Error(
        "This day has more than 10 stops. Optimize a day with up to 10 single-day stops.",
      );
    if (missingLocations.length)
      throw Error(
        "Add a map location before calculating: " +
          missingLocations.map((e) => e.data.title).join(", ") +
          ". Edit each plan and select a Google place or enter both coordinates under More details.",
      );
    if (
      candidates.some(
        (e) =>
          e.data.zone !== trip.zone ||
          (e.data.endZone && e.data.endZone !== trip.zone),
      )
    )
      throw Error(
        "These stops use different local-time settings and can’t be optimized together. Review those travel legs separately.",
      );
    if (new Set(points.map((e) => e.data.title)).size !== points.length)
      throw Error("Give each route stop a unique title before optimizing.");
    let matrix: Matrix | undefined;
    const working = candidates.map((e) => ({ ...e.data }));
    const unavailableHours: string[] = [];
    if (!demo) {
      const departureInstant = instant(date, departure, trip.zone);
      const daysAway = (departureInstant - Date.now()) / 86400000;
      if (mode === "TRANSIT" && (daysAway < -7 || daysAway > 100))
        throw Error(
          "Transit schedules are only available from 7 days ago to 100 days ahead. Choose a date in that range or another transport method.",
        );
      const r = await api("matrix", tripId, {
        points: points.map((e) => ({
          title: e.data.title,
          placeId: e.data.placeId,
          lat: e.data.lat,
          lng: e.data.lng,
        })),
        mode,
        departure: new Date(departureInstant).toISOString(),
      });
      if (
        !r?.matrix ||
        typeof r.matrix !== "object" ||
        Array.isArray(r.matrix) ||
        Object.values(r.matrix).some(
          (value) =>
            typeof value !== "number" || !Number.isFinite(value) || value < 0,
        )
      )
        throw Error(
          "Route estimates were incomplete or invalid. Retry the calculation; your itinerary is unchanged.",
        );
      matrix = r.matrix;
      const weekday = new Date(date + "T12:00:00Z").getUTCDay();
      for (let i = 0; i < candidates.length; i++) {
        const id = candidates[i].data.placeId;
        if (!id) continue;
        try {
          const details = await api("place", tripId, { placeId: id });
          const periods = details.regularOpeningHours?.periods;
          if (!periods) {
            unavailableHours.push(working[i].title);
            continue;
          }
          const windows = periods.filter((p: any) => p.open?.day === weekday);
          // Multiple breaks, overnight periods and holiday exceptions need manual review.
          if (windows.length === 1 && windows[0].close?.day === weekday) {
            const p = windows[0];
            working[i].opening = {
              open: (p.open.hour || 0) * 60 + (p.open.minute || 0),
              close: (p.close.hour || 0) * 60 + (p.close.minute || 0),
            };
          } else unavailableHours.push(working[i].title);
        } catch {
          unavailableHours.push(working[i].title);
        }
      }
      setUnverifiedHours(unavailableHours);
      setSource(
        (mode === "DRIVE"
          ? "Driving estimates use average traffic conditions. "
          : "") +
          "Regular opening hours are estimates; holidays may differ." +
          (unavailableHours.length
            ? " Hours unavailable/complex for: " +
              unavailableHours.join(", ") +
              ". Verify manually."
            : ""),
      );
    } else
      setSource(
        "LOCAL DEMO · straight-line distance / assumed speed, not live routes. No traffic, timetables or real road network.",
      );
    const result = optimize(
      working,
      departure,
      mode,
      matrix,
      entries.find((e) => e.id === start)?.data,
      entries.find((e) => e.id === end)?.data,
    );
    setProposal(result);
  }
  return (
    <div>
      <p className="route-intro">
        <b>
          {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </b>
        <span>
          {candidates.length} {candidates.length === 1 ? "stop" : "stops"}
        </span>
      </p>
      {missingLocations.length > 0 && (
        <Notice>
          <b>Some stops need a map location.</b>
          <ul className="route-location-list">
            {missingLocations.map((e) => (
              <li key={e.id}>
                <span>{e.data.title}</span>
                {onEditEntry && (
                  <Button onClick={() => onEditEntry(e)}>Add location</Button>
                )}
              </li>
            ))}
          </ul>
          {demo
            ? "Demo routes need both coordinates under More details."
            : "Select a Google place or enter both coordinates under More details. A title or typed address alone is not a map location."}
        </Notice>
      )}
      {!candidates.length && (
        <Notice>
          No single-day activities on this day. Lodging and multi-day plans stay
          unchanged.
        </Notice>
      )}
      <div className="form-grid">
        <Field label="Departure time">
          <TimeInput
            label="Departure time"

            required
            disabled={a.busy}
            value={departure}
            onChange={(value) => {
              setDeparture(value);
              setProposal(undefined);
            }}
          />
        </Field>
        <Field label="Transport">
          <select
            disabled={a.busy}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setProposal(undefined);
            }}
          >
            <option value="WALK">Walking</option>
            <option value="DRIVE">Driving</option>
            <option value="BICYCLE">Cycling</option>
            <option value="TRANSIT">Public transit</option>
          </select>
        </Field>
        {[
          ["Start location", start, setStart],
          ["End location", end, setEnd],
        ].map(([label, value, setter]) => (
          <Field key={label as string} label={label as string}>
            <select
              disabled={a.busy}
              value={value as string}
              onChange={(e) => {
                (setter as any)(e.target.value);
                setProposal(undefined);
              }}
            >
              <option value="">No preference</option>
              {entries
                .filter(
                  (e) =>
                    hasLocation(e) &&
                    !candidates.some((stop) => stop.id === e.id),
                )
                .map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.data.title}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>
      <details className="route-method-notes">
        <summary>How route planning works</summary>
        <p>
          Preview up to 10 single-day stops. Fixed reservations and supplied
          opening hours are respected; hotel stays remain unchanged. This
          bounded heuristic does not guarantee a mathematical optimum. Missing
          opening hours need checking. Transit estimates use one departure
          snapshot, so recheck before travel.
        </p>
      </details>
      <Button
        className="primary"
        disabled={a.busy || !candidates.length || !departure}
        onClick={() => a.run(preview)}
      >
        <Route size={16} />
        {a.busy ? "Calculating…" : "Preview route"}
      </Button>
      <div
        ref={feedback}
        tabIndex={-1}
        className="route-feedback"
        aria-label="Route calculation result"
      >
        {a.error && <Notice tone="error">{a.error}</Notice>}
        {proposal && (
          <div className="proposal">
            <div className="route-preview-heading">
              <h3>
                {proposal.conflicts.length
                  ? "This plan needs an adjustment"
                  : "Route preview"}
              </h3>
              {demo ? (
                <span className="route-demo-label">
                  Local demo · rough estimates
                </span>
              ) : (
                <span className="google-attribution" translate="no">
                  Google Maps
                </span>
              )}
            </div>
            {!proposal.conflicts.length && (
              <div className="route-preview-stats">
                <div>
                  <small>Estimated travel</small>
                  <strong>
                    {proposal.travel}
                    <span> min</span>
                  </strong>
                </div>
                <div>
                  <small>
                    {proposal.savings >= 0
                      ? "Estimated savings"
                      : "Additional travel"}
                  </small>
                  <strong>
                    {Math.abs(proposal.savings)}
                    <span> min</span>
                  </strong>
                </div>
              </div>
            )}
            <details className="route-estimate-notes">
              <summary>
                Estimate details{" "}
                {unverifiedHours.length > 0 && (
                  <span className="route-hours-label">
                    Hours unverified · {unverifiedHours.length}{" "}
                    {unverifiedHours.length === 1 ? "stop" : "stops"}
                  </span>
                )}
              </summary>
              <p>{source}</p>
            </details>
            {proposal.conflicts.map((c) => (
              <Notice key={c} tone="error">
                {c}
              </Notice>
            ))}
            {!proposal.conflicts.length && (
              <ol className="route-stop-list" aria-label="Proposed stop order">
                {proposal.entries.map((e, i) => (
                  <li className="proposal-stop" key={e.title}>
                    <span className="proposal-index" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="proposal-place">
                      <b>{e.title}</b>
                      <small>
                        {e.duration} min{e.fixed && " · Fixed reservation"}
                      </small>
                    </div>
                    <time className="proposal-time">{formatTime(e.start)}</time>
                  </li>
                ))}
              </ol>
            )}
            {!proposal.conflicts.length && (
              <div className="route-apply">
                <p>Original itinerary is unchanged.</p>
                <Button
                  className="primary"
                  disabled={a.busy}
                  onClick={() =>
                    a.run(async () => {
                      for (let i = 0; i < proposal.entries.length; i++) {
                        const next = proposal.entries[i],
                          entity = candidates.find(
                            (e) => e.data.title === next.title,
                          );
                        if (entity)
                          await save({
                            ...entity,
                            data: {
                              ...next,
                              opening: entity.data.opening,
                              order: i,
                            },
                          });
                      }
                      onDone();
                    })
                  }
                >
                  <Check size={16} />
                  Accept proposed itinerary
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
