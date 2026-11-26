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
export function flightTimingParts({ from, to }: FlightConnection) {
  if (!from.data.date || !from.data.start || !to.data.date || !to.data.start)
    return { times: "Add departure and arrival times", duration: "" };
  try {
    const duration = Math.round(
      (instant(to.data.date, to.data.start, to.data.zone) -
        instant(from.data.date, from.data.start, from.data.zone)) /
        60000,
    );
    if (duration <= 0)
      return { times: "Check flight dates and times", duration: "" };
    const arrivalDate =
      from.data.date !== to.data.date ? `${to.data.date} · ` : "";
    return {
      times: `${formatTime(from.data.start)} → ${arrivalDate}${formatTime(to.data.start)}`,
      duration: `${Math.floor(duration / 60)}h ${duration % 60}m scheduled`,
    };
  } catch {
    return { times: "Check flight dates and times", duration: "" };
  }
}
export function flightTiming(connection: FlightConnection) {
  const { times, duration } = flightTimingParts(connection);
  return duration ? `${times} · ${duration}` : times;
}
