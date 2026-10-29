// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const service = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/store", () => ({
  demo: false,
  api: (...args: any[]) => service.api(...args),
}));
import NearbyPlaces from "../src/NearbyPlaces";
const trip = {
  title: "NYC",
  destinations: "New York",
  start: "2026-11-01",
  end: "2026-11-02",
  zone: "America/New_York",
  currency: "USD",
  budget: 0,
  categoryBudgets: {},
  people: [],
  description: "",
};
const result = {
  places: [
    {
      id: "cafe-1",
      displayName: { text: "Coffee shop" },
      formattedAddress: "5 Example Street",
    },
  ],
  centerLabel: "Midtown",
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("searches selected categories and routes reviewed places to saved or scheduled forms", async () => {
  const u = userEvent.setup(),
    pick = vi.fn();
  service.api.mockResolvedValue(result);
  render(
    <NearbyPlaces
      trip={trip}
      tripId="trip"
      entries={[]}
      selected=""
      date={trip.start}
      canEdit
      onPick={pick}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Museums" }));
  await u.click(screen.getByRole("button", { name: "Search nearby" }));
  await screen.findByRole("heading", { name: "Coffee shop" });
  expect(service.api).toHaveBeenCalledWith("nearby", "trip", {
    category: "museum",
    location: "New York",
    radius: 1609,
  });
  expect(pick).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: /View on Google Maps/ }),
  ).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Save for later" }));
  expect(pick).toHaveBeenLastCalledWith("cafe-1", "", "Attraction");
  await u.selectOptions(
    screen.getByLabelText("Day for new activities"),
    trip.end,
  );
  await u.click(screen.getByRole("button", { name: "Add to day" }));
  expect(pick).toHaveBeenLastCalledWith("cafe-1", trip.end, "Attraction");
});
it("handles errors and empty results and clears results when search criteria change", async () => {
  const u = userEvent.setup();
  service.api
    .mockRejectedValueOnce(Error("Quota reached"))
    .mockResolvedValueOnce({ places: [], centerLabel: "Midtown" })
    .mockResolvedValueOnce(result);
  render(
    <NearbyPlaces
      trip={trip}
      tripId="trip"
      entries={[]}
      selected=""
      date={trip.start}
      canEdit
      onPick={() => {}}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Search nearby" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Quota");
  await u.click(screen.getByRole("button", { name: "Search nearby" }));
  await screen.findByText(/No places found/);
  await u.click(screen.getByRole("button", { name: "Search nearby" }));
  await screen.findByRole("heading", { name: "Coffee shop" });
  await u.click(screen.getByRole("button", { name: "Parks" }));
  expect(screen.queryByRole("heading", { name: "Coffee shop" })).toBeNull();
});
it("viewers can browse but cannot add places", async () => {
  const u = userEvent.setup();
  service.api.mockResolvedValue(result);
  render(
    <NearbyPlaces
      trip={trip}
      tripId="trip"
      entries={[]}
      selected=""
      date={trip.start}
      canEdit={false}
      onPick={vi.fn()}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Search nearby" }));
  await screen.findByRole("heading", { name: "Coffee shop" });
  expect(screen.queryByRole("button", { name: "Add to day" })).toBeNull();
  expect(screen.getByText(/Viewer access/)).toBeTruthy();
});
