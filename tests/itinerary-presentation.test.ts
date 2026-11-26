import { expect, it } from "vitest";
import { makeEntity, type Entry } from "../src/model";
import { activityTime, itineraryAlerts } from "../src/itineraryPresentation";
import { transportDirections } from "../src/transport";
const stop = (title: string, start = "") =>
  makeEntity<Entry>("entry", "trip", {
    title,
    type: "Activity",
    date: "2026-12-26",
    endDate: "2026-12-26",
    start,
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
  });
it("uses Anytime and explicit transport ranges, including overnight arrival", () => {
  const e = stop("Flexible");
  expect(activityTime(e.data)).toBe("Anytime");
  e.data.start = "23:30";
  expect(activityTime(e.data, { state: "ready", minutes: 90 })).toBe(
    "11:30 PM",
  );
  e.data.type = "Transportation";
  expect(activityTime(e.data, { state: "ready", minutes: 90 })).toBe(
    "11:30 PM–12/27 · 1:00 AM",
  );
});
it("skips optional unknown opening hours and flexible activities, links overlaps to actual IDs", () => {
  const a = stop("Museum", "09:00"),
    b = stop("Lunch", "09:30"),
    flex = stop("Walk");
  const alerts = itineraryAlerts([a, b, flex], [a, b, flex], {});
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toMatchObject({
    entryId: b.id,
    title: "Activities overlap",
    detail: "Museum and Lunch",
  });
});
it("detects overlaps inside a long activity, but allows activities during hotel stays", () => {
  const a = stop("Tour", "09:00"),
    b = stop("Lunch", "10:00"),
    c = stop("Gallery", "11:00");
  a.data.duration = 240;
  expect(itineraryAlerts([a, b, c], [a, b, c], {})).toHaveLength(2);
  a.data.type = "Lodging";
  expect(itineraryAlerts([a, b, c], [a, b, c], {})).toEqual([]);
});
it("reports missing transport endpoints and explicit opening-hour conflicts without inferred routes", () => {
  const a = stop("Ride", "09:00"),
    b = stop("Museum", "10:00");
  a.data.type = "Transportation";
  a.data.transport = {
    method: "car",
    from: { label: "Hotel", lat: 4.6, lng: -75.6 },
  };
  b.data.opening = { open: 660, close: 1020 };
  const alerts = itineraryAlerts([a, b], [a, b], {});
  expect(alerts).toHaveLength(2);
  expect(alerts[0]).toMatchObject({
    entryId: a.id,
    title: "Transport destination missing",
  });
  expect(alerts[1].title).toBe("Outside opening hours");
});
it("uses transport endpoints and method for directions, with destination search for ferry", () => {
  const a = stop("Ride", "09:00");
  a.data.type = "Transportation";
  a.data.transport = {
    method: "walk",
    from: { label: "Hotel", lat: 4.6, lng: -75.6 },
    to: { label: "Square", placeId: "square" },
  };
  const url = new URL(transportDirections(a.data, [a])!);
  expect(url.searchParams.get("origin")).toBe("4.6,-75.6");
  expect(url.searchParams.get("destination_place_id")).toBe("square");
  expect(url.searchParams.get("travelmode")).toBe("walking");
  a.data.transport.method = "ferry";
  expect(transportDirections(a.data, [a])).toContain("/maps/search/");
});
