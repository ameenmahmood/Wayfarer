import { useEffect } from "react";
import type { Entity, Entry } from "./model";
import { demo } from "./store";
import { hasTransportLocation, type TransportQuery } from "./transport";
import { transferDeparture } from "./transfers";
import {
  requestTransport,
  transportSnapshot,
  useTransportRevision,
  type TransportEstimate,
} from "./transportRoutes";

export const WALKING_LIMIT_MINUTES = 20;
export type ActivityLeg = { previous: Entity<Entry>; entry: Entity<Entry> };
export type ActivityEstimate = TransportEstimate & {
  mode: string;
  automatic: boolean;
};

export function activityLegs(entries: Entity<Entry>[]): ActivityLeg[] {
  return entries.flatMap((entry, index) => {
    const previous = entries[index - 1];
    if (
      !previous ||
      previous.deleted ||
      entry.deleted ||
      !entry.data.date ||
      previous.data.date !== entry.data.date ||
      previous.tripId !== entry.tripId ||
      previous.data.type === "Flight" ||
      previous.data.type === "Transportation" ||
      entry.data.type === "Transportation"
    )
      return [];
    // A separately planned transfer already represents this journey.
    if (
      entries.some(
        (transfer) =>
          transfer.data.type === "Transportation" &&
          !transfer.deleted &&
          transfer.data.transport?.from?.entryId === previous.id &&
          transfer.data.transport?.to?.entryId === entry.id,
      )
    )
      return [];
    return [{ previous, entry }];
  });
}
export function savedArrival({ previous, entry }: ActivityLeg) {
  return entry.data.arrival?.fromId === previous.id
    ? entry.data.arrival
    : undefined;
}
export function activityMode(leg: ActivityLeg) {
  const arrival = savedArrival(leg);
  if (arrival?.mode && arrival.mode !== "AUTO") return arrival.mode;
  if (arrival?.booking) {
    if (
      ["Taxi", "Private transfer", "Rental car"].includes(
        arrival.booking.transport,
      )
    )
      return "DRIVE";
    if (["Train", "Bus"].includes(arrival.booking.transport)) return "TRANSIT";
    return "MANUAL";
  }
  return "AUTO";
}
export function activityQuery(
  leg: ActivityLeg,
  mode: string,
): TransportQuery | undefined {
  if (!["WALK", "DRIVE", "BICYCLE", "TRANSIT"].includes(mode)) return;
  const point = (entry: Entry) =>
    entry.placeId
      ? { placeId: entry.placeId }
      : { lat: entry.lat, lng: entry.lng };
  if (
    ![leg.previous, leg.entry].every((e) =>
      hasTransportLocation({ label: e.data.title, ...point(e.data) }),
    )
  )
    return;
  let departure: string | undefined;
  if (mode === "TRANSIT") {
    try {
      const time = transferDeparture(leg.previous, leg.entry);
      if (time !== undefined) departure = new Date(time).toISOString();
    } catch {
      /* A generic transit estimate can still be requested. */
    }
  }
  const input = {
    origin: point(leg.previous.data),
    destination: point(leg.entry.data),
    mode,
    ...(departure ? { departure } : {}),
  };
  return {
    tripId: leg.entry.tripId,
    input,
    key: JSON.stringify([leg.entry.tripId, input]),
  };
}
function shouldDrive(walking?: TransportEstimate) {
  return (
    (walking?.state === "ready" && walking.minutes! > WALKING_LIMIT_MINUTES) ||
    (walking?.state === "error" &&
      /no route available|route unavailable/i.test(walking.error || ""))
  );
}
export function activitySnapshot(leg: ActivityLeg): ActivityEstimate {
  const preference = activityMode(leg),
    automatic = preference === "AUTO";
  let mode = automatic ? "WALK" : preference;
  let query = activityQuery(leg, mode);
  let result = query && transportSnapshot(query.key);
  if (automatic && shouldDrive(result)) {
    mode = "DRIVE";
    query = activityQuery(leg, mode);
    result = query && transportSnapshot(query.key);
  }
  if (result) return { ...result, mode, automatic };
  return {
    state: query && !demo && navigator.onLine ? "loading" : "error",
    mode,
    automatic,
    error: !query
      ? "Add a map location to both activities, or set a manual time."
      : demo
        ? "Live routes require a connected account. You can set a manual time."
        : "Offline. Reconnect to calculate the route, or set a manual time.",
  };
}
export async function requestActivityRoute(leg: ActivityLeg, refresh = false) {
  const mode = activityMode(leg);
  const query = activityQuery(leg, mode === "AUTO" ? "WALK" : mode);
  if (!query || demo || !navigator.onLine) return;
  await requestTransport(query, refresh);
  if (mode === "AUTO" && shouldDrive(transportSnapshot(query.key))) {
    const drive = activityQuery(leg, "DRIVE");
    if (drive) await requestTransport(drive, refresh);
  }
}
export function useActivityRoutes(entries: Entity<Entry>[], enabled = true) {
  useTransportRevision();
  const legs = enabled ? activityLegs(entries) : [];
  const key = JSON.stringify(
    legs.map((leg) => [
      activityQuery(
        leg,
        activityMode(leg) === "AUTO" ? "WALK" : activityMode(leg),
      )?.key,
      activityMode(leg),
    ]),
  );
  useEffect(() => {
    const calculate = () => {
      legs.forEach((leg) => {
        void requestActivityRoute(leg);
      });
    };
    const timer = setTimeout(calculate, 500);
    window.addEventListener("online", calculate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", calculate);
    };
  }, [key]);
  return Object.fromEntries(
    legs.map((leg) => [leg.entry.id, activitySnapshot(leg)]),
  );
}
export function formatRouteDistance(meters: number) {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}
