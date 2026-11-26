// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "@testing-library/react";
import { makeEntity, type Entry } from "../src/model";
const service = vi.hoisted(() => ({ api: vi.fn(), save: vi.fn() }));
vi.mock("../src/store", () => ({
  demo: false,
  api: (...args: any[]) => service.api(...args),
  save: (...args: any[]) => service.save(...args),
}));
import TransportEditor from "../src/TransportEditor";
import { clearTransportRouteCache } from "../src/transportRoutes";
function stop(title: string, lat: number) {
  return makeEntity<Entry>("entry", "transport-editor-trip", {
    title,
    type: "Activity",
    date: "2026-12-26",
    endDate: "2026-12-26",
    start: "09:00",
    end: "",
    duration: 60,
    zone: "America/Bogota",
    address: "",
    notes: "Keep notes",
    link: "",
    reservation: "Keep booking",
    cost: 500,
    currency: "USD",
    fixed: true,
    order: 0,
    lat,
    lng: -75.6,
  });
}
let from: ReturnType<typeof stop>,
  to: ReturnType<typeof stop>,
  ride: ReturnType<typeof stop>;
beforeEach(() => {
  clearTransportRouteCache();
  service.api
    .mockReset()
    .mockResolvedValue({ minutes: 45, polyline: "route", warnings: [] });
  service.save.mockReset().mockImplementation(async (entry) => entry);
  from = stop("Salento", 4.63);
  to = stop("Filandia", 4.67);
  ride = stop("Salento to Filandia Transport", 4.63);
  ride.data.type = "Transportation";
  ride.data.transport = {
    method: "taxi",
    from: { entryId: from.id, label: "Salento" },
    to: { entryId: to.id, label: "Filandia" },
  };
});
afterEach(() => {
  cleanup();
  clearTransportRouteCache();
});
it("automatically estimates a configured journey, ignores note edits, and saves without moving other plans", async () => {
  const u = userEvent.setup(),
    done = vi.fn();
  render(
    <TransportEditor
      entity={ride}
      entries={[from, to, ride]}
      canEdit
      onDone={done}
    />,
  );
  await screen.findByText("45 min estimated", {}, { timeout: 2500 });
  expect(screen.getByText("Arrive ~9:45 AM")).toBeTruthy();
  expect(service.api).toHaveBeenCalledWith(
    "route",
    ride.tripId,
    expect.objectContaining({
      mode: "DRIVE",
      departure: "2026-12-26T14:00:00.000Z",
    }),
  );
  await u.click(screen.getByText("More details"));
  await u.type(screen.getByLabelText("Travel notes"), " added");
  expect(service.api).toHaveBeenCalledTimes(1);
  await u.selectOptions(screen.getByLabelText("Pickup time hour"), "10");
  await screen.findByText("Arrive ~10:45 AM", {}, { timeout: 2500 });
  await u.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(done).toHaveBeenCalled());
  const saved = service.save.mock.calls[0][0];
  expect(saved.id).toBe(ride.id);
  expect(saved.data.start).toBe("10:00");
  expect(saved.data.duration).toBe(60); // Provider results are not persisted as user-entered data.
  expect(saved.data.reservation).toBe("Keep booking");
  expect(saved.data.cost).toBe(500);
  expect(saved.data.notes).toBe("Keep notes added");
  expect(to.data.start).toBe("09:00");
  expect(service.save).toHaveBeenCalledTimes(1);
});
it("keeps manual journeys offline-capable, preserves booked arrival, and cancels without saving", async () => {
  ride.data.transport!.manualMinutes = 35;
  ride.data.end = "10:15";
  const u = userEvent.setup(),
    done = vi.fn();
  render(
    <TransportEditor
      entity={ride}
      entries={[from, to, ride]}
      canEdit
      onDone={done}
    />,
  );
  expect(screen.getByText("35 min manual")).toBeTruthy();
  expect(service.api).not.toHaveBeenCalled();
  await u.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(service.save).toHaveBeenCalled());
  expect(service.save.mock.calls[0][0].data.end).toBe("10:15");
  cleanup();
  service.save.mockClear();
  done.mockClear();
  render(
    <TransportEditor
      entity={ride}
      entries={[from, to, ride]}
      canEdit
      onDone={done}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Cancel" }));
  expect(done).toHaveBeenCalled();
  expect(service.save).not.toHaveBeenCalled();
});
it("does not estimate incomplete journeys and does not expose save controls to viewers", async () => {
  ride.data.transport!.to = undefined;
  const u = userEvent.setup();
  const { rerender } = render(
    <TransportEditor
      entity={ride}
      entries={[from, to, ride]}
      canEdit
      onDone={() => {}}
    />,
  );
  await u.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(service.api).not.toHaveBeenCalled();
  expect(service.save).not.toHaveBeenCalled();
  rerender(
    <TransportEditor
      entity={ride}
      entries={[from, to, ride]}
      canEdit={false}
      onDone={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  expect(screen.queryByLabelText("Pickup time hour")).toBeNull();
});

it("uses the current pickup when an older estimate finishes later", async () => {
  const responses: ((value: any) => void)[] = [];
  service.api.mockImplementation(
    () => new Promise((resolve) => responses.push(resolve)),
  );
  const u = userEvent.setup();
  render(
    <TransportEditor
      entity={ride}
      entries={[from, to, ride]}
      canEdit
      onDone={() => {}}
    />,
  );
  await waitFor(() => expect(responses).toHaveLength(1), { timeout: 2500 });
  await u.selectOptions(screen.getByLabelText("Pickup time hour"), "10");
  await waitFor(() => expect(responses).toHaveLength(2), { timeout: 2500 });
  await act(async () => responses[1]({ minutes: 20, warnings: [] }));
  expect(await screen.findByText("Arrive ~10:20 AM")).toBeTruthy();
  await act(async () => responses[0]({ minutes: 90, warnings: [] }));
  expect(screen.getByText("Arrive ~10:20 AM")).toBeTruthy();
  expect(screen.queryByText("Arrive ~10:30 AM")).toBeNull();
});

it("offers a manual duration after a route failure without pretending an estimate succeeded", async () => {
  service.api.mockRejectedValue(Error("No transit service for this time."));
  const u = userEvent.setup();
  render(
    <TransportEditor
      entity={ride}
      entries={[from, to, ride]}
      canEdit
      onDone={() => {}}
    />,
  );
  await screen.findByText(
    "No transit service for this time.",
    {},
    { timeout: 2500 },
  );
  expect(screen.queryByText(/min estimated/)).toBeNull();
  await u.click(screen.getByRole("button", { name: "Enter duration instead" }));
  expect(screen.getByText("1:00 hours manual")).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(service.save).toHaveBeenCalled());
  expect(service.save.mock.calls[0][0].data.transport.manualMinutes).toBe(60);
  expect(service.api).toHaveBeenCalledTimes(1);
});

it("retains legacy bookings inside More details without recalculating an implicit leg", async () => {
  ride.data.transport!.manualMinutes = 45;
  ride.data.arrival = {
    fromId: from.id,
    mode: "DRIVE",
    manualMinutes: 35,
    booking: {
      title: "Taxi with Carlos",
      transport: "Taxi",
      status: "Booked",
      company: "Carlos",
      meetingPoint: "Lobby",
      reference: "ABC",
      contact: "Driver",
      notes: "Keep booking",
      pickup: { date: ride.data.date, time: "09:00" },
    },
  };
  const u = userEvent.setup();
  render(
    <TransportEditor
      entity={ride}
      entries={[from, to, ride]}
      canEdit
      onDone={() => {}}
    />,
  );
  await u.click(screen.getByText("More details"));
  await u.click(screen.getByText("Saved travel details"));
  expect(screen.getByText(/Taxi with Carlos/)).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(service.save).toHaveBeenCalled());
  expect(service.save.mock.calls[0][0].data.arrival).toEqual(ride.data.arrival);
  expect(service.api).not.toHaveBeenCalled();
});

it("deduplicates the same journey when multiple consumers need its estimate", async () => {
  render(
    <>
      <TransportEditor
        entity={ride}
        entries={[from, to, ride]}
        canEdit
        onDone={() => {}}
      />
      <TransportEditor
        entity={ride}
        entries={[from, to, ride]}
        canEdit={false}
        onDone={() => {}}
      />
    </>,
  );
  await waitFor(
    () => expect(screen.getAllByText("45 min estimated")).toHaveLength(2),
    { timeout: 2500 },
  );
  expect(service.api).toHaveBeenCalledTimes(1);
});
