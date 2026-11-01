// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import Ideas from "../src/Ideas";
import { seed } from "../src/seed";
import { makeEntity, type Idea, type Trip } from "../src/model";

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

it("creates, filters and edits ideas, then reviews and adds one on the selected day", async () => {
  const u = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Add a plan" }, { timeout: 5000 });
  await u.click(screen.getByRole("button", { name: "Ideas" }));
  await u.click(await screen.findByRole("button", { name: "Add an idea" }));
  let d = within(screen.getByRole("dialog"));
  await u.type(d.getByLabelText("Title"), "Kyoto riverside stay");
  await u.selectOptions(d.getByLabelText("Category"), "Hotel");
  await u.type(
    d.getByLabelText("Notes (optional)"),
    "Check cancellation terms",
  );
  await u.click(d.getByRole("button", { name: "Save idea" }));
  await screen.findByRole("heading", { name: "Kyoto riverside stay" });
  await u.click(screen.getByRole("button", { name: /^Passed/ }));
  expect(
    screen.queryByRole("heading", { name: "Kyoto riverside stay" }),
  ).toBeNull();
  await u.click(screen.getByRole("button", { name: /^Considering/ }));
  await u.click(
    screen.getByRole("button", { name: "Edit idea Kyoto riverside stay" }),
  );
  d = within(screen.getByRole("dialog"));
  await u.selectOptions(d.getByLabelText("Status"), "Approved");
  await u.click(d.getByRole("button", { name: "Save idea" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await u.click(screen.getByRole("button", { name: /^Approved/ }));
  await u.click(screen.getByRole("button", { name: "Add to itinerary" }));
  d = within(screen.getByRole("dialog"));
  expect(d.getByLabelText("Type")).toHaveProperty("value", "Lodging");
  await u.clear(d.getByLabelText("Date (empty = saved place)"));
  await u.type(d.getByLabelText("Date (empty = saved place)"), "2027-04-14");
  await u.click(d.getByRole("button", { name: "Save to itinerary" }));
  await screen.findByRole("heading", { name: "Wednesday, April 14" });
  expect(
    screen.getByRole("heading", { name: "Kyoto riverside stay" }),
  ).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Ideas" }));
  await screen.findByRole("button", { name: "View in itinerary" });
  expect(screen.queryByRole("button", { name: "Add to itinerary" })).toBeNull();
  await u.click(
    screen.getByRole("button", { name: "Delete idea Kyoto riverside stay" }),
  );
  await u.click(screen.getByRole("button", { name: "Keep idea" }));
  expect(
    screen.getByRole("heading", { name: "Kyoto riverside stay" }),
  ).toBeTruthy();
  await u.click(
    screen.getByRole("button", { name: "Delete idea Kyoto riverside stay" }),
  );
  await u.click(screen.getByRole("button", { name: "Remove idea" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Kyoto riverside stay" }),
    ).toBeNull(),
  );
  await u.click(screen.getByRole("button", { name: "Itinerary" }));
  expect(
    await screen.findByRole("heading", { name: "Kyoto riverside stay" }),
  ).toBeTruthy();
});

it("viewers can filter and open references but cannot change ideas or schedule them", async () => {
  const idea = makeEntity<Idea>("idea", "demo-japan", {
    title: "Train option",
    category: "Transport",
    status: "Considering",
    currency: "USD",
    notes: "",
    location: "",
    link: "https://example.com",
  });
  render(
    <Ideas
      trip={seed()[0].data as Trip}
      tripId="demo-japan"
      ideas={[idea]}
      entries={[]}
      canEdit={false}
      onViewEntry={() => {}}
    />,
  );
  expect(screen.getByRole("heading", { name: "Train option" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open reference" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add an idea" })).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: /Edit idea|Delete idea|Add to itinerary/,
    }),
  ).toBeNull();
  await userEvent.selectOptions(
    screen.getByLabelText("Filter ideas by category"),
    "Hotel",
  );
  expect(screen.queryByRole("heading", { name: "Train option" })).toBeNull();
});
