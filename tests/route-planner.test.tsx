// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoutePlanner from "../src/RoutePlanner";
import type { Entity, Entry, Trip } from "../src/model";
const store = vi.hoisted(() => ({
  api: vi.fn(),
  save: vi.fn(async (_entity: Entity<Entry>) => {}),
}));
vi.mock("../src/store", () => ({
  demo: false,
  api: store.api,
  save: store.save,
}));
const trip: Trip = {
  title: "Route test",
  destinations: "NYC",
  start: "2027-04-12",
  end: "2027-04-12",
  zone: "America/New_York",
  currency: "USD",
  budget: 0,
  categoryBudgets: {},
  people: [],
  description: "",
};
function stop(id: string, data: Partial<Entry> = {}): Entity<Entry> {
  return {
    id,
    tripId: "trip",
    kind: "entry",
    version: 1,
    updatedAt: "2026-11-01T00:00:00Z",
    updatedBy: "owner",
    deleted: false,
    data: {
      title: id,
      type: "Activity",
      date: trip.start,
      endDate: trip.start,
      start: "08:15",
      end: "",
      duration: 30,
      zone: trip.zone,
      address: "",
      notes: "",
      link: "",
      reservation: "",
      cost: 0,
      currency: "USD",
      fixed: false,
      order: 0,
      placeId: "place-" + id,
      ...data,
    },
  };
}
beforeEach(() => {
  store.api.mockReset();
  store.save.mockClear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  store.api.mockImplementation(async (action: string) =>
    action === "matrix" ? { matrix: { "A|B": 12, "B|A": 30 } } : {},
  );
});
afterEach(cleanup);
it("inherits transport, starts before the first reservation, previews without saving and applies only after acceptance", async () => {
  const u = userEvent.setup(),
    onDone = vi.fn();
  const entries = [
    stop("A", { fixed: true }),
    stop("B", { start: "10:00", order: 1 }),
  ];
  render(
    <RoutePlanner
      entries={entries}
      trip={trip}
      date={trip.start}
      tripId="trip"
      initialMode="BICYCLE"
      onDone={onDone}
    />,
  );
  expect(screen.getByLabelText("Transport")).toHaveProperty("value", "BICYCLE");
  expect(screen.getByLabelText("Departure time hour")).toHaveProperty(
    "value",
    "8",
  );
  expect(screen.getByLabelText("Departure time minute")).toHaveProperty(
    "value",
    "15",
  );
  await u.click(screen.getByRole("button", { name: "Preview route" }));
  await screen.findByText(/Original itinerary is unchanged/);
  expect(store.api).toHaveBeenCalledWith(
    "matrix",
    "trip",
    expect.objectContaining({
      mode: "BICYCLE",
      departure: "2027-04-12T12:15:00.000Z",
    }),
  );
  expect(store.save).not.toHaveBeenCalled();
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Route calculation result",
  );
  await u.click(
    screen.getByRole("button", { name: "Accept proposed itinerary" }),
  );
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(store.save).toHaveBeenCalledTimes(2);
  expect(store.save.mock.calls[0][0].data.start).toBe("08:15");
});
it("lists missing locations before making requests and can open the plan editor", async () => {
  const u = userEvent.setup(),
    entry = stop("Unlocated", { placeId: undefined }),
    edit = vi.fn();
  render(
    <RoutePlanner
      entries={[entry]}
      trip={trip}
      date={trip.start}
      tripId="trip"
      onDone={() => {}}
      onEditEntry={edit}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Preview route" }));
  await screen.findByText(/Add a map location before calculating: Unlocated/);
  expect(store.api).not.toHaveBeenCalled();
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Route calculation result",
  );
  await u.click(screen.getByRole("button", { name: "Add location" }));
  expect(edit).toHaveBeenCalledWith(entry);
});
it("shows unreachable-route conflicts without presenting unchanged stops as a proposed route", async () => {
  store.api.mockImplementation(async (action: string) =>
    action === "matrix" ? { matrix: {} } : {},
  );
  const u = userEvent.setup();
  render(
    <RoutePlanner
      entries={[stop("A", { fixed: true }), stop("B")]}
      trip={trip}
      date={trip.start}
      tripId="trip"
      onDone={() => {}}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Preview route" }));
  await screen.findByText("This plan needs an adjustment");
  expect(
    screen.queryByRole("button", { name: "Accept proposed itinerary" }),
  ).toBeNull();
  expect(document.querySelectorAll(".proposal-stop")).toHaveLength(0);
  expect(store.save).not.toHaveBeenCalled();
});
it("keeps errors actionable and allows a successful retry", async () => {
  store.api.mockRejectedValueOnce(
    Error("Google request failed (403): billing or configuration"),
  );
  const u = userEvent.setup();
  render(
    <RoutePlanner
      entries={[stop("A")]}
      trip={trip}
      date={trip.start}
      tripId="trip"
      onDone={() => {}}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Preview route" }));
  await screen.findByText(/Google request failed/);
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Route calculation result",
  );
  await u.click(screen.getByRole("button", { name: "Preview route" }));
  await screen.findByText(/Original itinerary is unchanged/);
});
it("explains a day containing only lodging and disables an empty preview", () => {
  render(
    <RoutePlanner
      entries={[stop("Hotel", { type: "Lodging" })]}
      trip={trip}
      date={trip.start}
      tripId="trip"
      onDone={() => {}}
    />,
  );
  expect(screen.getByText(/No single-day activities/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Preview route" })).toHaveProperty(
    "disabled",
    true,
  );
});
it("rejects past driving and unsupported transit dates before contacting Google", async () => {
  const u = userEvent.setup(),
    date = "2000-01-01";
  render(
    <RoutePlanner
      entries={[stop("A", { date, endDate: date })]}
      trip={trip}
      date={date}
      tripId="trip"
      initialMode="DRIVE"
      onDone={() => {}}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Preview route" }));
  await screen.findByText(/Driving estimates can’t use a past departure/);
  await u.selectOptions(screen.getByLabelText("Transport"), "TRANSIT");
  await u.click(screen.getByRole("button", { name: "Preview route" }));
  await screen.findByText(/Transit schedules are only available/);
  expect(store.api).not.toHaveBeenCalled();
});

it("does not silently substitute rough estimates for a malformed live matrix", async () => {
  store.api.mockResolvedValueOnce({});
  const u = userEvent.setup();
  render(
    <RoutePlanner
      entries={[stop("A")]}
      trip={trip}
      date={trip.start}
      tripId="trip"
      onDone={() => {}}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Preview route" }));
  await screen.findByText(/Route estimates were incomplete or invalid/);
  expect(
    screen.queryByRole("button", { name: "Accept proposed itinerary" }),
  ).toBeNull();
});
