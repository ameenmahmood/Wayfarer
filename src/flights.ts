import type { Entity, Entry } from "./model";
import { formatTime, instant } from "./schedule";
export type FlightConnection = { from: Entity<Entry>; to: Entity<Entry> };
export function flightConnections(
  visible: Entity<Entry>[],
  context = visible,
): FlightConnection[] {
  const ids = new Set(visible.map((entry) => entry.id));
  return context
    .filter(
      (entry) =>
        !entry.deleted &&
        entry.data.type === "Flight" &&
        entry.data.flight?.arrivalId,
    )
    .flatMap((from) => {
      const to = context.find(
        (entry) =>
          !entry.deleted &&
          entry.id === from.data.flight?.arrivalId &&
          entry.id !== from.id &&
          entry.tripId === from.tripId,
      );
      return to && (ids.has(from.id) || ids.has(to.id)) ? [{ from, to }] : [];
    });
}
export function flightTiming({ from, to }: FlightConnection) {
  if (!from.data.date || !from.data.start || !to.data.date || !to.data.start)
    return "Add departure and arrival times";
  try {
    const duration = Math.round(
      (instant(to.data.date, to.data.start, to.data.zone) -
        instant(from.data.date, from.data.start, from.data.zone)) /
        60000,
    );
    if (duration <= 0) return "Check flight dates and times";
    const arrivalDate =
      from.data.date !== to.data.date ? `${to.data.date} · ` : "";
    return `${formatTime(from.data.start)} → ${arrivalDate}${formatTime(to.data.start)} · ${Math.floor(duration / 60)}h ${duration % 60}m scheduled`;
  } catch {
    return "Check flight dates and times";
  }
}
export function flightGroundPairs(entries: Entity<Entry>[]) {
  return entries.slice(1).flatMap((to, index) => {
    const from = entries[index];
    return from.data.type !== "Flight" &&
      !(to.data.type === "Flight" && to.data.flight?.arrivalId === from.id) &&
      from.data.date &&
      from.data.date === to.data.date
      ? [{ from, to }]
      : [];
  });
}
