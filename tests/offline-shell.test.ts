import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
it.each(["/", "/Wayfarer/"])(
  "precaches the shell at %s and serves it offline without intercepting Google",
  async (base) => {
    const listeners: Record<string, any> = {},
      saved = new Map<string, any>();
    const removedCaches: string[] = [];
    let online = true;
    const source = readFileSync(
      new URL("../public/sw.js", import.meta.url),
      "utf8",
    ).replace(
      /\/\*PRECACHE\*\/\s*\[\]/,
      JSON.stringify([
        base,
        base + "manifest.webmanifest",
        base + "assets/app-test.js",
        base + "assets/app-test.css",
        base + "assets/Itinerary-lazy.js",
        base + "assets/Forms-lazy.js",
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
        registration: { scope: "https://travel.test" + base },
        addEventListener: (name: string, fn: any) => (listeners[name] = fn),
        skipWaiting: () => {},
        clients: { claim: () => Promise.resolve() },
      },
      caches: {
        open: async () => cache,
        keys: async () => ["another-app-cache", `wayfarer:${base}:old`],
        match: cache.match,
        delete: async (name: string) => {
          removedCaches.push(name);
          return true;
        },
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
    expect(saved.has(base + "assets/app-test.js")).toBe(true);
    expect(saved.has(base + "assets/app-test.css")).toBe(true);
    expect(saved.has(base + "assets/Itinerary-lazy.js")).toBe(true);
    expect(saved.has(base + "assets/Forms-lazy.js")).toBe(true);
    listeners.activate({ waitUntil: (p: Promise<any>) => (work = p) });
    await work;
    expect(removedCaches).toEqual([`wayfarer:${base}:old`]);
    online = false;
    let response: Promise<any> = Promise.resolve();
    listeners.fetch({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://travel.test" + base + "trip",
      },
      respondWith: (p: Promise<any>) => (response = p),
    });
    expect((await response).body).toBe(base);
    let intercepted = false;
    listeners.fetch({
      request: {
        method: "GET",
        url: "https://maps.googleapis.com/maps/api/js",
      },
      respondWith: () => (intercepted = true),
    });
    expect(intercepted).toBe(false);
  },
);
