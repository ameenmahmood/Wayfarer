import { expect, it } from "vitest";
import { makeEntity, type Entry } from "../src/model";
import {
  transportArrival,
  transportMapEndpoints,
  transportProblem,
  transportQuery,
} from "../src/transport";
function stop(title: string, lat: number) {
  return makeEntity<Entry>("entry", "trip", {
    title,
    type: "Activity",
    date: "2026-12-26",
    endDate: "2026-12-26",
    start: "09:00",
    end: "",
    duration: 60,
    zone: "America/Bogota",
    address: "",
    notes: "",
    link: "",
    reservation: "",
    cost: 0,
    currency: "USD",
    fixed: false,
    order: 0,
    lat,
    lng: -75.6,
  });
}
const from = stop("Salento", 4.63),
  to = stop("Filandia", 4.67);
function ride() {
  const entry = stop("Transport", 4.65);
  entry.data.type = "Transportation";
  entry.data.transport = {
    method: "taxi",
    from: { entryId: from.id, label: "Salento" },
    to: { entryId: to.id, label: "Filandia" },
  };
  return entry;
}
it("only creates route requests for explicitly configured transportation", () => {
  expect(transportQuery(from, [from, to])).toBeUndefined();
  const entry = ride();
  expect(transportQuery(entry, [from, to])?.input).toEqual({
    origin: { lat: 4.63, lng: -75.6 },
    destination: { lat: 4.67, lng: -75.6 },
    mode: "DRIVE",
    departure: "2026-12-26T14:00:00.000Z",
  });
  expect(
    transportQuery(
      { ...entry, data: { ...entry.data, transport: undefined } },
      [from, to],
    ),
  ).toBeUndefined();
});
it("keeps endpoints stable when plans are reordered, renamed, or notes change", () => {
  const entry = ride();
  const query = transportQuery(entry, [from, to])!;
  expect(
    transportQuery(
      { ...entry, data: { ...entry.data, order: 9, notes: "Changed" } },
      [{ ...to, data: { ...to.data, title: "Renamed" } }, from],
    )?.key,
  ).toBe(query.key);
  expect(
    transportQuery(entry, [from, { ...to, data: { ...to.data, lat: 4.8 } }])
      ?.key,
  ).not.toBe(query.key);
  expect(transportQuery(entry, [from])).toBeUndefined();
  expect(transportProblem(entry.data, [from])).toMatch(/destination/);
});
it("manual and unsupported methods never fall back to invented road estimates", () => {
  const entry = ride();
  entry.data.transport!.manualMinutes = 40;
  expect(transportQuery(entry, [from, to])).toBeUndefined();
  entry.data.transport!.manualMinutes = -1;
  expect(transportProblem(entry.data, [from, to])).toMatch(/duration/);
  entry.data.transport = {
    ...entry.data.transport!,
    manualMinutes: undefined,
    method: "ferry",
  };
  expect(transportQuery(entry, [from, to])).toBeUndefined();
});
it("projects explicit endpoints without creating itinerary records and calculates overnight arrival", () => {
  const entry = ride();
  const endpoints = transportMapEndpoints(entry, [from, to]);
  expect(endpoints.map((endpoint) => endpoint.entry.id)).toEqual([
    from.id,
    to.id,
  ]);
  expect(endpoints.every((endpoint) => endpoint.ownerId === entry.id)).toBe(
    true,
  );
  entry.data.start = "23:45";
  expect(transportArrival(entry.data, 45)).toBe("12/27 · 12:30 AM");
  expect(entry.data.start).toBe("23:45");
  expect(entry.data.end).toBe("");
});
