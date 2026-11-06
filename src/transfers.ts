import type { Entity, Entry } from "./model";
import { entryBounds, instant } from "./schedule";

export function transferDeparture(
  previous: Entity<Entry>,
  entry: Entity<Entry>,
) {
  const pickup =
    entry.data.arrival?.fromId === previous.id
      ? entry.data.arrival.booking?.pickup
      : undefined;
  if (pickup)
    return instant(
      pickup.date,
      pickup.time,
      previous.data.endZone || previous.data.zone,
    );
  if (
    !previous.data.start ||
    (previous.data.endDate || previous.data.date) > entry.data.date
  )
    return undefined;
  return entryBounds(previous.data).end;
}
export function preservesTransfers(entries: Entity<Entry>[]) {
  return entries.every(
    (entry, index) =>
      !entry.data.arrival?.booking ||
      entries[index - 1]?.id === entry.data.arrival.fromId,
  );
}
export function hasSavedTransfers(entries: Entity<Entry>[], date: string) {
  return entries.some(
    (entry) =>
      !entry.deleted &&
      entry.data.date === date &&
      !!entry.data.arrival?.booking,
  );
}
