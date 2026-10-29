import { Temporal } from "@js-temporal/polyfill";
import type { Entity, Entry } from "./model";
import { entryBounds, instant, travel } from "./schedule";
export type LiveLeg = { minutes: number; key: string };
export type AdjustmentOptions = {
  date: string;
  anchorId: string;
  start: string;
  duration: number;
  buffer: number;
  mode: string;
  closeGaps: boolean;
  manual: Record<string, number>;
  live: Record<string, LiveLeg>;
};
export type AdjustmentRow = {
  original: Entity<Entry>;
  proposed: Entity<Entry>;
  minutes?: number;
  source?: string;
  fromId?: string;
  legKey?: string;
  changed: boolean;
};
export function inDay(e: Entity<Entry>, date: string) {
  return !e.deleted && e.data.date === date;
}
export function scheduleSnapshot(entries: Entity<Entry>[], date: string) {
  return JSON.stringify(
    entries
      .filter((e) => inDay(e, date))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => [e.id, e.version, e.data]),
  );
}
export function scheduleCandidates(entries: Entity<Entry>[], date: string) {
  return entries
    .filter(
      (e) => inDay(e, date) && (!e.data.endDate || e.data.endDate === date),
    )
    .sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
}
export function legKey(from: Entity<Entry>, to: Entity<Entry>, mode: string) {
  return JSON.stringify([
    from.id,
    to.id,
    from.data.placeId,
    from.data.lat,
    from.data.lng,
    to.data.placeId,
    to.data.lat,
    to.data.lng,
    entryBounds(from.data).end,
    mode,
  ]);
}
function local(ms: number, zone: string) {
  const d = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone);
  return {
    date: d.toPlainDate().toString(),
    time: `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`,
  };
}
export function adjustSchedule(
  entries: Entity<Entry>[],
  options: AdjustmentOptions,
) {
  const list = scheduleCandidates(entries, options.date),
    anchorIndex = list.findIndex((e) => e.id === options.anchorId);
  const conflicts: string[] = [],
    notes: string[] = [],
    rows: AdjustmentRow[] = [];
  const excluded = entries.filter(
    (e) => inDay(e, options.date) && e.data.endDate > options.date,
  );
  if (excluded.length)
    notes.push(
      `Multi-day plans remain unchanged: ${excluded.map((e) => e.data.title).join(", ")}. Review their travel connections separately.`,
    );
  if (anchorIndex < 0)
    return {
      rows,
      changes: [] as Entity<Entry>[],
      conflicts: ["Choose a single-day activity to adjust."],
      notes,
    };
  if (list.length > 40)
    return {
      rows,
      changes: [] as Entity<Entry>[],
      conflicts: ["Adjust up to 40 single-day activities at once."],
      notes,
    };
  if (
    !Number.isInteger(options.buffer) ||
    options.buffer < 0 ||
    options.buffer > 240 ||
    !Number.isInteger(options.duration) ||
    options.duration < 1 ||
    options.duration > 10080
  )
    return {
      rows,
      changes: [] as Entity<Entry>[],
      conflicts: [
        "Use a duration of 1–10080 minutes and a travel buffer of 0–240 minutes.",
      ],
      notes,
    };
  let previous: Entity<Entry> | undefined;
  for (let i = 0; i < list.length; i++) {
    const original = list[i],
      e = original.data,
      locked = e.fixed || e.type === "Flight";
    let proposed = original,
      legMinutes: number | undefined,
      source: string | undefined,
      key: string | undefined;
    try {
      const originalBounds = entryBounds(e);
      if (!Number.isInteger(e.duration) || e.duration < 1)
        throw Error("Invalid activity duration.");
      let start = originalBounds.start,
        duration = (originalBounds.end - originalBounds.start) / 60000;
      let earliest: number | undefined;
      if (previous && i >= anchorIndex) {
        const saved = e.arrival?.fromId === previous.id ? e.arrival : undefined;
        const mode = saved?.mode || options.mode;
        key = legKey(previous, original, mode);
        const override = options.manual[original.id];
        if (override !== undefined || saved?.manualMinutes !== undefined) {
          legMinutes = override ?? saved!.manualMinutes;
          source = "manual";
        } else if (options.live[original.id]?.key === key) {
          legMinutes = options.live[original.id].minutes;
          source = "Google Maps estimate";
        } else {
          legMinutes = travel(previous.data, e, mode);
          source = "rough estimate";
        }
        if (
          !Number.isInteger(legMinutes) ||
          !Number.isFinite(legMinutes) ||
          legMinutes! < 0 ||
          legMinutes! > 10080
        ) {
          conflicts.push(
            `Travel time unavailable before ${e.title}. Enter minutes or fetch a route estimate.`,
          );
          legMinutes = undefined;
          source = "unknown";
        } else
          earliest =
            entryBounds(previous.data).end +
            (legMinutes! + options.buffer) * 60000;
      }
      if (i >= anchorIndex) {
        if (locked && !e.start)
          conflicts.push(`${e.title}: fixed reservations need a start time.`);
        if (i === anchorIndex && !locked) {
          start = instant(e.date, options.start, e.zone);
          duration = options.duration;
        } else if (!locked) {
          start =
            earliest === undefined
              ? originalBounds.start
              : options.closeGaps || !e.start
                ? earliest
                : Math.max(originalBounds.start, earliest);
        }
        if (!locked && i !== anchorIndex && e.opening)
          start = Math.max(
            start,
            instant(
              e.date,
              `${String(Math.floor(e.opening.open / 60)).padStart(2, "0")}:${String(e.opening.open % 60).padStart(2, "0")}`,
              e.zone,
            ),
          );
        if (earliest !== undefined && start < earliest)
          conflicts.push(
            `${e.title}: ${locked ? "fixed reservation" : "requested start"} cannot be reached in time (${legMinutes} min travel + ${options.buffer} min buffer).`,
          );
        const end = locked ? originalBounds.end : start + duration * 60000;
        const beginLocal = local(start, e.zone),
          endLocal = local(end, e.endZone || e.zone);
        if (
          beginLocal.date !== e.date ||
          endLocal.date !== (e.endDate || e.date)
        )
          conflicts.push(
            `${e.title}: adjustment crosses a local date boundary. Move it to another day manually.`,
          );
        if (e.opening) {
          const open = e.opening.open,
            close = e.opening.close;
          const begin = Temporal.Instant.fromEpochMilliseconds(
              start,
            ).toZonedDateTimeISO(e.zone),
            finish = Temporal.Instant.fromEpochMilliseconds(
              end,
            ).toZonedDateTimeISO(e.zone);
          if (
            open >= close ||
            begin.hour * 60 + begin.minute < open ||
            finish.hour * 60 + finish.minute > close ||
            finish.toPlainDate().toString() !== e.date
          )
            conflicts.push(
              `${e.title}: outside supplied opening hours. Review the activity or its hours.`,
            );
        } else
          notes.push(
            `${e.title}: opening hours unknown; verify before visiting.`,
          );
        let next = { ...e };
        if (
          !locked &&
          (start !== originalBounds.start ||
            duration !== (originalBounds.end - originalBounds.start) / 60000 ||
            !e.start)
        )
          next = {
            ...next,
            start: beginLocal.time,
            end: e.end ? endLocal.time : "",
            duration: Math.round(duration),
            endDate: e.endDate || e.date,
          };
        if (options.manual[original.id] !== undefined && previous)
          next.arrival = {
            fromId: previous.id,
            mode:
              e.arrival?.fromId === previous.id ? e.arrival.mode : options.mode,
            manualMinutes: options.manual[original.id],
          };
        proposed = { ...original, data: next };
      }
    } catch (error) {
      conflicts.push(
        `${e.title}: ${error instanceof Error ? error.message : "invalid local time"}`,
      );
    }
    rows.push({
      original,
      proposed,
      minutes: legMinutes,
      source,
      fromId: previous?.id,
      legKey: key,
      changed: JSON.stringify(original.data) !== JSON.stringify(proposed.data),
    });
    previous = proposed;
  }
  return {
    rows,
    changes: rows.filter((r) => r.changed).map((r) => r.proposed),
    conflicts: [...new Set(conflicts)],
    notes: [...new Set(notes)],
  };
}
