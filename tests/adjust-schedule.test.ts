import { expect, it } from "vitest";
import { makeEntity, type Entry } from "../src/model";
import {
  adjustSchedule,
  legKey,
  type AdjustmentOptions,
} from "../src/adjustSchedule";
import { entryBounds, entryWithDuration } from "../src/schedule";
const date = "2027-04-12";
function entry(id: string, start: string, over: Partial<Entry> = {}) {
  return {
    ...makeEntity<Entry>("entry", "trip", {
      title: id,
      type: "Activity",
      date,
      endDate: date,
      start,
      end: "",
      duration: 60,
      zone: "America/New_York",
      address: "",
      notes: "",
      link: "",
      reservation: "",
      cost: 0,
      currency: "USD",
      fixed: false,
      order: id.charCodeAt(0),
      ...over,
    }),
    id,
  };
}
const a = entry("A", "09:00"),
  b = entry("B", "10:15", {
    arrival: { fromId: "A", mode: "WALK", manualMinutes: 15 },
  }),
  c = entry("C", "11:30", {
    arrival: { fromId: "B", mode: "DRIVE", manualMinutes: 15 },
  });
function options(over: Partial<AdjustmentOptions> = {}): AdjustmentOptions {
  return {
    date,
    anchorId: "A",
    start: "09:00",
    duration: 60,
    buffer: 0,
    closeGaps: false,
    manual: {},
    live: {},
    mode: "WALK",
    ...over,
  };
}
it("cascades a duration increase without mutating input or changing activity order", () => {
  const entries = [a, b, c],
    before = JSON.stringify(entries);
  const result = adjustSchedule(entries, options({ duration: 90 }));
  expect(result.conflicts).toEqual([]);
  expect(result.rows.map((r) => r.proposed.data.start)).toEqual([
    "09:00",
    "10:45",
    "12:00",
  ]);
  expect(result.changes).toHaveLength(3);
  expect(JSON.stringify(entries)).toBe(before);
});
it("keeps fixed reservations locked and blocks unreachable appointments", () => {
  const fixed = { ...b, data: { ...b.data, fixed: true, start: "10:15" } };
  const result = adjustSchedule([a, fixed, c], options({ duration: 120 }));
  expect(result.conflicts.join()).toContain("fixed reservation");
  expect(result.rows[1].proposed.data).toEqual(fixed.data);
});
it("preserves breathing room by default and closes gaps only when selected", () => {
  const later = { ...b, data: { ...b.data, start: "13:00" } };
  expect(
    adjustSchedule([a, later], options()).rows[1].proposed.data.start,
  ).toBe("13:00");
  expect(
    adjustSchedule([a, later], options({ closeGaps: true })).rows[1].proposed
      .data.start,
  ).toBe("10:15");
});
it("uses per-leg manual overrides and buffers, including zero-minute legs", () => {
  const result = adjustSchedule(
    [a, b, c],
    options({ manual: { B: 0, C: 45 }, buffer: 10 }),
  );
  expect(result.conflicts).toEqual([]);
  expect(result.rows[2].proposed.data.start).toBe("12:10");
  expect(result.rows[1].proposed.data.arrival?.manualMinutes).toBe(0);
});
it("waits for known opening times and flags closing-time violations", () => {
  const later = {
    ...b,
    data: { ...b.data, opening: { open: 660, close: 690 } },
  };
  const result = adjustSchedule([a, later], options());
  expect(result.rows[1].proposed.data.start).toBe("11:00");
  expect(result.conflicts.join()).toContain("opening hours");
});
it("requires unknown travel times and ignores a manual leg from a different origin", () => {
  const unknown = {
    ...b,
    data: {
      ...b.data,
      arrival: { fromId: "someone-else", mode: "WALK", manualMinutes: 5 },
    },
  };
  expect(adjustSchedule([a, unknown], options()).conflicts.join()).toContain(
    "Travel time unavailable",
  );
  expect(
    adjustSchedule([a, unknown], options({ manual: { B: 20 } })).conflicts,
  ).toEqual([]);
});
it("uses a fetched estimate only for its exact origin, departure and mode", () => {
  const unknown = { ...b, data: { ...b.data, arrival: undefined } };
  const key = legKey(a, unknown, "WALK");
  expect(
    adjustSchedule([a, unknown], options({ live: { B: { minutes: 30, key } } }))
      .rows[1].source,
  ).toBe("Google Maps estimate");
  expect(
    adjustSchedule(
      [a, unknown],
      options({ start: "09:30", live: { B: { minutes: 30, key } } }),
    ).conflicts.join(),
  ).toContain("Travel time unavailable");
});
it("preserves explicit end times and durations as entries move", () => {
  const explicit = { ...b, data: { ...b.data, end: "11:00", duration: 45 } };
  const result = adjustSchedule([a, explicit], options({ duration: 90 }));
  expect(result.rows[1].proposed.data).toMatchObject({
    start: "10:45",
    end: "11:30",
    duration: 45,
  });
});
it("blocks crossing local midnight instead of wrapping to the morning", () => {
  expect(
    adjustSchedule([a], options({ start: "23:30" })).conflicts.join(),
  ).toContain("date boundary");
});
it("uses instants when moving between time zones", () => {
  const west = {
    ...b,
    data: { ...b.data, zone: "America/Los_Angeles", start: "09:00" },
  };
  const result = adjustSchedule([a, west], options({ duration: 240 }));
  expect(result.conflicts).toEqual([]);
  expect(result.rows[1].proposed.data.start).toBe("10:15");
});
it("rejects DST gaps and ambiguous local starts without crashing", () => {
  const spring = {
    ...a,
    data: { ...a.data, date: "2027-03-14", endDate: "2027-03-14" },
  };
  expect(
    adjustSchedule([spring], options({ date: "2027-03-14", start: "02:30" }))
      .conflicts.length,
  ).toBeGreaterThan(0);
  const fall = {
    ...a,
    data: { ...a.data, date: "2027-11-07", endDate: "2027-11-07" },
  };
  expect(
    adjustSchedule([fall], options({ date: "2027-11-07", start: "01:30" }))
      .conflicts.length,
  ).toBeGreaterThan(0);
});
it("keeps multi-day stays unchanged, leaves earlier entries alone, and treats flights as fixed", () => {
  const stay = entry("Hotel", "08:00", {
    endDate: "2027-04-15",
    end: "11:00",
    type: "Lodging",
  });
  const flight = { ...c, data: { ...c.data, type: "Flight" } };
  const result = adjustSchedule(
    [a, b, flight, stay],
    options({ anchorId: "B", start: "10:20", duration: 60 }),
  );
  expect(result.rows.find((r) => r.original.id === "A")!.changed).toBe(false);
  expect(
    result.rows.find((r) => r.original.id === "C")!.proposed.data.start,
  ).toBe("11:30");
  expect(result.notes.join()).toContain("Multi-day");
  expect(result.rows.some((r) => r.original.id === stay.id)).toBe(false);
});

it("duration edits update explicit arrival times across zones and DST", () => {
  const flight = entry("Flight", "09:00", {
    end: "10:00",
    endZone: "America/Los_Angeles",
  });
  expect(entryWithDuration(flight.data, 120)).toMatchObject({
    duration: 120,
    end: "08:00",
    endDate: date,
  });
  const spring = entry("Spring", "01:30", {
    date: "2027-03-14",
    endDate: "2027-03-14",
    end: "03:00",
  });
  expect(entryWithDuration(spring.data, 120).end).toBe("04:30");
});
