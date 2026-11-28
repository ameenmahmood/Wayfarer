// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, cleanup, waitFor, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeEntity, type Entity, type Entry } from "../src/model";
const service = vi.hoisted(() => ({
  api: vi.fn<(...args: any[]) => Promise<any>>(),
}));
vi.mock("../src/store", () => ({
  demo: false,
  api: (...args: any[]) => service.api(...args),
}));
vi.stubEnv("VITE_GOOGLE_MAPS_BROWSER_KEY", "public-test-key");
import MapPanel from "../src/MapPanel";
import MapWorkspace from "../src/MapWorkspace";
import { clearTransportRouteCache } from "../src/transportRoutes";
let markers: any[], map: any, mapOptions: any, polylines: any[];
beforeEach(() => {
  clearTransportRouteCache();
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
        setOptions = vi.fn((options: any) => {
          Object.assign(this.options, options);
        });
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
      return { warnings: [], polyline: "", minutes: 45 };
    },
  );
});

it("highlights a selected transport route without requesting a new estimate", async () => {
  service.api.mockResolvedValue({
    minutes: 45,
    polyline: "ground",
    warnings: [],
  });
  const a = entry("Pickup", ""),
    b = entry("Destination", "");
  a.data.lat = 4.63;
  a.data.lng = -75.57;
  b.data.lat = 4.67;
  b.data.lng = -75.65;
  const ride = transport(a, b);
  const props = { entries: [a, b, ride], tripId: "trip", onSelect: vi.fn() };
  const { rerender } = render(<MapPanel {...props} selected="" />);
  await waitFor(() => expect(polylines).toHaveLength(1), { timeout: 2500 });
  expect(polylines[0].options.strokeWeight).toBe(3);
  rerender(<MapPanel {...props} selected={ride.id} />);
  await waitFor(() => expect(polylines[0].options.strokeWeight).toBe(6));
  expect(
    service.api.mock.calls.filter((call) => call[0] === "route"),
  ).toHaveLength(1);
});
afterEach(cleanup);
it("draws walking and driving legs with their own routes and distance labels", async () => {
  const first = entry("First", "one"),
    second = entry("Second", "two"),
    third = entry("Third", "three");
  service.api.mockImplementation(async (action, _trip, input) => {
    if (action === "place")
      return { location: { latitude: 10.4, longitude: -75.5 } };
    if (action !== "route") return {};
    const walking = input.mode === "WALK";
    return {
      minutes: input.destination.placeId === "two" ? 12 : walking ? 35 : 8,
      distanceMeters: walking ? 800 : 2400,
      polyline: walking ? "walking" : "driving",
    };
  });
  window.google.maps.geometry.encoding.decodePath = (encoded: string) => [
    { lat: 10.4, lng: -75.5 },
    { lat: encoded === "walking" ? 10.41 : 10.42, lng: -75.51 },
  ];
  const onSelect = vi.fn();
  render(
    <MapPanel
      entries={[first, second, third]}
      selected=""
      onSelect={onSelect}
      tripId="trip"
    />,
  );
  await waitFor(
    () =>
      expect(
        service.api.mock.calls.filter((call) => call[0] === "route"),
      ).toHaveLength(3),
    { timeout: 2500 },
  );
  const activePaths = () =>
    polylines.filter(
      (path) => !path.setMap.mock.calls.some((call: any[]) => call[0] === null),
    );
  await waitFor(() => expect(activePaths()).toHaveLength(2));
  expect(
    activePaths().some((path) => path.options.icons?.[0].repeat === "9px"),
  ).toBe(true);
  expect(activePaths().some((path) => path.options.strokeOpacity === 0.8)).toBe(
    true,
  );
  expect(markers.some((marker) => marker.options.label?.text === "800 m")).toBe(
    true,
  );
  expect(
    markers.some((marker) => marker.options.label?.text === "2.4 km"),
  ).toBe(true);
  activePaths()[0].addListener.mock.calls.find(
    (call: any[]) => call[0] === "click",
  )[1]();
  expect(onSelect).toHaveBeenCalledWith(second.id);
});
it("does not construct a map or fetch places before owner approval", async () => {
  service.api.mockRejectedValue(
    Error("The site owner must approve your account."),
  );
  render(
    <MapPanel
      entries={[entry("Stop", "one")]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await screen.findByText("The site owner must approve your account.");
  expect(mapOptions).toBeUndefined();
  expect(service.api).toHaveBeenCalledTimes(1);
  expect(service.api).toHaveBeenCalledWith("map", "trip");
});
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
function transport(from: Entity<Entry>, to: Entity<Entry>) {
  const ride = entry("Explicit transport", "");
  ride.data.type = "Transportation";
  ride.data.transport = {
    method: "car",
    from: { entryId: from.id, label: from.data.title },
    to: { entryId: to.id, label: to.data.title },
  };
  return ride;
}
it("caches automatic routes for ordinary places across note edits and selection", async () => {
  const entries = [entry("First", "one"), entry("Second", "two")];
  const { rerender } = render(
    <MapPanel
      entries={entries}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(2));
  await waitFor(() => expect(service.api).toHaveBeenCalledTimes(5), {
    timeout: 2500,
  });
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
  expect(service.api).toHaveBeenCalledTimes(5);
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
  await waitFor(() => expect(service.api).toHaveBeenCalledTimes(5), {
    timeout: 2500,
  });
  expect(
    service.api.mock.calls.filter((call) => call[0] === "place"),
  ).toHaveLength(2);
  expect(
    service.api.mock.calls.filter((call) => call[0] === "route"),
  ).toHaveLength(2);
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
it("adding an ordinary location only looks up its pin, without requesting routes", async () => {
  const entries = [entry("First", "one"), entry("Second", "two")];
  const { rerender } = render(
    <MapPanel
      entries={entries}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(2));
  rerender(
    <MapPanel
      entries={[...entries, entry("Third", "three")]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() =>
    expect(
      service.api.mock.calls.filter((call) => call[0] === "place"),
    ).toHaveLength(3),
  );
  expect(
    service.api.mock.calls
      .filter((call) => call[0] === "place")
      .map((call) => call[2].placeId),
  ).toEqual(["one", "two", "three"]);
  await waitFor(() =>
    expect(
      service.api.mock.calls.filter((call) => call[0] === "route"),
    ).toHaveLength(0),
  );
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
  expect(service.api).toHaveBeenCalledTimes(3);
});

it("draws only the explicit transport journey with its own method", async () => {
  const a = entry("A", "place-a"),
    b = entry("B", "place-b");
  b.data.arrival = { fromId: a.id, mode: "DRIVE", manualMinutes: 20 };
  const ride = transport(a, b);
  const { rerender } = render(
    <MapPanel
      entries={[a, b, ride]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
      mode="WALK"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(2));
  await waitFor(() =>
    expect(service.api).toHaveBeenCalledWith(
      "route",
      "trip",
      expect.objectContaining({ mode: "DRIVE" }),
    ),
  );
  const directions = new URL(
    screen
      .getByRole("link", { name: "Open Google Maps directions" })
      .getAttribute("href")!,
  );
  expect(directions.searchParams.get("origin_place_id")).toBe("place-a");
  expect(directions.searchParams.get("destination_place_id")).toBe("place-b");
  expect(directions.searchParams.get("travelmode")).toBe("driving");
  rerender(
    <MapPanel
      entries={[
        b,
        ride,
        { ...a, data: { ...a.data, title: "Renamed pickup" } },
      ]}
      selected={ride.id}
      onSelect={() => {}}
      tripId="trip"
      mode="TRANSIT"
    />,
  );
  await waitFor(() =>
    expect(
      markers.some(
        (marker) =>
          marker.options.title === "Renamed pickup" ||
          marker.setTitle.mock.calls.some(
            (call: any[]) => call[0] === "Renamed pickup",
          ),
      ),
    ).toBe(true),
  );
  expect(
    service.api.mock.calls.filter((call) => call[0] === "route"),
  ).toHaveLength(1);
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

it("draws a dashed airport connection while requesting only the ground route, with automatic bounds", async () => {
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
  const ride = transport(to, hotel);
  service.api.mockResolvedValue({
    warnings: [],
    polyline: "ground",
    minutes: 45,
  });
  const onSelect = vi.fn();
  render(
    <MapPanel
      expanded
      entries={[from, to, hotel, ride]}
      selected=""
      onSelect={onSelect}
      tripId="trip"
    />,
  );
  await waitFor(
    () =>
      expect(
        polylines.filter(
          (path) =>
            !path.setMap.mock.calls.some((call: any[]) => call[0] === null),
        ),
      ).toHaveLength(2),
    { timeout: 3000 },
  );
  expect(service.api).toHaveBeenCalledTimes(2);
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
  expect(markers.slice(-3).map((marker) => marker.options.label)).toEqual([
    "✈",
    "✈",
    "3",
  ]);
  expect(map.fitBounds.mock.calls.at(-1)[0].points).toEqual([
    { lat: 25.8, lng: -80.3 },
    { lat: 10.9, lng: -74.8 },
    { lat: 10.4, lng: -75.5 },
  ]);
  markers[0].listener();
  expect(onSelect).toHaveBeenCalledWith(from.id);
  expect(screen.queryByRole("button", { name: "Fit map" })).toBeNull();
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
  expect(
    service.api.mock.calls.every(
      (call) => call[0] === "place" || call[0] === "map",
    ),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Fit flight" })).toBeNull();
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
    screen.queryByText(/Link the flight’s arrival-airport stop/),
  ).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Route alerts (1)" }));
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

it("focused maps keep route warnings on demand and close information with Escape", async () => {
  const a = entry("A", "one"),
    b = entry("B", "two");
  const ride = transport(a, b);
  service.api.mockImplementation(async (action) =>
    action === "place"
      ? { location: { latitude: 40.75, longitude: -73.98 } }
      : { warnings: ["This route has tolls."], polyline: "", minutes: 45 },
  );
  const u = userEvent.setup();
  render(
    <MapPanel
      expanded
      entries={[a, b, ride]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(2));
  const notes = await screen.findByRole(
    "button",
    { name: "Route notes (1)" },
    { timeout: 3000 },
  );
  expect(screen.queryByText("This route has tolls.")).toBeNull();
  await u.click(notes);
  expect(screen.getByText("This route has tolls.")).toBeTruthy();
  await u.keyboard("{Escape}");
  expect(screen.queryByText("This route has tolls.")).toBeNull();
  expect(document.activeElement).toBe(notes);
});
it("focused flight maps omit fit controls and stacked flight panels", async () => {
  const a = entry("Flight", "origin"),
    b = entry("Arrival", "destination");
  a.data.type = "Flight";
  a.data.flight = { arrivalId: b.id };
  const { container } = render(
    <MapPanel
      expanded
      entries={[a, b]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  await waitFor(() => expect(polylines).toHaveLength(1));
  expect(container.querySelector(".flight-map-tools")).toBeNull();
  expect(screen.queryByRole("button", { name: "Fit flight" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Fit map" })).toBeNull();
  expect(service.api.mock.calls.some((call) => call[0] === "route")).toBe(
    false,
  );
});

it("keeps the small itinerary map free of flight selectors, fit buttons, and duplicate schedule summaries", async () => {
  const a = entry("Flight", "origin"),
    b = entry("Arrival", "destination");
  a.data.type = "Flight";
  a.data.flight = { arrivalId: b.id };
  const { container } = render(
    <MapPanel entries={[a, b]} selected="" onSelect={() => {}} tripId="trip" />,
  );
  await waitFor(() => expect(polylines).toHaveLength(1));
  expect(container.querySelector(".flight-map-tools")).toBeNull();
  expect(screen.queryByRole("button", { name: "Fit map" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Fit flight" })).toBeNull();
  expect(screen.queryByText(/scheduled/)).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Your day, on the map" }),
  ).toBeNull();
  expect(screen.queryByText(/Planned airport connection/)).toBeNull();
  expect(screen.getByText("Flight connection")).toBeTruthy();
  expect(screen.getByText("Ground route")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Open Google Maps directions" }),
  ).toBeTruthy();
});

it("keeps compact-map warnings behind an alert control, supports dismissal, and clears old alerts", async () => {
  const a = entry("A", "one"),
    b = entry("B", "two");
  const ride = transport(a, b);
  service.api.mockImplementation(async (action) =>
    action === "place"
      ? { location: { latitude: 40.75, longitude: -73.98 } }
      : { warnings: ["This route has tolls."], polyline: "", minutes: 45 },
  );
  const u = userEvent.setup();
  const { rerender } = render(
    <MapPanel
      entries={[a, b, ride]}
      selected=""
      onSelect={() => {}}
      tripId="trip"
    />,
  );
  const alerts = await screen.findByRole(
    "button",
    {
      name: "Route alerts (1)",
    },
    { timeout: 3000 },
  );
  expect(alerts.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("This route has tolls.")).toBeNull();
  await u.click(alerts);
  expect(screen.getByText("This route has tolls.")).toBeTruthy();
  await u.keyboard("{Escape}");
  expect(screen.queryByText("This route has tolls.")).toBeNull();
  expect(document.activeElement).toBe(alerts);
  await u.click(alerts);
  await u.click(document.body);
  expect(screen.queryByText("This route has tolls.")).toBeNull();
  rerender(
    <MapPanel entries={[a]} selected="" onSelect={() => {}} tripId="trip" />,
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /Route alerts/ })).toBeNull(),
  );
});

it("shows standalone transport endpoints in the dedicated map without a false empty-state message", async () => {
  const ride = entry("Airport transfer", "");
  ride.data.type = "Transportation";
  ride.data.transport = {
    method: "car",
    manualMinutes: 45,
    from: { label: "Airport", lat: 10.9, lng: -74.8 },
    to: { label: "Hotel", lat: 10.4, lng: -75.5 },
  };
  render(
    <MapWorkspace
      entries={[ride]}
      contextEntries={[ride]}
      tripId="trip"
      date={ride.data.date}
      dates={[ride.data.date]}
      view="day"
      selected={ride.id}
      mode="WALK"
      canEdit={false}
      onDate={() => {}}
      onView={() => {}}
      onSelect={() => {}}
      onEdit={() => {}}
    />,
  );
  await waitFor(() => expect(markers).toHaveLength(2));
  expect(screen.queryByText(/No mapped stops in this view/)).toBeNull();
  expect(screen.getByText(/Airport → Hotel/)).toBeTruthy();
  expect(
    service.api.mock.calls.filter((call) => call[0] === "route"),
  ).toHaveLength(0);
});
