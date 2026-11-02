// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { applyProfiles } from "../src/profiles";
import DisplayNameForm from "../src/DisplayNameForm";
const store = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("../src/store", () => ({
  demo: false,
  userEmail: "ameen@example.test",
  setDisplayName: (name: string) => store.save(name),
}));
beforeEach(() => {
  applyProfiles([{ user_id: "owner", display_name: "Ameen" }], "owner");
  store.save.mockReset();
  store.save.mockResolvedValue(undefined);
});
afterEach(cleanup);
it("edits the linked display name without changing the sign-in email", async () => {
  const u = userEvent.setup(),
    done = vi.fn();
  render(<DisplayNameForm onDone={done} />);
  const name = screen.getByLabelText("Display name");
  expect(name).toHaveProperty("value", "Ameen");
  expect(screen.getByText(/Linked to ameen@example.test/)).toBeTruthy();
  await u.clear(name);
  await u.type(name, "Ameen M");
  await u.click(screen.getByRole("button", { name: "Save name" }));
  expect(store.save).toHaveBeenCalledWith("Ameen M");
  expect(done).toHaveBeenCalledOnce();
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "Display name saved.",
  );
});
it("shows save errors and allows retry", async () => {
  store.save.mockRejectedValueOnce(
    Error("Connect to the internet to change your account name."),
  );
  const u = userEvent.setup();
  render(<DisplayNameForm onboarding />);
  await u.click(screen.getByRole("button", { name: "Save name" }));
  await screen.findByText(/Connect to the internet/);
  await u.click(screen.getByRole("button", { name: "Save name" }));
  await screen.findByRole("status");
  expect(store.save).toHaveBeenCalledTimes(2);
});
