import { Temporal } from "@js-temporal/polyfill";
import type { Entry } from "./model";
export function instant(date: string, time: string, zone: string) {
  return Temporal.ZonedDateTime.from(`${date}T${time}[${zone}]`, {
    disambiguation: "reject",
  }).epochMilliseconds;
}
export function entryBounds(e: Entry) {
  const start = instant(e.date, e.start || "09:00", e.zone);
  const end = e.end
    ? instant(e.endDate || e.date, e.end, e.endZone || e.zone)
    : start + e.duration * 60000;
  if (end <= start) throw Error("End must be after start.");
  return { start, end };
}
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function time(n: number) {
  return `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function distance(a: Entry, b: Entry) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null)
    return null;
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  const x =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export type Matrix = Record<string, number>;
export function travel(a: Entry, b: Entry, mode: string, matrix?: Matrix) {
  const key = `${a.title}|${b.title}`;
  if (matrix) return matrix[key] ?? Infinity;
  const km = distance(a, b);
  return km === null
    ? Infinity
    : Math.ceil(
        (km /
          ({ WALK: 4.5, BICYCLE: 13, DRIVE: 25, TRANSIT: 18 }[mode] || 4.5)) *
          60 +
          3,
      );
}
export function warnings(
  entries: Entry[],
  mode = "WALK",
  matrix?: Matrix,
  legTime?: (a: Entry, b: Entry) => number,
) {
  const out: string[] = [];
  const list = entries
    .filter((e) => e.date && e.start)
    .sort((a, b) => entryBounds(a).start - entryBounds(b).start);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (
      e.opening &&
      (minutes(e.start) < e.opening.open ||
        minutes(e.start) + e.duration > e.opening.close)
    )
      out.push(`${e.title}: outside supplied opening hours.`);
    if (!e.opening)
      out.push(`${e.title}: opening hours unknown; verify before visiting.`);
    if (i) {
      const prev = list[i - 1],
        gap = (entryBounds(e).start - entryBounds(prev).end) / 60000;
      if (gap < 0) out.push(`${prev.title} overlaps ${e.title}.`);
      else {
        const t = legTime ? legTime(prev, e) : travel(prev, e, mode, matrix);
        if (t === Infinity)
          out.push(`Route unavailable: ${prev.title} → ${e.title}.`);
        else if (gap < t)
          out.push(
            `Insufficient travel time before ${e.title} (${t} min estimate).`,
          );
      }
    }
  }
  return out;
}
// Bounded insertion heuristic: insert flexible stops into feasible slots around immutable appointments.
export function optimize(
  entries: Entry[],
  departure: string,
  mode: string,
  matrix?: Matrix,
  startLocation?: Entry,
  endLocation?: Entry,
) {
  if (entries.length > 10) throw Error("Optimize up to 10 stops at a time.");
  const fixed = entries
    .filter((e) => e.fixed)
    .sort((a, b) => minutes(a.start) - minutes(b.start));
  let result = [...fixed];
  const flexible = entries.filter((e) => !e.fixed);
  const evaluate = (order: Entry[]) => {
    let cursor = minutes(departure),
      cost = 0,
      prev = startLocation;
    const scheduled: Entry[] = [];
    for (const e of order) {
      const t = prev ? travel(prev, e, mode, matrix) : 0;
      if (!Number.isFinite(t)) return null;
      cost += t;
      let begin = cursor + t;
      if (e.opening) begin = Math.max(begin, e.opening.open);
      if (e.fixed) {
        if (begin > minutes(e.start)) return null;
        begin = minutes(e.start);
      }
      if (
        begin + e.duration > 1440 ||
        (e.opening && begin + e.duration > e.opening.close)
      )
        return null;
      scheduled.push({
        ...e,
        start: time(begin),
        end: time(begin + e.duration),
      });
      cursor = begin + e.duration;
      prev = e;
    }
    if (prev && endLocation) {
      const t = travel(prev, endLocation, mode, matrix);
      if (!Number.isFinite(t) || cursor + t > 1440) return null;
      cost += t;
    }
    return { entries: scheduled, travel: cost };
  };
  for (const e of flexible) {
    let best: ReturnType<typeof evaluate> = null;
    for (let i = 0; i <= result.length; i++) {
      const order = [...result];
      order.splice(i, 0, e);
      const candidate = evaluate(order);
      if (candidate && (!best || candidate.travel < best.travel))
        best = candidate;
    }
    if (!best)
      return {
        entries: entries,
        travel: 0,
        savings: 0,
        conflicts: [
          `No feasible insertion for ${e.title}. Adjust departure, duration, opening hours or fixed reservations.`,
        ],
      };
    result = best.entries;
  }
  const proposed = evaluate(result);
  if (!proposed)
    return {
      entries,
      travel: 0,
      savings: 0,
      conflicts: ["Fixed reservations cannot be reached with these settings."],
    };
  const original = [...entries].sort((a, b) => a.order - b.order);
  let originalCost = 0,
    previous = startLocation;
  for (const e of original) {
    if (previous) originalCost += travel(previous, e, mode, matrix);
    previous = e;
  }
  if (previous && endLocation)
    originalCost += travel(previous, endLocation, mode, matrix);
  return {
    ...proposed,
    savings: Number.isFinite(originalCost) ? originalCost - proposed.travel : 0,
    conflicts: [],
  };
}

export function formatTime(value: string) {
  if (!value) return "Any time";
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Keep an explicit end consistent when a user changes the duration in the simple form.
export function entryWithDuration(entry: Entry, duration: number): Entry {
  const next = { ...entry, duration };
  if (
    entry.date &&
    entry.start &&
    entry.end &&
    Number.isInteger(duration) &&
    duration > 0
  ) {
    const end = Temporal.Instant.fromEpochMilliseconds(
      instant(entry.date, entry.start, entry.zone) + duration * 60000,
    ).toZonedDateTimeISO(entry.endZone || entry.zone);
    next.endDate = end.toPlainDate().toString();
    next.end = `${String(end.hour).padStart(2, "0")}:${String(end.minute).padStart(2, "0")}`;
  }
  return next;
}
