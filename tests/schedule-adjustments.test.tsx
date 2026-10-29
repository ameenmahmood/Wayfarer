// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeEntity, type Entry } from "../src/model";
const service = vi.hoisted(() => ({
  all: vi.fn(),
  saveBatch: vi.fn(),
  api: vi.fn(),
}));
vi.mock("../src/store", () => ({
  demo: false,
  all: () => service.all(),
  saveBatch: (...args: any[]) => service.saveBatch(...args),
  api: (...args: any[]) => service.api(...args),
}));
import ScheduleAdjustments from "../src/ScheduleAdjustments";
const date = "2027-04-12";
function entries() {
  const base: Entry = {
    title: "Coffee",
    type: "Activity",
    date,
    endDate: date,
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
    placeId: "coffee",
  };
  const a = { ...makeEntity("entry", "trip", base), id: "A" };
  const b = {
    ...makeEntity("entry", "trip", {
      ...base,
      title: "Park",
      start: "10:15",
      order: 1,
      placeId: "park",
      arrival: { fromId: "A", mode: "WALK", manualMinutes: 15 },
    }),
    id: "B",
  };
  return [a, b];
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("previews duration changes without saving, cancels, and applies only on acceptance", async () => {
  const rows = entries(),
    done = vi.fn();
  service.all.mockResolvedValue(rows);
  service.saveBatch.mockResolvedValue([]);
  const u = userEvent.setup();
  render(
    <ScheduleAdjustments
      entries={rows}
      date={date}
      mode="WALK"
      canEdit
      onDone={done}
    />,
  );
  fireEvent.change(screen.getByLabelText("Activity duration · minutes"), {
    target: { value: "90" },
  });
  expect(screen.getByText("10:45 AM · 60 min")).toBeTruthy();
  expect(service.saveBatch).not.toHaveBeenCalled();
  await u.click(screen.getByRole("button", { name: "Cancel" }));
  expect(done).toHaveBeenCalledOnce();
  expect(service.saveBatch).not.toHaveBeenCalled();
  await u.click(screen.getByRole("button", { name: "Apply 2 changes" }));
  await waitFor(() => expect(service.saveBatch).toHaveBeenCalledOnce());
  expect(
    service.saveBatch.mock.calls[0][0].map((e: any) => e.data.start),
  ).toEqual(["09:00", "10:45"]);
});
it("disables applying conflicts and prevents stale previews from overwriting concurrent changes", async () => {
  const rows = entries(),
    u = userEvent.setup();
  const { rerender } = render(
    <ScheduleAdjustments
      entries={rows}
      date={date}
      mode="WALK"
      canEdit
      onDone={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Activity duration · minutes"), {
    target: { value: "90" },
  });
  const changed = [
    rows[0],
    { ...rows[1], version: 2, data: { ...rows[1].data, start: "11:00" } },
  ];
  rerender(
    <ScheduleAdjustments
      entries={changed}
      date={date}
      mode="WALK"
      canEdit
      onDone={() => {}}
    />,
  );
  expect(screen.getByText(/This day changed since/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Apply 2 changes",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await u.click(screen.getByRole("button", { name: "Refresh preview" }));
  expect(screen.queryByText(/This day changed since/)).toBeNull();
  expect(service.saveBatch).not.toHaveBeenCalled();
});
it("fetches route estimates at proposed departure times and keeps Google estimates out of saved entries", async () => {
  const rows = entries();
  rows[1].data.arrival = undefined as any;
  service.all.mockResolvedValue(rows);
  service.api.mockResolvedValue({ minutes: 30, warnings: [] });
  service.saveBatch.mockResolvedValue([]);
  const u = userEvent.setup();
  render(
    <ScheduleAdjustments
      entries={rows}
      date={date}
      mode="WALK"
      canEdit
      onDone={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Activity duration · minutes"), {
    target: { value: "90" },
  });
  expect(screen.getByText(/Travel time unavailable/)).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Fetch travel estimates" }));
  await screen.findByText("30 min · Google Maps estimate");
  expect(service.api).toHaveBeenCalledWith(
    "route",
    "trip",
    expect.objectContaining({
      departure: "2027-04-12T14:30:00.000Z",
      mode: "WALK",
    }),
  );
  await u.click(screen.getByRole("button", { name: "Apply 2 changes" }));
  await waitFor(() => expect(service.saveBatch).toHaveBeenCalledOnce());
  expect(service.saveBatch.mock.calls[0][0][1].data.arrival).toBeUndefined();
  expect(service.saveBatch.mock.calls[0][0][1].data.start).toBe("11:00");
});
it("rejects a change found at apply time and keeps viewer controls protected", async () => {
  const rows = entries();
  service.all.mockResolvedValue([rows[0], { ...rows[1], version: 3 }]);
  const u = userEvent.setup();
  const { rerender } = render(
    <ScheduleAdjustments
      entries={rows}
      date={date}
      mode="WALK"
      canEdit
      onDone={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Activity duration · minutes"), {
    target: { value: "90" },
  });
  await u.click(screen.getByRole("button", { name: "Apply 2 changes" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "This day changed",
  );
  expect(service.saveBatch).not.toHaveBeenCalled();
  rerender(
    <ScheduleAdjustments
      entries={rows}
      date={date}
      mode="WALK"
      canEdit={false}
      onDone={() => {}}
    />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Apply 2 changes",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
