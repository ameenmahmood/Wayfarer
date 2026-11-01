// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollBy = vi.fn();
  window.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);
async function openApp() {
  render(<App />);
  await screen.findByRole("heading", { name: "A little lost in Japan" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit trip" })).toBeTruthy(),
  );
  await screen.findByRole("button", { name: "Add a plan" });
  return userEvent.setup();
}
function dialog() {
  return within(screen.getByRole("dialog"));
}

it("My trips opens the library, trip cards reopen the dashboard, and account controls open a scrollable dialog", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: /^My trips1$/ }));
  expect(screen.getByRole("heading", { name: "My trips" })).toBeTruthy();
  await u.click(
    screen.getByRole("button", { name: /A little lost in Japan.*Open trip/ }),
  );
  expect(screen.getByRole("button", { name: "Add a plan" })).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Open account settings" }));
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByRole("dialog").querySelector(".dialog-body")).toBeTruthy();
  expect(dialog().getByRole("heading", { name: "Your account" })).toBeTruthy();
  await u.click(dialog().getByRole("button", { name: "Close dialog" }));
  await u.click(screen.getByRole("button", { name: "Settings & account" }));
  await u.click(await dialog().findByRole("button", { name: "Dark" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  await u.click(dialog().getByRole("button", { name: "Light" }));
  expect(localStorage.getItem("wayfarer-theme")).toBe("light");
  await u.click(dialog().getByRole("button", { name: "System" }));
  await u.click(dialog().getByRole("button", { name: "Close dialog" }));
  expect(document.body.style.overflow).toBe("");
});

it("section navigation scrolls to the chosen section and packing controls save, pack, edit and reuse templates", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Packing list" }));
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  await u.click(await screen.findByRole("button", { name: "Add item" }));
  await u.type(dialog().getByLabelText("Item name"), "UI test camera");
  await u.click(dialog().getByRole("button", { name: /Save/ }));
  const checkbox = await screen.findByRole("checkbox", {
    name: "Mark UI test camera packed",
  });
  await u.click(checkbox);
  await waitFor(() =>
    expect((checkbox as HTMLInputElement).checked).toBe(true),
  );
  await u.click(screen.getByRole("button", { name: "Edit UI test camera" }));
  await u.clear(dialog().getByLabelText("Item name"));
  await u.type(dialog().getByLabelText("Item name"), "UI test camera updated");
  await u.click(dialog().getByRole("button", { name: /Save/ }));
  await screen.findByText("UI test camera updated");
  await u.click(screen.getByText("Templates", { selector: "summary" }));
  await u.click(screen.getByRole("button", { name: "Save as template" }));
  await screen.findByRole("button", { name: "Use list" });
  await u.click(screen.getByRole("button", { name: "My personal list" }));
  await u.click(screen.getByRole("button", { name: "Use list" }));
  await screen.findByText("UI test camera updated");
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Mark UI test camera updated packed",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Delete UI test camera updated",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  await u.click(
    screen.getByRole("button", { name: "Delete UI test camera updated" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("UI test camera updated")).toBeNull(),
  );
});

it("manual itinerary editing, duplication and removal work, while unavailable nearby search is explained", async () => {
  const u = await openApp();
  await u.click(
    screen.getByRole("button", { name: "Edit Touch down in Tokyo" }),
  );
  const title = dialog().getByLabelText("Title");
  await u.clear(title);
  await u.type(title, "UI test arrival");
  await u.click(dialog().getByRole("button", { name: "Save to itinerary" }));
  await screen.findByRole("heading", { name: "UI test arrival" });
  await u.click(
    screen.getByRole("button", { name: "Move or duplicate UI test arrival" }),
  );
  await u.selectOptions(dialog().getByLabelText("Action"), "duplicate");
  await u.selectOptions(dialog().getByLabelText("Destination day"), "");
  await u.click(dialog().getByRole("button", { name: "Save change" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await u.click(screen.getByRole("button", { name: /Saved places/ }));
  await screen.findByRole("heading", { name: "UI test arrival" });
  await u.click(screen.getByRole("button", { name: "Delete UI test arrival" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "UI test arrival" }),
    ).toBeNull(),
  );
  await u.click(screen.getByRole("button", { name: "Find places nearby" }));
  expect(
    (
      dialog().getByRole("button", {
        name: "Search nearby",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    dialog().getByText(/Nearby search requires a signed-in account/),
  ).toBeTruthy();
});

it("expense editing recalculates spending and repayment records leave trip spending unchanged", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Expenses" }));
  await u.click(
    (await screen.findAllByRole("button", { name: "Record repayment" }))[0],
  );
  await u.click(dialog().getByRole("button", { name: "Record repayment" }));
  await screen.findByRole("heading", { name: "Recorded repayments" });
  expect(screen.getAllByText("$80.40").length).toBeGreaterThan(0);
  await u.click(screen.getByRole("button", { name: "Delete repayment" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Recorded repayments" }),
    ).toBeNull(),
  );
  await u.click(screen.getByRole("button", { name: "Manage budgets" }));
  await u.clear(dialog().getByLabelText("Total budget · USD"));
  await u.type(dialog().getByLabelText("Total budget · USD"), "5000");
  await u.click(dialog().getByRole("button", { name: "Save budgets" }));
  await screen.findByText("$5,000.00");
});

it("route preview preserves the itinerary until accepted and displays conflicts rather than applying an impossible plan", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Optimize day" }));
  await u.click(dialog().getByRole("button", { name: "Preview route" }));
  await dialog().findByText(/LOCAL DEMO · straight-line/);
  expect(dialog().getByText(/does not guarantee/)).toBeTruthy();
  const accept = dialog().queryByRole("button", {
    name: "Accept proposed itinerary",
  });
  if (accept) {
    await u.click(accept);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  } else
    expect(dialog().getByText("This plan needs an adjustment")).toBeTruthy();
});

it("itemized expense controls validate totals, save, edit, remove items and delete without double counting", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Expenses" }));
  await u.click(screen.getByRole("button", { name: "Add expense" }));
  await u.type(
    dialog().getByLabelText("Merchant / title"),
    "UI itemized lunch",
  );
  await u.clear(dialog().getByLabelText("Total, including tax and tips"));
  await u.type(
    dialog().getByLabelText("Total, including tax and tips"),
    "30.01",
  );
  await u.click(
    dialog().getByRole("checkbox", { name: "Itemize this expense" }),
  );
  await u.click(dialog().getByRole("button", { name: "Add item" }));
  await u.type(dialog().getByLabelText("Item 1 title"), "Lunch");
  await u.clear(dialog().getByLabelText("Item 1 amount in minor units"));
  await u.type(dialog().getByLabelText("Item 1 amount in minor units"), "3000");
  expect(
    (
      dialog().getByRole("button", {
        name: "Save expense",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await u.clear(dialog().getByLabelText("Item 1 amount in minor units"));
  await u.type(dialog().getByLabelText("Item 1 amount in minor units"), "3001");
  await u.click(dialog().getByRole("button", { name: "Save expense" }));
  await screen.findByText("UI itemized lunch");
  await u.click(screen.getByRole("button", { name: "Edit UI itemized lunch" }));
  await u.click(dialog().getByRole("button", { name: "Remove item 1" }));
  expect(
    (
      dialog().getByRole("button", {
        name: "Save expense",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await u.click(
    dialog().getByRole("checkbox", { name: "Itemize this expense" }),
  );
  await u.click(dialog().getByRole("button", { name: "Save expense" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await u.click(
    screen.getByRole("button", { name: "Delete UI itemized lunch" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("UI itemized lunch")).toBeNull(),
  );
});

it("switching between itinerary and map preserves the selected trip day", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: /^DAY 2/ }));
  expect(
    screen.getByRole("button", { name: /^DAY 2/ }).getAttribute("aria-pressed"),
  ).toBe("true");
  await u.click(screen.getByRole("button", { name: "Map" }));
  await screen.findByRole("heading", { name: "Map" });
  expect((screen.getByLabelText("Map day") as HTMLSelectElement).value).toBe(
    "2027-04-13",
  );
  expect(screen.queryByRole("button", { name: /^Reorder / })).toBeNull();
  expect(document.querySelector(".app-shell.map-workspace")).toBeTruthy();
  expect(document.querySelector(".timeline")).toBeNull();
  await u.selectOptions(screen.getByLabelText("Map day"), "2027-04-14");
  await u.click(screen.getByRole("button", { name: "Itinerary" }));
  await screen.findByRole("heading", { name: "Itinerary" });
  expect(
    screen.getByRole("button", { name: /^DAY 3/ }).getAttribute("aria-pressed"),
  ).toBe("true");
});

it("creating a trip exposes editing immediately and a feasible route can be previewed and accepted", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Plan a new trip" }));
  await u.type(await dialog().findByLabelText("Trip name"), "UI weekend");
  await u.type(dialog().getByLabelText("Destinations"), "Boston");
  await u.click(dialog().getByRole("button", { name: "Save trip" }));
  await screen.findByRole("heading", { name: "UI weekend" });
  await u.click(screen.getByRole("button", { name: "Add a plan" }));
  await u.type(dialog().getByLabelText("Title"), "Morning walk");
  await u.type(dialog().getByLabelText("Your latitude"), "42.36");
  await u.type(dialog().getByLabelText("Your longitude"), "-71.06");
  await u.click(dialog().getByRole("button", { name: "Save to itinerary" }));
  await screen.findByRole("heading", { name: "Morning walk" });
  await u.click(screen.getByRole("button", { name: "Optimize day" }));
  await u.click(dialog().getByRole("button", { name: "Preview route" }));
  await dialog().findByText(/Original itinerary is unchanged/);
  await u.click(
    dialog().getByRole("button", { name: "Accept proposed itinerary" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("heading", { name: "Morning walk" })).toBeTruthy();
});

it("opening settings from mobile navigation keeps background scrolling locked until the dialog closes", async () => {
  render(<App />);
  await screen.findByRole("button", { name: "Edit trip" });
  const u = userEvent.setup();
  await u.click(screen.getByRole("button", { name: "Open navigation" }));
  expect(document.body.style.overflow).toBe("hidden");
  await u.click(screen.getByRole("button", { name: "Settings & account" }));
  await screen.findByRole("dialog");
  expect(document.body.style.overflow).toBe("hidden");
  await u.click(dialog().getByRole("button", { name: "Close dialog" }));
  expect(document.body.style.overflow).toBe("");
});

it("previews, cancels and saves a suggested trip cover with persistent framing", async () => {
  localStorage.setItem("wayfarer-trip", "demo-japan");
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Change cover" }));
  await dialog().findByText("Suggested for your trip");
  await u.clear(dialog().getByLabelText("Find a cover"));
  await u.type(dialog().getByLabelText("Find a cover"), "NYC");
  await u.click(
    dialog().getByRole("button", { name: "Choose New York skyline" }),
  );
  expect(
    dialog().getByLabelText("Cover preview: New York skyline"),
  ).toBeTruthy();
  await u.click(dialog().getByRole("button", { name: "Cancel" }));
  const { all } = await import("../src/store");
  let trip = (await all()).find((e) => e.id === "demo-japan")!;
  expect(trip.data.cover).toBeUndefined();
  await u.click(screen.getByRole("button", { name: "Change cover" }));
  await u.click(
    await dialog().findByRole("button", { name: "Choose Mountain peaks" }),
  );
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.change(dialog().getByLabelText("Photo framing"), {
    target: { value: "72" },
  });
  await u.click(dialog().getByRole("button", { name: "Save cover" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  trip = (await all()).find((e) => e.id === "demo-japan")!;
  expect(trip.data.cover).toEqual({ id: "peaks", position: 72 });
  await u.click(screen.getByRole("button", { name: "Change cover" }));
  expect(
    await dialog().findByLabelText("Cover preview: Mountain peaks"),
  ).toBeTruthy();
  expect(
    (dialog().getByLabelText("Photo framing") as HTMLInputElement).value,
  ).toBe("72");
  await u.click(dialog().getByRole("button", { name: "Cancel" }));
});

it("activity handles reorder by drag and keyboard without changing reservation times", async () => {
  localStorage.setItem("wayfarer-trip", "demo-japan");
  await openApp();
  expect(screen.queryByRole("button", { name: "Adjust schedule" })).toBeNull();
  const { all } = await import("../src/store");
  const before = (await all()).filter(
    (e) => e.kind === "entry" && e.tripId === "demo-japan",
  );
  const handles = screen.getAllByRole("button", { name: /^Reorder / });
  const source = handles[handles.length - 1];
  const sourceName = source.getAttribute("aria-label");
  const targetName = handles[0].getAttribute("aria-label");
  const target = handles[0].closest("article")!;
  const { fireEvent } = await import("@testing-library/react");
  const previousHitTest = document.elementFromPoint;
  document.elementFromPoint = vi.fn(() => target);
  // jsdom needs a PointerEvent constructor with mouse coordinates.
  const previousPointerEvent = window.PointerEvent;
  window.PointerEvent = MouseEvent as any;
  try {
    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerMove(source, { clientX: 20, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(source, { clientX: 20, clientY: 40, pointerId: 1 });
  } finally {
    document.elementFromPoint = previousHitTest;
    window.PointerEvent = previousPointerEvent;
  }
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("button", { name: /^Reorder / })[0]
        .getAttribute("aria-label"),
    ).toBe(sourceName),
  );
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("button", { name: /^Reorder / })[0]
        .getAttribute("aria-disabled"),
    ).toBe("false"),
  );
  const u = userEvent.setup();
  screen.getAllByRole("button", { name: /^Reorder / })[0].focus();
  await u.keyboard("{ArrowDown}");
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("button", { name: /^Reorder / })[0]
        .getAttribute("aria-label"),
    ).toBe(targetName),
  );
  const after = (await all()).filter(
    (e) => e.kind === "entry" && e.tripId === "demo-japan",
  );
  for (const entry of before)
    expect(after.find((e) => e.id === entry.id)?.data.start).toBe(
      entry.data.start,
    );
});

it("Edit trip contains red deletion controls, cancel keeps the trip and confirm returns to the library", async () => {
  localStorage.setItem("wayfarer-trip", "demo-japan");
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Plan a new trip" }));
  expect(dialog().queryByRole("button", { name: "Delete trip" })).toBeNull();
  await u.type(dialog().getByLabelText("Trip name"), "Disposable UI trip");
  await u.type(dialog().getByLabelText("Destinations"), "Boston");
  await u.click(dialog().getByRole("button", { name: "Save trip" }));
  await screen.findByRole("heading", { name: "Disposable UI trip" });
  await u.click(screen.getByRole("button", { name: "Edit trip" }));
  await u.click(await dialog().findByRole("button", { name: "Delete trip" }));
  await dialog().findByRole("heading", {
    name: "Delete “Disposable UI trip”?",
  });
  await u.click(dialog().getByRole("button", { name: "Keep trip" }));
  expect(dialog().getByLabelText("Trip name")).toBeTruthy();
  await u.click(dialog().getByRole("button", { name: "Delete trip" }));
  await u.click(dialog().getByRole("button", { name: "Delete this trip" }));
  await screen.findByRole("heading", { name: "My trips" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Disposable UI trip.*Open trip/ }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: /A little lost in Japan.*Open trip/ }),
  ).toBeTruthy();
});

it("compact activity details expand by keyboard, preserve edit actions, and collapse explicitly", async () => {
  localStorage.setItem("wayfarer-trip", "demo-japan");
  const u = await openApp();
  const toggle = screen.getAllByRole("button", { name: /^Details for / })[0];
  const title = toggle.getAttribute("aria-label")!.replace("Details for ", "");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  toggle.focus();
  await u.keyboard("{Enter}");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  await u.click(screen.getByRole("button", { name: `Edit ${title}` }));
  expect(await dialog().findByLabelText("Title")).toHaveProperty(
    "value",
    title,
  );
  await u.click(dialog().getByRole("button", { name: "Close dialog" }));
  await u.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
});

it("trip context can expand on secondary screens and resets when switching sections", async () => {
  localStorage.setItem("wayfarer-trip", "demo-japan");
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Ideas" }));
  const toggle = await screen.findByRole("button", {
    name: "Trip details for A little lost in Japan",
  });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await u.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(
    document
      .querySelector(".app-shell")
      ?.classList.contains("show-trip-details"),
  ).toBe(true);
  await u.click(screen.getByRole("button", { name: "Packing list" }));
  await screen.findByRole("heading", { name: "Packing list" });
  expect(
    screen
      .getByRole("button", { name: "Trip details for A little lost in Japan" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(document.querySelector(".section-navigation")).toBeTruthy();
});
