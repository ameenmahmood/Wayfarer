import type { Entity, Entry } from "./model";
import { entryBounds, formatTime, minutes } from "./schedule";
import { transportArrival, transportProblem } from "./transport";
import type { TransportEstimate } from "./transportRoutes";

export function activityTime(entry: Entry, estimate?: TransportEstimate) {
  if (!entry.start) return "Anytime";
  const start = formatTime(entry.start);
  if (entry.type !== "Transportation" || !estimate?.minutes) return start;
  try {
    return `${start}–${transportArrival(entry, estimate.minutes)}`;
  } catch {
    return start;
  }
}

export type ItineraryAlert = {
  id: string;
  entryId: string;
  title: string;
  detail: string;
  action: string;
};
/** Actionable problems only; missing optional opening hours are not an alert. */
export function itineraryAlerts(
  entries: Entity<Entry>[],
  context: Entity<Entry>[],
  estimates: Record<string, TransportEstimate>,
) {
  const alerts: ItineraryAlert[] = [];
  const timed: { entity: Entity<Entry>; start: number; end: number }[] = [];
  for (const entity of entries) {
    const e = entity.data,
      estimate = estimates[entity.id];
    if (e.type === "Transportation") {
      const problem = transportProblem(e, context);
      if (problem || estimate?.state === "error")
        alerts.push({
          id: `${entity.id}-transport`,
          entryId: entity.id,
          title: problem?.includes("destination")
            ? "Transport destination missing"
            : problem?.includes("pickup location")
              ? "Transport pickup missing"
              : problem
                ? "Transport needs details"
                : "Travel estimate unavailable",
          detail: `${e.title}: ${problem || estimate?.error}`,
          action: "Review transport",
        });
      if (!e.end && !estimate?.minutes) continue;
    }
    if (!e.date || !e.start) continue;
    try {
      const bounds = entryBounds(
        e.type === "Transportation" && !e.end && estimate?.minutes
          ? { ...e, duration: estimate.minutes }
          : e,
      );
      timed.push({ entity, ...bounds });
      if (
        e.opening &&
        (minutes(e.start) < e.opening.open ||
          minutes(e.start) + e.duration > e.opening.close)
      )
        alerts.push({
          id: `${entity.id}-hours`,
          entryId: entity.id,
          title: "Outside opening hours",
          detail: e.title,
          action: "Review time",
        });
    } catch {
      alerts.push({
        id: `${entity.id}-time`,
        entryId: entity.id,
        title: "Check activity time",
        detail: e.title,
        action: "Review time",
      });
    }
  }
  timed.sort((a, b) => a.start - b.start);
  for (let i = 0; i < timed.length; i++)
    for (
      let j = i + 1;
      j < timed.length && timed[j].start < timed[i].end;
      j++
    ) {
      const a = timed[i].entity,
        b = timed[j].entity;
      // A hotel stay spans other activities intentionally.
      if (a.data.type === "Lodging" || b.data.type === "Lodging") continue;
      alerts.push({
        id: `${a.id}-${b.id}-overlap`,
        entryId: b.id,
        title: "Activities overlap",
        detail: `${a.data.title} and ${b.data.title}`,
        action: "Review times",
      });
    }
  return alerts;
}
