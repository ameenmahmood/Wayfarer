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

it("manual itinerary editing, duplication and removal work, while unavailable AI is explained", async () => {
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
  await u.click(screen.getByRole("button", { name: "Explore activity ideas" }));
  expect(
    (
      dialog().getByRole("button", {
        name: "Suggest activities",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    dialog().getByText(/Configure the backend and AI provider/),
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
  await screen.findByRole("heading", { name: "Every place, in one view" });
  expect(
    screen.getByRole("button", { name: /^DAY 2/ }).getAttribute("aria-pressed"),
  ).toBe("true");
  await u.click(screen.getByRole("button", { name: "Itinerary" }));
  await screen.findByRole("heading", { name: "A plan with room to wander" });
  expect(
    screen.getByRole("button", { name: /^DAY 2/ }).getAttribute("aria-pressed"),
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
