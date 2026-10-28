// @vitest-environment jsdom
import { lazy } from "react";
import { render, screen, cleanup, act } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { LazyPanel } from "../src/ui";
afterEach(cleanup);
it("a slow section shows progress without replacing surrounding navigation", async () => {
  let resolve: (value: any) => void = () => {};
  const Slow = lazy(
    () =>
      new Promise<any>((done) => {
        resolve = done;
      }),
  );
  render(
    <>
      <button>Navigation remains available</button>
      <LazyPanel>
        <Slow />
      </LazyPanel>
    </>,
  );
  expect(screen.getByRole("status").textContent).toContain("Opening");
  expect(
    screen.getByRole("button", { name: "Navigation remains available" }),
  ).toBeTruthy();
  await act(async () => {
    resolve({ default: () => <p>Section ready</p> });
  });
  expect(screen.getByText("Section ready")).toBeTruthy();
});
it("a failed section offers recovery and does not block another section", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const Broken = lazy(() => Promise.reject(Error("Chunk unavailable")));
    const { rerender } = render(
      <LazyPanel resetKey="first">
        <Broken />
      </LazyPanel>,
    );
    await screen.findByRole("button", { name: "Reload app" });
    expect(screen.getByRole("alert").textContent).toContain(
      "Saved trips and pending changes",
    );
    rerender(
      <LazyPanel resetKey="second">
        <p>Another section works</p>
      </LazyPanel>,
    );
    expect(await screen.findByText("Another section works")).toBeTruthy();
  } finally {
    errors.mockRestore();
  }
});
