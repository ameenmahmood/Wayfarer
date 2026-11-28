// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  render,
  cleanup,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeEntity, type Entity, type Entry } from "../src/model";
const service = vi.hoisted(() => ({ api: vi.fn(), save: vi.fn() }));
vi.mock("../src/store", () => ({
  demo: false,
  api: (...args: any[]) => service.api(...args),
  save: (...args: any[]) => service.save(...args),
}));
import {
  activityLegs,
  activityMode,
  activityQuery,
  activitySnapshot,
  requestActivityRoute,
  useActivityRoutes,
} from "../src/activityRoutes";
import { clearTransportRouteCache } from "../src/transportRoutes";
import ActivityConnection from "../src/ActivityConnection";

function stop(title: string) {
  return makeEntity<Entry>("entry", "trip", {
    title,
    placeId: title,
    type: "Activity",
    date: "2026-12-18",
    endDate: "2026-12-18",
    start: "",
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
}
let previous: Entity<Entry>, entry: Entity<Entry>;
beforeEach(() => {
  clearTransportRouteCache();
  service.api.mockReset();
  service.save.mockReset();
  previous = stop("Walled City");
  entry = stop("Getsemani");
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});
afterEach(cleanup);
it.each([12, 20])(
  "automatically walks a %s-minute route, including Anytime activities, and reuses the result",
  async (minutes) => {
    service.api.mockResolvedValue({
      minutes,
      distanceMeters: 800,
      polyline: "walk",
    });
    const leg = { previous, entry };
    await Promise.all([requestActivityRoute(leg), requestActivityRoute(leg)]);
    await requestActivityRoute(leg);
    expect(service.api).toHaveBeenCalledTimes(1);
    expect(service.api.mock.calls[0][2]).toEqual({
      origin: { placeId: previous.data.placeId },
      destination: { placeId: entry.data.placeId },
      mode: "WALK",
    });
    expect(activitySnapshot(leg)).toMatchObject({
      state: "ready",
      automatic: true,
      mode: "WALK",
      minutes,
      distanceMeters: 800,
      polyline: "walk",
    });
    expect(service.save).not.toHaveBeenCalled();
  },
);
it("switches longer walks to actual driving time, distance and route", async () => {
  service.api.mockImplementation(async (_action, _trip, input) =>
    input.mode === "WALK"
      ? { minutes: 21, distanceMeters: 1600, polyline: "walk" }
      : { minutes: 7, distanceMeters: 2400, polyline: "drive" },
  );
  await requestActivityRoute({ previous, entry });
  expect(service.api.mock.calls.map((call) => call[2].mode)).toEqual([
    "WALK",
    "DRIVE",
  ]);
  expect(activitySnapshot({ previous, entry })).toMatchObject({
    mode: "DRIVE",
    minutes: 7,
    distanceMeters: 2400,
    polyline: "drive",
  });
});
it("tries driving when walking has no route, but does not retry quota failures with another mode", async () => {
  service.api
    .mockRejectedValueOnce(
      Error("No route available for this transport mode. Try another mode."),
    )
    .mockResolvedValueOnce({ minutes: 10, distanceMeters: 3000 });
  await requestActivityRoute({ previous, entry });
  expect(activitySnapshot({ previous, entry })).toMatchObject({
    mode: "DRIVE",
    state: "ready",
  });
  clearTransportRouteCache();
  service.api.mockReset().mockRejectedValue(Error("Daily allowance reached"));
  await requestActivityRoute({ previous, entry });
  expect(service.api).toHaveBeenCalledTimes(1);
  expect(activitySnapshot({ previous, entry })).toMatchObject({
    state: "error",
    error: "Daily allowance reached",
  });
});
it("keeps explicit drive and manual times, and ignores arrival settings for a different predecessor", async () => {
  entry.data.arrival = {
    fromId: previous.id,
    mode: "DRIVE",
    manualMinutes: 45,
  };
  service.api.mockResolvedValue({ minutes: 5, distanceMeters: 800 });
  await requestActivityRoute({ previous, entry });
  expect(service.api.mock.calls.map((call) => call[2].mode)).toEqual(["DRIVE"]);
  expect(entry.data.arrival.manualMinutes).toBe(45);
  const other = stop("Other");
  expect(activityMode({ previous: other, entry })).toBe("AUTO");
});
it("recalculates changed locations and direction after reorder, without invalidating routes for notes", async () => {
  service.api.mockResolvedValue({ minutes: 10, distanceMeters: 600 });
  await requestActivityRoute({ previous, entry });
  entry.data.notes = "A new note";
  entry.data.title = "Renamed";
  await requestActivityRoute({ previous, entry });
  expect(service.api).toHaveBeenCalledTimes(1);
  entry.data.placeId = "new-place";
  await requestActivityRoute({ previous, entry });
  await requestActivityRoute({ previous: entry, entry: previous });
  expect(service.api).toHaveBeenCalledTimes(3);
});
it("skips flight connections, separate transport plans, other days and missing locations", async () => {
  previous.data.type = "Flight";
  expect(activityLegs([previous, entry])).toHaveLength(0);
  previous.data.type = "Activity";
  const ride = stop("Taxi");
  ride.data.type = "Transportation";
  ride.data.transport = {
    method: "taxi",
    from: { entryId: previous.id, label: "From" },
    to: { entryId: entry.id, label: "To" },
  };
  expect(activityLegs([previous, entry, ride])).toHaveLength(0);
  entry.data.date = "2026-12-19";
  expect(activityLegs([previous, entry])).toHaveLength(0);
  entry.data.placeId = "";
  expect(activityQuery({ previous, entry }, "WALK")).toBeUndefined();
  await requestActivityRoute({ previous, entry });
  expect(service.api).not.toHaveBeenCalled();
});
function Harness({ canEdit = true }: { canEdit?: boolean }) {
  const [current, setCurrent] = useState(entry);
  service.save.mockImplementation(async (next) => setCurrent(next));
  const estimates = useActivityRoutes([previous, current]);
  return (
    <ActivityConnection
      previous={previous}
      entry={current}
      estimate={estimates[current.id]}
      canEdit={canEdit}
      onSelect={() => {}}
    />
  );
}
it("shows a compact distance row, saves an override, and can return to Auto without changing activity times", async () => {
  service.api.mockImplementation(async (_action, _trip, input) => ({
    minutes: input.mode === "WALK" ? 12 : 6,
    distanceMeters: input.mode === "WALK" ? 800 : 1200,
  }));
  const u = userEvent.setup();
  render(<Harness />);
  await u.click(
    await screen.findByRole("button", { name: /12 min walk · 800 m/ }),
  );
  await u.selectOptions(screen.getByLabelText("Travel mode"), "DRIVE");
  await u.click(screen.getByRole("button", { name: "Save travel settings" }));
  await screen.findByRole("button", { name: /6 min drive · 1.2 km/ });
  expect(service.save.mock.calls[0][0].data.arrival).toEqual({
    fromId: previous.id,
    mode: "DRIVE",
  });
  expect(service.save.mock.calls[0][0].data.start).toBe("");
  await u.click(screen.getByRole("button", { name: /6 min drive · 1.2 km/ }));
  await u.selectOptions(screen.getByLabelText("Travel mode"), "AUTO");
  await u.click(screen.getByRole("button", { name: "Save travel settings" }));
  await screen.findByRole("button", { name: /12 min walk · 800 m/ });
  expect(service.api).toHaveBeenCalledTimes(2);
});
it("shows manual times and booked taxis without replacing the booking", async () => {
  entry.data.arrival = {
    fromId: previous.id,
    mode: "DRIVE",
    manualMinutes: 45,
    booking: {
      title: "Airport taxi",
      transport: "Taxi",
      status: "Booked",
      company: "Taxi Co",
      meetingPoint: "Exit",
      reference: "123",
      contact: "",
      notes: "",
      pickup: { date: entry.data.date, time: "15:30" },
    },
  };
  service.api.mockResolvedValue({ minutes: 10, distanceMeters: 4000 });
  const u = userEvent.setup();
  render(<Harness />);
  await u.click(
    await screen.findByRole("button", { name: /Airport taxi · 45 min drive/ }),
  );
  await u.click(screen.getByRole("button", { name: "Save travel settings" }));
  expect(service.save.mock.calls[0][0].data.arrival).toEqual(
    entry.data.arrival,
  );
});
it("lets viewers inspect a failed route and a manual option without editing it", async () => {
  service.api.mockRejectedValue(Error("Route unavailable"));
  const u = userEvent.setup();
  render(<Harness canEdit={false} />);
  await waitFor(() => expect(service.api).toHaveBeenCalledTimes(2));
  await u.click(screen.getByRole("button", { name: /Route unavailable/ }));
  expect(
    (screen.getByLabelText("Travel mode") as HTMLSelectElement).disabled,
  ).toBe(true);
  expect(
    within(screen.getByRole("dialog")).queryByRole("button", {
      name: "Save travel settings",
    }),
  ).toBeNull();
  expect(service.save).not.toHaveBeenCalled();
});
