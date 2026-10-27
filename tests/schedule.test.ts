import { describe, it, expect } from "vitest";
import { instant, entryBounds, optimize, warnings } from "../src/schedule";
import type { Entry } from "../src/model";
const entry = (over: Partial<Entry> = {}): Entry => ({
  title: "A",
  type: "Activity",
  date: "2027-04-12",
  endDate: "2027-04-12",
  start: "09:00",
  end: "",
  duration: 60,
  zone: "Asia/Tokyo",
  address: "",
  notes: "",
  link: "",
  reservation: "",
  cost: 0,
  currency: "JPY",
  fixed: false,
  order: 0,
  lat: 35.68,
  lng: 139.7,
  ...over,
});
describe("destination time and route proposals", () => {
  it("resolves cross-zone instants", () => {
    expect(instant("2027-04-12", "09:00", "Asia/Tokyo")).toBe(
      instant("2027-04-11", "20:00", "America/New_York"),
    );
  });
  it("rejects nonexistent and ambiguous daylight saving local times", () => {
    expect(() => instant("2027-03-14", "02:30", "America/New_York")).toThrow();
    expect(() => instant("2027-11-07", "01:30", "America/New_York")).toThrow();
  });
  it("represents multi-day hotel stays", () => {
    const b = entryBounds(entry({ endDate: "2027-04-15", end: "09:00" }));
    expect(b.end - b.start).toBe(3 * 86400000);
  });
  it("represents a flight with different origin and arrival zones", () => {
    const b = entryBounds(
      entry({
        date: "2027-04-11",
        start: "13:00",
        zone: "America/New_York",
        endDate: "2027-04-12",
        end: "16:00",
        endZone: "Asia/Tokyo",
      }),
    );
    expect((b.end - b.start) / 3600000).toBe(14);
  });
  it("warns for overlaps, unavailable routes and unknown opening hours", () => {
    expect(
      warnings([entry(), entry({ title: "B", start: "09:30" })]).join(),
    ).toContain("overlaps");
    expect(
      warnings([
        entry({ lat: undefined }),
        entry({ title: "B", start: "12:00" }),
      ]).join(),
    ).toContain("Route unavailable");
    expect(warnings([entry()]).join()).toContain("unknown");
  });
  it("warns when a known opening window is exceeded", () => {
    expect(
      warnings([entry({ opening: { open: 600, close: 900 } })]).join(),
    ).toContain("outside");
  });
  it("preserves fixed reservations and returns a review-only proposal", () => {
    const original = [
      entry({ title: "Lunch", fixed: true, start: "12:00", order: 0 }),
      entry({ title: "Museum", order: 1, opening: { open: 540, close: 720 } }),
    ];
    const snap = JSON.stringify(original),
      r = optimize(original, "09:00", "WALK");
    expect(r.conflicts).toEqual([]);
    expect(r.entries.find((e) => e.title === "Lunch")?.start).toBe("12:00");
    expect(JSON.stringify(original)).toBe(snap);
    expect(r.entries.find((e) => e.title === "Museum")?.start).toBe("09:00");
  });
  it("reports infeasible fixed appointments", () => {
    const r = optimize(
      [entry({ fixed: true, start: "08:00" })],
      "09:00",
      "WALK",
    );
    expect(r.conflicts.length).toBeGreaterThan(0);
  });
  it("respects route estimates, opening hours, and start/end legs", () => {
    const a = entry({ title: "A", duration: 30 }),
      b = entry({
        title: "B",
        duration: 30,
        opening: { open: 600, close: 660 },
      }),
      start = entry({ title: "Hotel" });
    const r = optimize(
      [a, b],
      "09:00",
      "DRIVE",
      {
        "Hotel|A": 10,
        "Hotel|B": 20,
        "A|B": 10,
        "B|A": 10,
        "A|Hotel": 10,
        "B|Hotel": 20,
      },
      start,
      start,
    );
    expect(r.conflicts).toEqual([]);
    expect(r.travel).toBeGreaterThanOrEqual(40);
    expect(r.entries.find((e) => e.title === "B")!.start >= "10:00").toBe(true);
  });
  it("fails closed for unavailable matrix legs and bounded stop counts", () => {
    expect(
      optimize([entry(), entry({ title: "B" })], "09:00", "TRANSIT", {})
        .conflicts.length,
    ).toBeGreaterThan(0);
    expect(() => optimize(Array(11).fill(entry()), "09:00", "WALK")).toThrow();
  });
});
