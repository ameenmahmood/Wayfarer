// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeEntity, type Entry } from "../src/model";
import { formatTime, warnings } from "../src/schedule";
import TravelLeg from "../src/TravelLeg";
import TimeInput from "../src/TimeInput";
const service = vi.hoisted(() => ({ api: vi.fn(), save: vi.fn() }));
vi.mock("../src/store", () => ({
  demo: false,
  api: (...args: any[]) => service.api(...args),
  save: (...args: any[]) => service.save(...args),
}));
afterEach(cleanup);
beforeEach(() => {
  service.api.mockReset();
  service.save.mockReset();
});
function entry(title: string, start: string) {
  return makeEntity<Entry>("entry", "trip", {
    title,
    start,
    type: "Activity",
    date: "2026-10-28",
    endDate: "2026-10-28",
    end: "",
    duration: 60,
    zone: "America/New_York",
    address: "",
    placeId: title,
    notes: "",
    link: "",
    reservation: "",
    cost: 0,
    currency: "USD",
    fixed: false,
    order: 0,
  });
}
const first = entry("Cafe", "09:00");
const second = entry("Museum", "10:10");
function Harness({ editor = true }: { editor?: boolean }) {
  const [current, setCurrent] = useState(second);
  service.save.mockImplementation(async (next) => setCurrent(next));
  return (
    <TravelLeg previous={first} entry={current} mode="WALK" canEdit={editor} />
  );
}
it("uses the selected transport and departure for live estimates, without storing Google results", async () => {
  const u = userEvent.setup();
  service.api.mockResolvedValue({
    minutes: 22,
    warnings: ["Walking paths may be incomplete"],
  });
  render(<Harness />);
  await u.selectOptions(
    screen.getByLabelText("Travel method to Museum"),
    "TRANSIT",
  );
  await u.click(screen.getByRole("button", { name: "Calculate travel time" }));
  expect(
    await screen.findByText("22 min · Google Maps estimate · live, not saved"),
  ).toBeTruthy();
  expect(service.api).toHaveBeenCalledWith(
    "route",
    "trip",
    expect.objectContaining({
      mode: "TRANSIT",
      departure: "2026-10-28T14:00:00.000Z",
    }),
  );
  expect(screen.getByText(/Insufficient travel time/)).toBeTruthy();
  expect(service.save).toHaveBeenCalledTimes(1);
  expect(service.save.mock.calls[0][0].data.arrival).toEqual({
    fromId: first.id,
    mode: "TRANSIT",
  });
});
it("saves manual minutes offline and preserves them when rerendered", async () => {
  const u = userEvent.setup();
  render(<Harness />);
  await u.click(screen.getByLabelText("Set time manually"));
  const input = screen.getByLabelText("Travel minutes to Museum");
  await u.clear(input);
  await u.type(input, "35");
  await u.click(screen.getByRole("button", { name: "Save time" }));
  await screen.findByText("35 min · manual time");
  expect(service.save.mock.calls.at(-1)![0].data.arrival.manualMinutes).toBe(
    35,
  );
  expect(service.api).not.toHaveBeenCalled();
  await u.click(screen.getByLabelText("Set time manually"));
  expect(screen.queryByText("35 min · manual time")).toBeNull();
});
it("offers manual recovery when Google fails", async () => {
  const u = userEvent.setup();
  service.api.mockRejectedValue(Error("Route unavailable"));
  render(<Harness />);
  await u.click(screen.getByRole("button", { name: "Calculate travel time" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByLabelText("Set time manually")).toBeTruthy();
});
it("does not reuse a manual duration when the preceding activity changes and protects viewers", () => {
  const changed = {
    ...second,
    data: {
      ...second.data,
      arrival: { fromId: "different", mode: "DRIVE", manualMinutes: 99 },
    },
  };
  render(
    <TravelLeg previous={first} entry={changed} mode="WALK" canEdit={false} />,
  );
  expect(screen.queryByText("99 min · manual time")).toBeNull();
  expect(
    (screen.getByLabelText("Set time manually") as HTMLInputElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByLabelText("Travel method to Museum") as HTMLSelectElement)
      .value,
  ).toBe("WALK");
});
it("formats midnight, noon, and afternoon and edits explicit AM/PM values", async () => {
  expect(["00:00", "12:00", "13:30", ""].map(formatTime)).toEqual([
    "12:00 AM",
    "12:00 PM",
    "1:30 PM",
    "Any time",
  ]);
  const u = userEvent.setup();
  function Time() {
    const [v, setV] = useState("09:15");
    return (
      <>
        <TimeInput label="Start time" value={v} onChange={setV} />
        <output>{v}</output>
      </>
    );
  }
  render(<Time />);
  await u.selectOptions(screen.getByLabelText("Start time AM or PM"), "PM");
  await u.selectOptions(screen.getByLabelText("Start time hour"), "12");
  expect(screen.getByText("12:15")).toBeTruthy();
});
it("schedule warnings use supplied manual leg durations", () => {
  const alerts = warnings(
    [first.data, second.data],
    "WALK",
    undefined,
    () => 30,
  );
  expect(alerts.join()).toContain("Insufficient travel time");
  expect(
    warnings([first.data, second.data], "WALK", undefined, () => 5).join(),
  ).not.toContain("Insufficient travel time");
});

it("keeps advanced activity details collapsed and preserves them when basic fields are saved", async () => {
  const { EntryForm } = await import("../src/Forms");
  const u = userEvent.setup();
  const original = {
    ...second,
    data: {
      ...second.data,
      reservation: "ABC123",
      cost: 1250,
      endZone: "America/Chicago",
      notes: "Keep this note",
    },
  };
  service.save.mockResolvedValue(undefined);
  const trip = {
    title: "NYC",
    destinations: "New York",
    start: "2026-10-28",
    end: "2026-10-30",
    zone: "America/New_York",
    currency: "USD",
    budget: 0,
    categoryBudgets: {},
    people: [],
    description: "",
  };
  const { container } = render(
    <EntryForm entity={original} trip={trip} onDone={() => {}} />,
  );
  expect(container.querySelector("details")?.open).toBe(false);
  expect(screen.getByRole("group", { name: "Start time" })).toBeTruthy();
  await u.clear(screen.getByLabelText("Title"));
  await u.type(screen.getByLabelText("Title"), "New museum");
  await u.click(screen.getByRole("button", { name: "Save to itinerary" }));
  await waitFor(() => expect(service.save).toHaveBeenCalled());
  expect(service.save.mock.calls[0][0].data).toMatchObject({
    title: "New museum",
    reservation: "ABC123",
    cost: 1250,
    notes: "Keep this note",
    endZone: "America/Chicago",
  });
  await u.click(screen.getByText(/More details · reservation/));
  expect(container.querySelector("details")?.open).toBe(true);
  expect(screen.getByLabelText("Reservation reference")).toBeTruthy();
});

it("does not treat a multi-day hotel stay as a missed departure deadline", () => {
  const hotel = {
    ...first,
    data: {
      ...first.data,
      type: "Lodging",
      endDate: "2026-10-30",
      end: "11:00",
    },
  };
  render(
    <TravelLeg
      previous={hotel}
      entry={{
        ...second,
        data: {
          ...second.data,
          arrival: { fromId: hotel.id, mode: "WALK", manualMinutes: 15 },
        },
      }}
      mode="WALK"
      canEdit
    />,
  );
  expect(screen.queryByText(/Insufficient travel time/)).toBeNull();
});
