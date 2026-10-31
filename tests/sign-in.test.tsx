// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/store", () => ({
  supabase: { auth: { signInWithOtp: (...args: any[]) => mail.send(...args) } },
}));
import SignIn from "../src/SignIn";
beforeEach(() => {
  mail.send
    .mockReset()
    .mockResolvedValue({ data: { user: null, session: null }, error: null });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("allows first-time users, normalizes their email, and makes delivery status accurate", async () => {
  render(<SignIn />);
  const u = userEvent.setup();
  await u.type(screen.getByLabelText("Email"), "NEW-FRIEND@EXAMPLE.TEST");
  await u.click(screen.getByRole("button", { name: "Email a sign-in link" }));
  await screen.findByText("Sign-in email requested");
  expect(mail.send).toHaveBeenCalledWith({
    email: "new-friend@example.test",
    options: { emailRedirectTo: expect.any(String), shouldCreateUser: true },
  });
  expect(screen.getByText(/First time here/)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Request again in/ }),
  ).toHaveProperty("disabled", true);
  await u.keyboard("{Enter}");
  expect(mail.send).toHaveBeenCalledTimes(1);
  // Resending must not leave a stale success message if the server rejects it.
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
  await screen.findByRole(
    "button",
    { name: "Send another sign-in link" },
    { timeout: 2500 },
  );
  mail.send.mockResolvedValueOnce({
    error: {
      status: 429,
      code: "over_email_send_rate_limit",
      message: "Email rate limit exceeded",
    },
  });
  await u.click(
    screen.getByRole("button", { name: "Send another sign-in link" }),
  );
  expect(await screen.findByText(/Too many email requests/)).toBeTruthy();
  expect(screen.queryByText("Sign-in email requested")).toBeNull();
  expect(
    screen.getByText("Support code: over_email_send_rate_limit"),
  ).toBeTruthy();
});
it("keeps the resend interval when the dialog is reopened", async () => {
  const u = userEvent.setup();
  const first = render(<SignIn />);
  await u.type(screen.getByLabelText("Email"), "reopen@example.test");
  await u.click(screen.getByRole("button", { name: "Email a sign-in link" }));
  await screen.findByText("Sign-in email requested");
  first.unmount();
  render(<SignIn />);
  await u.type(screen.getByLabelText("Email"), "reopen@example.test");
  expect(
    screen.getByRole("button", { name: /Request again in/ }),
  ).toHaveProperty("disabled", true);
  expect(mail.send).toHaveBeenCalledTimes(1);
});
it.each([
  ["signup_disabled", 403, /first-time accounts are disabled/],
  ["email_address_not_authorized", 403, /recipient restrictions/],
  ["unexpected_failure", 500, /could not be requested/],
])(
  "shows actionable %s failures without claiming a send",
  async (code, status, message) => {
    mail.send.mockResolvedValueOnce({
      error: {
        code,
        status,
        message: "Private server internals are not displayed",
      },
    });
    render(<SignIn />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Email"), `${code}@example.test`);
    await u.click(screen.getByRole("button", { name: "Email a sign-in link" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Sign-in email requested")).toBeNull();
    expect(screen.queryByText(/Private server internals/)).toBeNull();
  },
);
it("does not send while offline", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<SignIn />);
  const u = userEvent.setup();
  await u.type(screen.getByLabelText("Email"), "offline@example.test");
  await u.click(screen.getByRole("button", { name: "Email a sign-in link" }));
  expect(await screen.findByText(/You’re offline/)).toBeTruthy();
  expect(mail.send).not.toHaveBeenCalled();
});
it("preserves first-time and returning email templates' secure verification URLs", async () => {
  const fs = await import("node:fs");
  for (const name of ["confirmation", "magic-link"]) {
    const html = fs.readFileSync(`supabase/templates/${name}.html`, "utf8");
    expect(html).toContain('href="{{ .ConfirmationURL }}"');
    expect(html).not.toContain('href="{{ .SiteURL }}"');
    expect(html).toContain("Wayfarer");
  }
});
