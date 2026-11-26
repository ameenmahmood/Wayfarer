// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityDetails from "../src/ActivityDetails";
import { makeEntity, type Entry } from "../src/model";
afterEach(cleanup);
it("shows booking information, supports copying and directions, and opens editing explicitly", async () => {
  const u = userEvent.setup(),
    edit = vi.fn();
  const entity = makeEntity<Entry>("entry", "trip", {
    title: "Dinner",
    type: "Restaurant",
    date: "2026-12-26",
    endDate: "2026-12-26",
    start: "19:00",
    end: "",
    duration: 60,
    zone: "America/Bogota",
    address: "Calle 5, Salento",
    reservation: "SAL-2486",
    notes: "Window table",
    link: "",
    cost: 0,
    currency: "USD",
    fixed: false,
    order: 0,
  });
  render(
    <ActivityDetails
      entity={entity}
      entries={[entity]}
      canEdit
      onEdit={edit}
    />,
  );
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByText("Window table")).toBeTruthy();
  const href = screen
    .getByRole("link", { name: "Directions" })
    .getAttribute("href")!;
  expect(new URL(href).searchParams.get("destination")).toBe(
    "Calle 5, Salento",
  );
  await u.click(
    screen.getByRole("button", { name: "Copy booking reference for Dinner" }),
  );
  expect(await navigator.clipboard.readText()).toBe("SAL-2486");
  await u.click(screen.getByRole("button", { name: "Edit Dinner" }));
  expect(edit).toHaveBeenCalledOnce();
  cleanup();
  render(
    <ActivityDetails
      entity={entity}
      entries={[entity]}
      canEdit={false}
      onEdit={edit}
    />,
  );
  expect(screen.queryByRole("button", { name: "Edit Dinner" })).toBeNull();
});
