import { Temporal } from "@js-temporal/polyfill";
import type { Entity, Entry, TransportLocation, TransportPlan } from "./model";
import { instant, formatTime } from "./schedule";

export const transportMethods: Record<TransportPlan["method"], string> = {
  taxi: "Taxi / private transfer",
  car: "Car",
  bus: "Bus",
  train: "Train",
  walk: "Walking",
  bicycle: "Cycling",
  ferry: "Ferry",
  other: "Other",
};
export function transportMode(method: TransportPlan["method"]) {
  return (
    {
      taxi: "DRIVE",
      car: "DRIVE",
      bus: "TRANSIT",
      train: "TRANSIT",
      walk: "WALK",
      bicycle: "BICYCLE",
    } as Record<string, string>
  )[method];
}
export function resolveTransportLocation(
  location: TransportLocation | undefined,
  entries: Entity<Entry>[],
) {
  if (!location) return undefined;
  if (!location.entryId) return location;
  const entry = entries.find((e) => !e.deleted && e.id === location.entryId);
  return entry
    ? {
        label: entry.data.title,
        placeId: entry.data.placeId,
        lat: entry.data.lat,
        lng: entry.data.lng,
        entryId: entry.id,
      }
    : undefined;
}
export function hasTransportLocation(location: TransportLocation | undefined) {
  return (
    !!location &&
    (!!location.placeId ||
      (Number.isFinite(location.lat) &&
        Number.isFinite(location.lng) &&
        Math.abs(location.lat!) <= 90 &&
        Math.abs(location.lng!) <= 180))
  );
}
export function transportProblem(entry: Entry, entries: Entity<Entry>[]) {
  if (entry.type !== "Transportation") return "";
  if (
    !hasTransportLocation(
      resolveTransportLocation(entry.transport?.from, entries),
    )
  )
    return "Choose a pickup location with a map location.";
  if (
    !hasTransportLocation(
      resolveTransportLocation(entry.transport?.to, entries),
    )
  )
    return "Choose a destination with a map location.";
  if (!resolveTransportLocation(entry.transport?.from, entries)?.label?.trim())
    return "Add a label for the pickup location.";
  if (!resolveTransportLocation(entry.transport?.to, entries)?.label?.trim())
    return "Add a label for the destination.";
  const from = resolveTransportLocation(entry.transport?.from, entries)!;
  const to = resolveTransportLocation(entry.transport?.to, entries)!;
  if (
    (from.entryId && from.entryId === to.entryId) ||
    (from.placeId && from.placeId === to.placeId) ||
    (Number.isFinite(from.lat) && from.lat === to.lat && from.lng === to.lng)
  )
    return "Choose different pickup and destination locations.";
  if (!entry.date || !entry.start)
    return "Set a pickup date and time to estimate travel.";
  try {
    instant(entry.date, entry.start, entry.zone);
  } catch {
    return "Check the pickup date and time.";
  }
  if (!entry.transport?.method || !transportMethods[entry.transport.method])
    return "Choose a transport method.";
  if (
    entry.transport.manualMinutes !== undefined &&
    (!Number.isInteger(entry.transport.manualMinutes) ||
      entry.transport.manualMinutes < 1 ||
      entry.transport.manualMinutes > 10080)
  )
    return "Enter a duration from 1 to 10080 whole minutes.";
  return "";
}
export type TransportQuery = {
  key: string;
  tripId: string;
  input: {
    origin: { placeId?: string; lat?: number; lng?: number };
    destination: { placeId?: string; lat?: number; lng?: number };
    mode: string;
    departure?: string;
  };
};
export function transportQuery(
  entity: Entity<Entry>,
  entries: Entity<Entry>[],
): TransportQuery | undefined {
  const data = entity.data;
  if (entity.deleted) return;
  if (
    data.type !== "Transportation" ||
    transportProblem(data, entries) ||
    data.transport?.manualMinutes !== undefined
  )
    return;
  const mode = transportMode(data.transport!.method);
  if (!mode) return;
  const point = (location: TransportLocation) =>
    location.placeId
      ? { placeId: location.placeId }
      : { lat: location.lat!, lng: location.lng! };
  const input = {
    origin: point(resolveTransportLocation(data.transport!.from, entries)!),
    destination: point(resolveTransportLocation(data.transport!.to, entries)!),
    mode,
    departure: new Date(
      instant(data.date, data.start, data.zone),
    ).toISOString(),
  };
  return {
    tripId: entity.tripId,
    input,
    key: JSON.stringify([entity.tripId, input]),
  };
}
export function transportArrival(data: Entry, duration: number) {
  const arrival = Temporal.Instant.fromEpochMilliseconds(
    instant(data.date, data.start, data.zone) + duration * 60000,
  ).toZonedDateTimeISO(data.endZone || data.zone);
  const date = arrival.toPlainDate().toString();
  const clock = formatTime(
    arrival.toPlainTime().toString({ smallestUnit: "minute" }),
  );
  return date === data.date
    ? clock
    : `${arrival.month}/${arrival.day} · ${clock}`;
}
export function transportDirections(data: Entry, entries: Entity<Entry>[]) {
  const from = resolveTransportLocation(data.transport?.from, entries);
  const to = resolveTransportLocation(data.transport?.to, entries);
  if (!hasTransportLocation(from) || !hasTransportLocation(to))
    return undefined;
  const mode = transportMode(data.transport!.method);
  if (!mode)
    return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: to!.label, ...(to!.placeId ? { query_place_id: to!.placeId } : { query: `${to!.lat},${to!.lng}` }) })}`;
  const params = new URLSearchParams({
    api: "1",
    travelmode: (
      {
        WALK: "walking",
        DRIVE: "driving",
        BICYCLE: "bicycling",
        TRANSIT: "transit",
      } as Record<string, string>
    )[mode],
  });
  for (const [side, point] of [
    ["origin", from!],
    ["destination", to!],
  ] as const) {
    params.set(side, point.placeId ? point.label : `${point.lat},${point.lng}`);
    if (point.placeId) params.set(`${side}_place_id`, point.placeId);
  }
  return `https://www.google.com/maps/dir/?${params}`;
}
/** Endpoints are map-only projections; never insert them as extra itinerary activities. */
export function transportMapEndpoints(
  entity: Entity<Entry>,
  entries: Entity<Entry>[],
) {
  if (entity.deleted || entity.data.type !== "Transportation") return [];
  return (["from", "to"] as const).flatMap((side) => {
    const point = resolveTransportLocation(
      entity.data.transport?.[side],
      entries,
    );
    if (!hasTransportLocation(point)) return [];
    const linked =
      point!.entryId &&
      entries.find((e) => !e.deleted && e.id === point!.entryId);
    return [
      {
        side,
        ownerId: entity.id,
        entry: linked || {
          ...entity,
          id: `${entity.id}:${side}`,
          data: {
            ...entity.data,
            title: point!.label,
            type: "Activity",
            placeId: point!.placeId,
            lat: point!.lat,
            lng: point!.lng,
          },
        },
      },
    ];
  });
}
