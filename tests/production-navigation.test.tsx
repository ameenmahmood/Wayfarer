// @vitest-environment jsdom
// Production mode with a controlled Supabase transport, never a real account.
import { beforeAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  within,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const backend = vi.hoisted(() => ({
  session: null as any,
  records: [] as any[],
  changes: new EventTarget(),
  otp: vi.fn(async (_args?: unknown) => ({ error: null })),
  authListeners: [] as any[],
  saved: [] as any[],
  api: vi.fn<(...args: any[]) => Promise<any>>(),
}));
vi.mock("../src/store", () => ({
  demo: false,
  get userId() {
    return backend.session?.user.id || "";
  },
  get userEmail() {
    return backend.session?.user.email || "";
  },
  get syncStatus() {
    return backend.session
      ? "Saved and synchronized"
      : "Sign in to synchronize";
  },
  syncError: "",
  events: backend.changes,
  init: async () => {},
  all: async () => backend.records,
  pending: async () => [],
  save: async (e: any) => {
    backend.saved.push(e);
    return e;
  },
  remove: vi.fn(),
  synchronize: async () => {},
  resolveConflict: vi.fn(),
  api: (...args: any[]) => backend.api(...args),
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: backend.session } }),
      onAuthStateChange: (fn: any) => {
        backend.authListeners.push(fn);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithOtp: (args: any) => backend.otp(args),
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => {
      const data =
        table === "memberships"
          ? [
              {
                user_id: "owner-test",
                email: "owner@example.test",
                role: "owner",
              },
            ]
          : [];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { role: "owner" }, error: null }),
        then: (resolve: any) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return chain;
    },
  },
}));
import App from "../src/App";
import { seed } from "../src/seed";
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
beforeEach(() => {
  backend.session = null;
  backend.records = [];
  backend.saved = [];
  backend.authListeners = [];
  backend.otp.mockClear();
  backend.api
    .mockReset()
    .mockRejectedValue(Error("Service is unavailable in the test transport."));
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);
async function openApp() {
  render(<App />);
  await screen.findByRole("heading", { name: "Trip dashboard" });
  return userEvent.setup();
}
const dlg = () => within(screen.getByRole("dialog"));

it.each(["Create a trip", "Plan a new trip"])(
  "signed out: %s opens the trip form, never system configuration",
  async (name) => {
    const u = await openApp();
    await u.click(screen.getAllByRole("button", { name })[0]);
    expect(dlg().getByLabelText("Trip name")).toBeTruthy();
    expect(dlg().queryByText("Appearance")).toBeNull();
    expect(dlg().getByText(/Sign in to save this private trip/)).toBeTruthy();
    expect(
      (dlg().getByRole("button", { name: "Save trip" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await u.type(dlg().getByLabelText("Trip name"), "My draft");
    expect(
      JSON.parse(sessionStorage.getItem("wayfarer-trip-draft")!).data.title,
    ).toBe("My draft");
  },
);

it.each(["My trips0", "My trips", "A My travel spacePrivate workspace"])(
  "signed out: %s opens the trip library",
  async (name) => {
    const u = await openApp();
    await u.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("heading", { name: "My trips" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No trips yet" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it.each([
  ["Settings & account", "Appearance settings"],
  ["Open account settings", "Your account"],
  ["A My accountPrivate workspace PRIVATE", "Your account"],
  ["Sign in", "Your account"],
  ["Sign in to synchronize", "Your account"],
  ["Privacy & offline data", "Privacy & offline data"],
])(
  "signed out: %s opens only its intended destination",
  async (name, title) => {
    const u = await openApp();
    await u.click(screen.getByRole("button", { name }));
    expect(dlg().getByRole("heading", { name: title })).toBeTruthy();
    if (title !== "Appearance settings")
      expect(dlg().queryByText("Appearance")).toBeNull();
    if (title === "Your account")
      expect(dlg().getByLabelText("Email")).toBeTruthy();
    await u.click(dlg().getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it("signed out: dashboard and brand navigation do not launch sign-in or settings", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Trip dashboard" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await u.click(screen.getByRole("link", { name: "wayfarer." }));
  expect(screen.getByRole("heading", { name: "My trips" })).toBeTruthy();
});

it("inline sign-in preserves the draft and saving after authentication uses the actual owner", async () => {
  const u = await openApp();
  await u.click(screen.getByRole("button", { name: "Plan a new trip" }));
  await u.type(dlg().getByLabelText("Trip name"), "Draft after login");
  await u.type(dlg().getByLabelText("Destinations"), "Boston");
  await u.type(dlg().getByLabelText("Email"), "owner@example.test");
  await u.click(dlg().getByRole("button", { name: "Email a sign-in link" }));
  expect(backend.otp).toHaveBeenCalledOnce();
  expect(dlg().getByLabelText("Trip name")).toHaveProperty(
    "value",
    "Draft after login",
  );
  backend.session = { user: { id: "owner-test", email: "owner@example.test" } };
  await act(async () => {
    backend.authListeners.forEach((fn) => fn("SIGNED_IN", backend.session));
  });
  await waitFor(() =>
    expect(
      (dlg().getByRole("button", { name: "Save trip" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await u.click(dlg().getByRole("button", { name: "Save trip" }));
  await waitFor(() => expect(backend.saved).toHaveLength(1));
  expect(backend.saved[0].data.people[0].id).toBe("owner-test");
});

it("signed in: every trip section and its creation control opens the right area", async () => {
  backend.session = { user: { id: "owner-test", email: "owner@example.test" } };
  backend.records = seed();
  render(<App />);
  const u = userEvent.setup();
  await screen.findByRole("button", { name: "Edit trip" });
  const cases = [
    [
      "Map",
      "Every place, in one view",
      "Add a plan",
      "A new plan, a new possibility",
    ],
    [
      "Itinerary",
      "A plan with room to wander",
      "Add a plan",
      "A new plan, a new possibility",
    ],
    [
      "Expenses",
      "A little clarity for every cost",
      "Add expense",
      "Add an expense",
    ],
    [
      "Packing list",
      "Room for everything you need",
      "Add item",
      "Add packing item",
    ],
  ];
  for (const [section, heading, button, modal] of cases) {
    await u.click(screen.getByRole("button", { name: section }));
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await u.click(screen.getByRole("button", { name: button }));
    expect(dlg().getByRole("heading", { name: modal })).toBeTruthy();
    expect(dlg().queryByText("Appearance")).toBeNull();
    await u.click(dlg().getByRole("button", { name: "Close dialog" }));
  }
  await u.click(screen.getByRole("button", { name: /^Members/ }));
  await screen.findByRole("heading", { name: "Trip members" });
  expect(
    screen.getByRole("button", { name: "Create private invitation" }),
  ).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Saved and synchronized" }));
  expect(dlg().getByRole("heading", { name: "Sync status" })).toBeTruthy();
  await u.click(dlg().getByRole("button", { name: "Sync now" }));
  expect(dlg().queryByText("Appearance")).toBeNull();
});

it("a trip draft survives reloading this tab and cancellation explicitly removes it", async () => {
  let u = await openApp();
  await u.click(screen.getByRole("button", { name: "Plan a new trip" }));
  await u.type(dlg().getByLabelText("Trip name"), "Retained draft");
  cleanup();
  render(<App />);
  await screen.findByRole("dialog");
  expect(dlg().getByLabelText("Trip name")).toHaveProperty(
    "value",
    "Retained draft",
  );
  u = userEvent.setup();
  await u.click(dlg().getByRole("button", { name: "Close dialog" }));
  expect(sessionStorage.getItem("wayfarer-trip-draft")).toBeNull();
});

it("place search supports click and Enter, shows loading/results/errors, and never submits the trip entry", async () => {
  backend.session = { user: { id: "owner-test", email: "owner@example.test" } };
  backend.records = seed();
  render(<App />);
  const u = userEvent.setup();
  await screen.findByRole("button", { name: "Edit trip" });
  await u.click(screen.getByRole("button", { name: "Add a plan" }));
  let finish: (result: any) => void = () => {};
  backend.api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await u.type(dlg().getByLabelText("Find a Google place"), " times square ");
  await u.click(dlg().getByRole("button", { name: "Search" }));
  expect(backend.api).toHaveBeenCalledWith("places", "demo-japan", {
    query: "times square",
  });
  expect(dlg().getByRole("status").textContent).toContain("Searching");
  await act(async () => {
    finish({
      places: [
        {
          id: "place-test",
          displayName: { text: "Times Square" },
          formattedAddress: "Manhattan, NY",
        },
      ],
    });
  });
  await u.click(
    await dlg().findByRole("button", { name: /Times Square.*Manhattan, NY/ }),
  );
  expect(dlg().getByText(/Google place linked/)).toBeTruthy();
  expect(dlg().getByLabelText("Title")).toHaveProperty("value", "");
  backend.api.mockResolvedValueOnce({ places: [] });
  await u.clear(dlg().getByLabelText("Find a Google place"));
  await u.type(dlg().getByLabelText("Find a Google place"), "nowhere{Enter}");
  await dlg().findByText(/No places found/);
  expect(backend.saved).toHaveLength(0);
  backend.api.mockRejectedValueOnce(
    Error("Configure GOOGLE_MAPS_SERVER_KEY in Supabase."),
  );
  await u.click(dlg().getByRole("button", { name: "Search" }));
  expect((await dlg().findByRole("alert")).textContent).toContain(
    "GOOGLE_MAPS_SERVER_KEY",
  );
  backend.api.mockResolvedValueOnce({
    places: [{ id: "retry", displayName: { text: "Found after retry" } }],
  });
  await u.click(dlg().getByRole("button", { name: "Search" }));
  await dlg().findByRole("button", { name: "Found after retry" });
});
