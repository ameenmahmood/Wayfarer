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
let markers: any[], map: any, mapOptions: any, polylines: any[];
beforeEach(() => {
  markers = [];
  polylines = [];
  mapOptions = undefined;
  service.api.mockReset();
  map = { fitBounds: vi.fn(), setZoom: vi.fn(), setCenter: vi.fn() };
  window.google = {
    maps: {
      Map: class {
        constructor(_element: HTMLElement, options: any) {
          mapOptions = options;
          return map;
        }
      },
      LatLngBounds: class {
        points: any[] = [];
        extend(point: any) {
          this.points.push(point);
        }
      },
      Marker: class {
        id: any;
        setMap = vi.fn();
        setTitle = vi.fn();
        setAnimation = vi.fn();
        listener: any;
        constructor(options: any) {
          this.id = options.title;
          Object.assign(this, { options });
          markers.push(this);
        }
        addListener(_event: string, fn: any) {
          this.listener = fn;
        }
      },
      Animation: { BOUNCE: "bounce" },
      geometry: { encoding: { decodePath: () => [] } },
      Polyline: class {
        options: any;
        constructor(options: any) {
          this.options = options;
          polylines.push(this);
        }
        setMap = vi.fn();
        addListener = vi.fn();
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

it("draws each leg with its saved transport method", async () => {
  const a = entry("A", "place-a"),
    b = entry("B", "place-b");
  b.data.arrival = { fromId: a.id, mode: "DRIVE", manualMinutes: 20 };
  render(
    <MapPanel
      entries={[a, b]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
      mode="WALK"
    />,
  );
  await waitFor(() =>
    expect(service.api).toHaveBeenCalledWith(
      "route",
      "trip",
      expect.objectContaining({ mode: "DRIVE" }),
    ),
  );
});

it("expanded maps keep the live Google canvas and selectable stops without the side-card heading", async () => {
  const stop = entry("Mapped stop", "place-one");
  const selected = vi.fn();
  const { container } = render(
    <MapPanel
      expanded
      entries={[stop]}
      selected=""
      onSelect={selected}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(1));
  expect(
    container.querySelector(".map-card.expanded .google-map"),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Your day, on the map" }),
  ).toBeNull();
  await act(async () => {
    markers[0].listener();
  });
  expect(selected).toHaveBeenCalledWith(stop.id);
});

it("keeps page scrolling separate from map gestures with visible zoom controls", async () => {
  render(
    <MapPanel entries={[]} selected="" onSelect={() => {}} tripId="trip" />,
  );
  await waitFor(() =>
    expect(mapOptions).toMatchObject({
      gestureHandling: "cooperative",
      zoomControl: true,
    }),
  );
});

it("draws a dashed airport connection while requesting only the ground route, with independent fit controls", async () => {
  const from = entry("MIA to BAQ", ""),
    to = entry("Arrive at BAQ", ""),
    hotel = entry("Cartagena", "");
  from.data = {
    ...from.data,
    type: "Flight",
    start: "11:25",
    lat: 25.8,
    lng: -80.3,
    flight: { arrivalId: to.id, number: "DEMO123" },
  };
  to.data = { ...to.data, start: "14:20", lat: 10.9, lng: -74.8 };
  hotel.data = {
    ...hotel.data,
    start: "17:00",
    lat: 10.4,
    lng: -75.5,
    arrival: { fromId: to.id, mode: "DRIVE" },
  };
  service.api.mockResolvedValue({ warnings: [], polyline: "ground" });
  const onSelect = vi.fn(),
    u = userEvent.setup();
  render(
    <MapPanel
      entries={[from, to, hotel]}
      selected=""
      onSelect={onSelect}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(polylines).toHaveLength(2));
  expect(service.api).toHaveBeenCalledTimes(1);
  expect(service.api).toHaveBeenCalledWith(
    "route",
    "trip",
    expect.objectContaining({
      origin: { lat: 10.9, lng: -74.8 },
      destination: { lat: 10.4, lng: -75.5 },
      mode: "DRIVE",
    }),
  );
  expect(polylines[0].options).toMatchObject({
    geodesic: true,
    strokeOpacity: 0,
    icons: [{ repeat: "14px" }],
  });
  expect(markers.map((marker) => marker.options.label)).toEqual([
    "✈",
    "✈",
    "3",
  ]);
  await u.click(screen.getByRole("button", { name: "Fit flight" }));
  expect(map.fitBounds.mock.calls.at(-1)[0].points).toEqual([
    { lat: 25.8, lng: -80.3 },
    { lat: 10.9, lng: -74.8 },
  ]);
  expect(onSelect).toHaveBeenCalledWith(from.id);
  await u.click(screen.getByRole("button", { name: "Fit local stops" }));
  expect(map.fitBounds.mock.calls.at(-1)[0].points).toEqual([
    { lat: 10.9, lng: -74.8 },
    { lat: 10.4, lng: -75.5 },
  ]);
  expect(service.api).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/2h 55m scheduled/)).toBeTruthy();
});
it("resolves an overnight flight's airport outside the visible day and does not request ground directions", async () => {
  const from = entry("Overnight flight", "departure"),
    to = entry("Arrival airport", "arrival");
  from.data = {
    ...from.data,
    type: "Flight",
    flight: { arrivalId: to.id },
    start: "23:00",
  };
  to.data = {
    ...to.data,
    date: "2026-10-29",
    endDate: "2026-10-29",
    start: "02:00",
  };
  render(
    <MapPanel
      entries={[from]}
      contextEntries={[from, to]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(polylines).toHaveLength(1));
  expect(markers).toHaveLength(2);
  expect(service.api.mock.calls.every((call) => call[0] === "place")).toBe(
    true,
  );
  expect(screen.getByText(/2026-10-29.*3h 0m scheduled/)).toBeTruthy();
});
it("does not guess a destination or fall back to walking for an unlinked flight", async () => {
  const from = entry("Flight", "origin"),
    to = entry("Next stop", "next");
  from.data.type = "Flight";
  render(
    <MapPanel
      entries={[from, to]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(2));
  expect(service.api.mock.calls.some((call) => call[0] === "route")).toBe(
    false,
  );
  expect(
    screen.getByText(/Link the flight’s arrival-airport stop/),
  ).toBeTruthy();
});
it("does not draw ground routes across dates or bridge over an unresolved intermediate stop", async () => {
  const a = entry("A", "one"),
    b = entry("B", "missing"),
    c = entry("C", "three"),
    d = entry("Tomorrow", "four");
  d.data.date = "2026-10-29";
  render(
    <MapPanel
      entries={[a, b, c, d]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(3));
  expect(service.api.mock.calls.some((call) => call[0] === "route")).toBe(
    false,
  );
});

it("does not route backwards across an explicitly linked flight when activity order needs review", async () => {
  const from = entry("Departure", "origin"),
    to = entry("Arrival", "destination");
  from.data.type = "Flight";
  from.data.flight = { arrivalId: to.id };
  render(
    <MapPanel
      entries={[to, from]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(polylines).toHaveLength(1));
  expect(service.api.mock.calls.some((call) => call[0] === "route")).toBe(
    false,
  );
});
