import { useEffect, useRef, useState } from "react";
import { ArrowRight, LockKeyhole, Route } from "lucide-react";
import type { Entity, Entry } from "./model";
import { all, api, demo, saveBatch } from "./store";
import {
  adjustSchedule,
  scheduleCandidates,
  scheduleSnapshot,
  inDay,
  type LiveLeg,
} from "./adjustSchedule";
import { entryBounds, formatTime } from "./schedule";
import TimeInput from "./TimeInput";
import { Button, Field, Notice, useAsyncAction } from "./ui";
export default function ScheduleAdjustments({
  entries,
  date,
  anchorId,
  mode,
  canEdit,
  onDone,
}: {
  entries: Entity<Entry>[];
  date: string;
  anchorId?: string;
  mode: string;
  canEdit: boolean;
  onDone: () => void;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [snapshot, setSnapshot] = useState(entries);
  const candidates = scheduleCandidates(snapshot, date);
  const first = candidates.find((e) => e.id === anchorId) || candidates[0];
  const [anchor, setAnchor] = useState(first?.id || ""),
    [start, setStart] = useState(first?.data.start || "09:00"),
    [duration, setDuration] = useState(() => {
      try {
        return first
          ? Math.round(
              (entryBounds(first.data).end - entryBounds(first.data).start) /
                60000,
            )
          : 60;
      } catch {
        return first?.data.duration || 60;
      }
    }),
    [buffer, setBuffer] = useState(0),
    [closeGaps, setCloseGaps] = useState(false),
    [manual, setManual] = useState<Record<string, number>>({}),
    [live, setLive] = useState<Record<string, LiveLeg>>({}),
    [routeErrors, setRouteErrors] = useState<string[]>([]);
  const applying = useAsyncAction(),
    routing = useAsyncAction();
  const selected = candidates.find((e) => e.id === anchor),
    locked = !!(selected?.data.fixed || selected?.data.type === "Flight");
  const options = {
    date,
    anchorId: anchor,
    start,
    duration,
    buffer,
    closeGaps,
    manual,
    live,
    mode,
  };
  const preview = adjustSchedule(snapshot, options);
  const stale =
    scheduleSnapshot(snapshot, date) !== scheduleSnapshot(entries, date);
  function choose(id: string, source = candidates) {
    const e = source.find((e) => e.id === id);
    setAnchor(id);
    setStart(e?.data.start || "09:00");
    try {
      setDuration(
        e
          ? Math.round(
              (entryBounds(e.data).end - entryBounds(e.data).start) / 60000,
            )
          : 60,
      );
    } catch {
      setDuration(e?.data.duration || 60);
    }
    setLive({});
    setRouteErrors([]);
  }
  function refresh() {
    setSnapshot(entries);
    const fresh = scheduleCandidates(entries, date);
    choose(
      fresh.some((e) => e.id === anchor) ? anchor : fresh[0]?.id || "",
      fresh,
    );
    setManual({});
  }
  return (
    <div className="schedule-adjustments">
      <p>
        Keep this day's activity order and adjust flexible times. Preview every
        change before saving. Fixed reservations and flights stay locked.
      </p>
      <div className="form-grid">
        <Field label="Adjust from">
          <select
            disabled={routing.busy || applying.busy}
            value={anchor}
            onChange={(e) => choose(e.target.value)}
          >
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {e.data.title}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <Field label="Start time">
            {locked ? (
              <p className="schedule-locked">
                <LockKeyhole size={14} />
                {formatTime(selected?.data.start || "")} · fixed
              </p>
            ) : (
              <TimeInput
                label="Adjustment start"
                disabled={routing.busy || applying.busy}
                value={start}
                onChange={setStart}
                required
              />
            )}
          </Field>
        </div>
        <Field label="Activity duration · minutes">
          <input
            type="number"
            min="1"
            max="10080"
            value={duration}
            disabled={locked || routing.busy || applying.busy}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </Field>
        <Field label="Buffer per travel leg · minutes">
          <input
            type="number"
            min="0"
            max="240"
            value={buffer}
            disabled={routing.busy || applying.busy}
            onChange={(e) => setBuffer(Number(e.target.value))}
          />
        </Field>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={closeGaps}
          disabled={routing.busy || applying.busy}
          onChange={(e) => setCloseGaps(e.target.checked)}
        />
        Close gaps between flexible activities
      </label>
      <p className="schedule-help">
        By default, activities only move later. Closing gaps may move later
        activities earlier, while respecting supplied opening hours. Travel uses
        manual minutes first, then a fetched estimate, then a labeled rough
        estimate.
      </p>
      <Button
        disabled={
          demo || routing.busy || applying.busy || stale || !navigator.onLine
        }
        onClick={() =>
          routing.run(async () => {
            const fetched = { ...live },
              errors: string[] = [];
            let count = 0;
            for (const item of preview.rows) {
              if (!active.current) return;
              if (!item.fromId || !item.legKey) continue;
              const current = adjustSchedule(snapshot, {
                ...options,
                live: fetched,
              });
              const row = current.rows.find(
                (r) => r.original.id === item.original.id,
              )!;
              if (
                row.source === "manual" ||
                fetched[item.original.id]?.key === row.legKey
              )
                continue;
              if (count >= 10) {
                errors.push(
                  "Fetched up to 10 routes. Fetch again for remaining legs, or enter manual minutes.",
                );
                break;
              }
              const from = current.rows.find(
                  (r) => r.original.id === row.fromId,
                )!.proposed,
                to = row.original;
              if (
                ![from, to].every(
                  (e) =>
                    e.data.placeId ||
                    (e.data.lat != null && e.data.lng != null),
                )
              ) {
                errors.push(
                  `${to.data.title}: add a linked place or coordinates to both stops, or enter manual minutes.`,
                );
                continue;
              }
              count++;
              try {
                const point = (e: Entity<Entry>) => ({
                  placeId: e.data.placeId,
                  lat: e.data.lat,
                  lng: e.data.lng,
                });
                const transport =
                  to.data.arrival?.fromId === from.id
                    ? to.data.arrival.mode
                    : mode;
                const r = await api("route", to.tripId, {
                  origin: point(from),
                  destination: point(to),
                  mode: transport,
                  departure: new Date(entryBounds(from.data).end).toISOString(),
                });
                if (!Number.isInteger(r.minutes) || r.minutes < 0)
                  throw Error("Route unavailable.");
                fetched[to.id] = { minutes: r.minutes, key: row.legKey! };
                if (r.warnings?.length)
                  errors.push(
                    ...r.warnings.map((w: string) => `${to.data.title}: ${w}`),
                  );
              } catch (error) {
                errors.push(
                  `${to.data.title}: ${error instanceof Error ? error.message : "Route unavailable"}`,
                );
              }
            }
            setLive(fetched);
            setRouteErrors(errors);
          })
        }
      >
        <Route size={15} />
        {routing.busy ? "Fetching travel estimates…" : "Fetch travel estimates"}
      </Button>
      <small className="schedule-help">
        Live routes require internet and configured Google services. Estimates
        are not saved; transit schedules and traffic may change.
      </small>
      {routing.error && <Notice tone="error">{routing.error}</Notice>}
      {routeErrors.map((e, i) => (
        <Notice key={i}>{e}</Notice>
      ))}
      {stale && (
        <Notice tone="error">
          This day changed since the preview opened.{" "}
          <Button disabled={routing.busy || applying.busy} onClick={refresh}>
            Refresh preview
          </Button>
        </Notice>
      )}
      <h3>Before → after</h3>
      <div className="adjustment-rows">
        {preview.rows.map((row, i) => (
          <section
            key={row.original.id}
            className={`adjustment-row ${row.changed ? "is-changing" : ""}`}
          >
            {row.legKey && (
              <div className="adjustment-leg">
                <label>
                  Travel before {row.original.data.title}
                  <input
                    aria-label={`Manual travel before ${row.original.data.title}`}
                    type="number"
                    min="0"
                    max="10080"
                    placeholder={
                      row.minutes === undefined
                        ? "Enter minutes"
                        : String(row.minutes)
                    }
                    value={manual[row.original.id] ?? ""}
                    disabled={routing.busy || applying.busy}
                    onChange={(e) => {
                      const next = { ...manual };
                      if (e.target.value === "") delete next[row.original.id];
                      else next[row.original.id] = Number(e.target.value);
                      setManual(next);
                    }}
                  />
                </label>
                <small>
                  {row.minutes === undefined
                    ? "Travel time needed"
                    : `${row.minutes} min · ${row.source}`}
                  {buffer > 0 ? ` + ${buffer} min buffer` : ""}
                </small>
              </div>
            )}
            <div className="adjustment-title">
              <b>{row.original.data.title}</b>
              {(row.original.data.fixed ||
                row.original.data.type === "Flight") && (
                <span className="pill">
                  <LockKeyhole size={12} />
                  Fixed
                </span>
              )}
              {i < candidates.findIndex((e) => e.id === anchor) && (
                <small>Before adjustment</small>
              )}
            </div>
            <div className="adjustment-times">
              <span>
                {formatTime(row.original.data.start)} ·{" "}
                {row.original.data.duration} min
              </span>
              <ArrowRight size={14} />
              <strong>
                {formatTime(row.proposed.data.start)} ·{" "}
                {row.proposed.data.duration} min
              </strong>
              {!row.changed && <small>Unchanged</small>}
            </div>
          </section>
        ))}
      </div>
      {preview.conflicts.map((e, i) => (
        <Notice key={i} tone="error">
          {e}
        </Notice>
      ))}
      {preview.notes.length > 0 && (
        <details className="schedule-notes">
          <summary>Review notes ({preview.notes.length})</summary>
          {preview.notes.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </details>
      )}
      {applying.error && <Notice tone="error">{applying.error}</Notice>}
      <div className="dialog-actions schedule-actions">
        <Button onClick={onDone} disabled={applying.busy}>
          Cancel
        </Button>
        <Button
          className="primary"
          disabled={
            !canEdit ||
            stale ||
            !!preview.conflicts.length ||
            !preview.changes.length ||
            applying.busy ||
            routing.busy
          }
          onClick={() =>
            applying.run(async () => {
              const current = (await all()).filter((e) => e.kind === "entry");
              if (
                scheduleSnapshot(current, date) !==
                scheduleSnapshot(snapshot, date)
              )
                throw Error(
                  "This day changed. Close and reopen the preview before applying.",
                );
              await saveBatch(
                preview.changes,
                snapshot.filter((e) => inDay(e, date)),
                { tripId: snapshot[0].tripId, date },
              );
              onDone();
            })
          }
        >
          {applying.busy
            ? "Saving…"
            : `Apply ${preview.changes.length} ${preview.changes.length === 1 ? "change" : "changes"}`}
        </Button>
      </div>
    </div>
  );
}
