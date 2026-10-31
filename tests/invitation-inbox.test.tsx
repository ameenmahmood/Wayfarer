// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const server = vi.hoisted(() => ({
  rpc: vi.fn(),
  synchronize: vi.fn(),
  error: "",
}));
vi.mock("../src/store", () => ({
  supabase: { rpc: (...args: any[]) => server.rpc(...args) },
  synchronize: (...args: any[]) => server.synchronize(...args),
  get syncError() {
    return server.error;
  },
}));
import InvitationInbox from "../src/InvitationInbox";
const invitation = {
  id: "invite",
  trip_title: "NYC with friends",
  role: "editor",
  expires_at: "2028-01-01",
};
beforeEach(() => {
  server.error = "";
  server.synchronize.mockReset().mockResolvedValue(undefined);
  server.rpc
    .mockReset()
    .mockImplementation(async (name: string) => ({
      data: name === "my_trip_invitations" ? [invitation] : "trip",
      error: null,
    }));
});
afterEach(cleanup);
it("keeps a rejected invitation visible with the server's reason", async () => {
  server.rpc.mockImplementation(async (name: string) =>
    name === "my_trip_invitations"
      ? { data: [invitation], error: null }
      : {
          data: null,
          error: {
            message: "Invitation expired. Ask the owner for a new one.",
          },
        },
  );
  const joined = vi.fn();
  render(<InvitationInbox token="" onJoined={joined} />);
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Join trip" }));
  expect(await screen.findByText(/Invitation expired/)).toBeTruthy();
  expect(joined).not.toHaveBeenCalled();
});
it("retries invitation discovery after a network failure", async () => {
  server.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "Network unavailable" },
  });
  render(<InvitationInbox token="" onJoined={vi.fn()} />);
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Retry invitations" }));
  expect(await screen.findByText("NYC with friends")).toBeTruthy();
});
it("retries downloading an accepted trip without accepting or duplicating membership again", async () => {
  server.synchronize
    .mockImplementationOnce(async () => {
      server.error = "Offline";
    })
    .mockImplementation(async () => {
      server.error = "";
    });
  const joined = vi.fn();
  render(<InvitationInbox token="" onJoined={joined} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Join trip" }));
  await screen.findByText(/You joined, but your trip could not be downloaded/);
  expect(joined).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Open joined trip" }));
  await waitFor(() => expect(joined).toHaveBeenCalledWith("trip"));
  expect(
    server.rpc.mock.calls.filter(([name]) => name === "accept_trip_invitation"),
  ).toHaveLength(1);
  expect(server.synchronize).toHaveBeenCalledWith(true);
});
