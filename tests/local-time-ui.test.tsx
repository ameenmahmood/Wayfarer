// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripForm, EntryForm } from "../src/Forms";
import { seed } from "../src/seed";
import type { Entity, Trip, Entry } from "../src/model";

const store = vi.hoisted(() => ({
  save: vi.fn(async (entity: any) => entity),
}));
vi.mock("../src/store", () => ({
  demo: true,
  supabase: null,
  save: (...args: any[]) => store.save(args[0]),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  store.save.mockClear();
});

it("trip settings have no time-zone selector and editing keeps saved timing data", async () => {
  const trip = { ...seed()[0], version: 1 } as Entity<Trip>;
  const u = userEvent.setup();
  render(<TripForm entity={trip} onDone={() => {}} />);
  expect(screen.queryByLabelText(/time zone|timezone|IANA/i)).toBeNull();
  await u.clear(screen.getByLabelText("Trip name"));
  await u.type(screen.getByLabelText("Trip name"), "Local plans");
  await u.click(screen.getByRole("button", { name: "Save trip" }));
  expect(store.save).toHaveBeenCalledOnce();
  expect(store.save.mock.calls[0][0].data).toMatchObject({
    title: "Local plans",
    zone: trip.data.zone,
    start: trip.data.start,
    end: trip.data.end,
  });
});

it("activity editing keeps displayed local times and existing scheduling metadata without time-zone fields", async () => {
  const trip = seed()[0].data as Trip;
  const original = seed().find((e) => e.kind === "entry") as Entity<Entry>;
  const entry = {
    ...original,
    version: 1,
    data: { ...original.data, endZone: "America/New_York" },
  };
  const u = userEvent.setup();
  render(<EntryForm entity={entry} trip={trip} onDone={() => {}} />);
  await u.click(
    screen.getByText("More details · reservation, cost & coordinates"),
  );
  expect(screen.queryByLabelText(/time zone|timezone|IANA/i)).toBeNull();
  expect(
    (screen.getByLabelText("Start time hour") as HTMLSelectElement).value,
  ).toBe("8");
  expect(
    (screen.getByLabelText("Start time AM or PM") as HTMLSelectElement).value,
  ).toBe("AM");
  await u.clear(screen.getByLabelText("Notes"));
  await u.type(screen.getByLabelText("Notes"), "Local arrival details");
  await u.click(screen.getByRole("button", { name: "Save to itinerary" }));
  expect(store.save).toHaveBeenCalledOnce();
  expect(store.save.mock.calls[0][0].data).toMatchObject({
    notes: "Local arrival details",
    zone: entry.data.zone,
    endZone: entry.data.endZone,
    start: entry.data.start,
    date: entry.data.date,
  });
});
