import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
it("precaches all production assets and serves the shell offline without intercepting Google", async () => {
  const listeners: Record<string, any> = {},
    saved = new Map<string, any>();
  let online = true;
  const source = readFileSync(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  ).replace(
    /\/\*PRECACHE\*\/\s*\[\]/,
    JSON.stringify([
      "/",
      "/manifest.webmanifest",
      "/assets/app-test.js",
      "/assets/app-test.css",
    ]),
  );
  const cache = {
    addAll: async (paths: string[]) => {
      paths.forEach((p) => saved.set(p, { body: p, ok: true }));
    },
    match: async (req: any) =>
      saved.get(typeof req === "string" ? req : new URL(req.url).pathname),
    put: async (p: string, r: any) => saved.set(p, r),
  };
  const context = {
    URL,
    self: {
      location: { origin: "https://travel.test" },
      addEventListener: (name: string, fn: any) => (listeners[name] = fn),
      skipWaiting: () => {},
      clients: { claim: () => Promise.resolve() },
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      match: cache.match,
      delete: async () => true,
    },
    fetch: async () => {
      if (!online) throw Error("offline");
      return {
        ok: true,
        clone() {
          return this;
        },
      };
    },
  };
  runInNewContext(source, context);
  let work: Promise<any> = Promise.resolve();
  listeners.install({ waitUntil: (p: Promise<any>) => (work = p) });
  await work;
  expect(saved.has("/assets/app-test.js")).toBe(true);
  expect(saved.has("/assets/app-test.css")).toBe(true);
  online = false;
  let response: Promise<any> = Promise.resolve();
  listeners.fetch({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://travel.test/trip",
    },
    respondWith: (p: Promise<any>) => (response = p),
  });
  expect((await response).body).toBe("/");
  let intercepted = false;
  listeners.fetch({
    request: { method: "GET", url: "https://maps.googleapis.com/maps/api/js" },
    respondWith: () => (intercepted = true),
  });
  expect(intercepted).toBe(false);
});
