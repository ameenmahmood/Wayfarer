// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, cleanup, waitFor, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeEntity, type Entry } from "../src/model";
const service = vi.hoisted(() => ({
  api: vi.fn<(...args: any[]) => Promise<any>>(),
}));
vi.mock("../src/store", () => ({
  demo: false,
  api: (...args: any[]) => service.api(...args),
}));
vi.stubEnv("VITE_GOOGLE_MAPS_BROWSER_KEY", "public-test-key");
import MapPanel from "../src/MapPanel";
let markers: any[], map: any;
beforeEach(() => {
  markers = [];
  service.api.mockReset();
  map = { fitBounds: vi.fn(), setZoom: vi.fn(), setCenter: vi.fn() };
  window.google = {
    maps: {
      Map: class {
        constructor() {
          return map;
        }
      },
      LatLngBounds: class {
        extend() {}
      },
      Marker: class {
        id: any;
        setMap = vi.fn();
        setTitle = vi.fn();
        setAnimation = vi.fn();
        listener: any;
        constructor(options: any) {
          this.id = options.title;
          markers.push(this);
        }
        addListener(_event: string, fn: any) {
          this.listener = fn;
        }
      },
      Animation: { BOUNCE: "bounce" },
      geometry: { encoding: { decodePath: () => [] } },
      Polyline: class {
        setMap() {}
      },
    },
  };
  service.api.mockImplementation(
    async (action: string, _trip: string, args: any) => {
      if (action === "place") {
        if (args.placeId === "missing") throw Error("Location unavailable");
        return { location: { latitude: 40.75, longitude: -73.98 } };
      }
      return { warnings: [], polyline: "" };
    },
  );
});
afterEach(cleanup);
function entry(title: string, placeId: string) {
  return makeEntity<Entry>("entry", "trip", {
    title,
    placeId,
    type: "Activity",
    date: "2026-10-28",
    endDate: "2026-10-28",
    start: "09:00",
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
    order: 0,
  });
}
it("notes/title edits do not repeat place or route requests, while route mode changes still recalculate", async () => {
  const entries = [entry("First", "one"), entry("Second", "two")];
  const { rerender } = render(
    <MapPanel
      entries={entries}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(service.api).toHaveBeenCalledTimes(3));
  rerender(
    <MapPanel
      entries={entries.map((e) => ({
        ...e,
        updatedAt: new Date().toISOString(),
        data: {
          ...e.data,
          notes: "New note",
          title: e.data.title + " renamed",
        },
      }))}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  expect(service.api).toHaveBeenCalledTimes(3);
  expect(markers[0].setTitle).toHaveBeenCalledWith("First renamed");
  rerender(
    <MapPanel
      entries={entries}
      selected=""
      onSelect={() => {}}
      tripId="trip"
      mode="DRIVE"
    />,
  );
  await waitFor(() => expect(service.api).toHaveBeenCalledTimes(6));
});
it("selection and click callbacks use entry IDs even when an earlier place could not load", async () => {
  const entries = [entry("Unavailable", "missing"), entry("Visible", "valid")];
  const oldSelect = vi.fn(),
    newSelect = vi.fn();
  const { rerender } = render(
    <MapPanel
      entries={entries}
      selected=""
      onSelect={oldSelect}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(1));
  expect(map.setZoom).toHaveBeenCalledWith(15);
  rerender(
    <MapPanel
      entries={entries}
      selected={entries[1].id}
      onSelect={newSelect}
      tripId="trip"
    />,
  );
  expect(markers[0].setAnimation).toHaveBeenCalledWith("bounce");
  markers[0].listener();
  expect(newSelect).toHaveBeenCalledWith(entries[1].id);
  expect(oldSelect).not.toHaveBeenCalled();
});

it("retrying a failed map rebuilds its markers even when the map SDK was already loaded", async () => {
  const entries = [entry("Visible", "valid")];
  render(
    <MapPanel
      entries={entries}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(1));
  await act(async () => {
    window.gm_authFailure();
  });
  const u = userEvent.setup();
  await u.click(screen.getByRole("button", { name: "Retry map" }));
  await waitFor(() => expect(markers).toHaveLength(2));
  expect(service.api).toHaveBeenCalledTimes(2);
});
