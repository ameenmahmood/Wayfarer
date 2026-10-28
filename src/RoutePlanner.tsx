import TimeInput from "./TimeInput";
import { useState } from "react";
import { ArrowRight, Route, Check } from "lucide-react";
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
}: {
  entries: Entity<Entry>[];
  trip: Trip;
  date: string;
  tripId: string;
  onDone: () => void;
}) {
  const [departure, setDeparture] = useState("09:00"),
    [mode, setMode] = useState("WALK"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [proposal, setProposal] = useState<ReturnType<typeof optimize>>(),
    [source, setSource] = useState(""),
    a = useAsyncAction();
  const candidates = entries.filter(
    (e) =>
      e.data.date === date &&
      e.data.endDate <= date &&
      e.data.type !== "Lodging",
  );
  async function preview() {
    setProposal(undefined);
    if (
      candidates.some(
        (e) =>
          e.data.zone !== trip.zone ||
          (e.data.endZone && e.data.endZone !== trip.zone),
      )
    )
      throw Error(
        "Optimize stops in the trip default time zone only. Cross-zone entries remain visible in the itinerary; review those legs separately.",
      );
    if (new Set(candidates.map((e) => e.data.title)).size !== candidates.length)
      throw Error("Give each route stop a unique title before optimizing.");
    let matrix: Matrix | undefined;
    const working = candidates.map((e) => ({ ...e.data }));
    const unavailableHours: string[] = [];
    if (!demo) {
      const points = [
        ...candidates,
        ...[start, end]
          .filter(Boolean)
          .map((id) => entries.find((e) => e.id === id)!),
      ].filter((e, i, ar) => ar.findIndex((x) => x.id === e.id) === i);
      const r = await api("matrix", tripId, {
        points: points.map((e) => ({
          title: e.data.title,
          placeId: e.data.placeId,
          lat: e.data.lat,
          lng: e.data.lng,
        })),
        mode,
        departure: new Date(instant(date, departure, trip.zone)).toISOString(),
      });
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
      setSource(
        "Google Maps · live route estimates. Regular opening hours are estimates; holidays may differ." +
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
      <p>
        Preview a feasible order for up to 10 single-day stops. Fixed times and
        supplied opening hours are respected. Hotel stays remain in the
        itinerary.
      </p>
      <div className="form-grid">
        <Field label="Departure time">
          <TimeInput
            label="Departure time"

            required
            value={departure}
            onChange={(value) => {
              setDeparture(value);
              setProposal(undefined);
            }}
          />
        </Field>
        <Field label="Transport">
          <select
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
              value={value as string}
              onChange={(e) => {
                (setter as any)(e.target.value);
                setProposal(undefined);
              }}
            >
              <option value="">No preference</option>
              {entries
                .filter((e) => e.data.lat != null || e.data.placeId)
                .map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.data.title}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>
      <Notice>
        Bounded insertion heuristic; it does not guarantee a mathematical
        optimum. Missing opening hours remain unverified. Transit estimates use
        one departure snapshot, so recheck each leg before travel.
      </Notice>
      <Button
        className="primary"
        disabled={a.busy || !candidates.length || !departure}
        onClick={() => a.run(preview)}
      >
        <Route size={16} />
        {a.busy ? "Calculating…" : "Preview route"}
      </Button>
      {a.error && <Notice tone="error">{a.error}</Notice>}
      {proposal && (
        <div className="proposal">
          {!demo && (
            <div className="google-attribution" translate="no">
              Google Maps
            </div>
          )}
          <small>{source}</small>
          <h3>
            {proposal.conflicts.length
              ? "This plan needs an adjustment"
              : `${proposal.travel} min estimated travel`}
          </h3>
          {!proposal.conflicts.length && (
            <p>
              {proposal.savings >= 0
                ? `${proposal.savings} min estimated savings`
                : `${-proposal.savings} min additional travel to respect scheduling constraints`}
              . Original itinerary is unchanged.
            </p>
          )}
          {proposal.conflicts.map((c) => (
            <Notice key={c} tone="error">
              {c}
            </Notice>
          ))}
          {proposal.entries.map((e, i) => (
            <div className="proposal-stop" key={e.title}>
              <span>{i + 1}</span>
              <b>{formatTime(e.start)}</b>
              <ArrowRight size={14} />
              {e.title}
              {e.fixed && <small>Fixed</small>}
            </div>
          ))}
          {!proposal.conflicts.length && (
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
          )}
        </div>
      )}
    </div>
  );
}
