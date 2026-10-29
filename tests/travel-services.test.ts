import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { corsHeaders } from "@supabase/supabase-js/cors";
import { it, expect, vi } from "vitest";
import { serviceCors } from "../supabase/functions/_shared/cors";
import { googleFailure } from "../supabase/functions/_shared/google-error";
const local = "http://localhost:5173",
  production = "https://ameenmahmood.github.io";
function handler({
  key = "test-server-key",
  member = true,
  authenticated = true,
} = {}) {
  let serve: (req: Request) => Promise<Response> = async () => new Response();
  const google = vi.fn<(...args: any[]) => Promise<Response>>(
    async () =>
      new Response(
        JSON.stringify({
          places: [{ id: "place-1", displayName: { text: "Times Square" } }],
        }),
        { status: 200 },
      ),
  );
  const membership: any = {
    select: () => membership,
    eq: () => membership,
    maybeSingle: async () => ({ data: member ? { role: "owner" } : null }),
  };
  const createClient = () => ({
    auth: {
      getUser: async () => ({
        data: { user: authenticated ? { id: "test-owner" } : null },
        error: null,
      }),
    },
    from: () => membership,
    rpc: async () => ({ data: true, error: null }),
  });
  const context = vm.createContext({
    z,
    corsHeaders,
    serviceCors,
    googleFailure,
    createClient,
    fetch: google,
    Request,
    Response,
    AbortSignal,
    console,
    Deno: {
      env: {
        get: (name: string) =>
          (
            ({
              ALLOWED_ORIGIN: `${production},${local}`,
              GOOGLE_MAPS_SERVER_KEY: key,
              SUPABASE_URL: "https://test.supabase.co",
              SUPABASE_ANON_KEY: "public-test-key",
            }) as any
          )[name],
      },
      serve: (fn: any) => {
        serve = fn;
      },
    },
  });
  const source = readFileSync(
    new URL("../supabase/functions/travel-services/index.ts", import.meta.url),
    "utf8",
  ).replace(/^import .*;\r?\n/gm, "");
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText,
    context,
  );
  return { invoke: (request: Request) => serve(request), google };
}
function request(origin = local, method = "POST") {
  return new Request("https://test.supabase.co/functions/v1/travel-services", {
    method,
    headers: {
      Origin: origin,
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    ...(method === "POST"
      ? {
          body: JSON.stringify({
            action: "places",
            tripId: "11111111-1111-4111-8111-111111111111",
            query: "times square",
          }),
        }
      : {}),
  });
}

it("CORS accepts exact dev/production origins and all SDK headers while rejecting unknown origins", async () => {
  const service = handler();
  for (const origin of [local, production]) {
    const r = await service.invoke(request(origin, "OPTIONS"));
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe(origin);
    expect(r.headers.get("access-control-allow-headers")).toContain(
      "x-retry-count",
    );
    expect(r.headers.get("access-control-allow-headers")).toContain(
      "traceparent",
    );
  }
  const denied = await service.invoke(
    request("https://untrusted.example", "OPTIONS"),
  );
  expect(denied.status).toBe(403);
  expect(service.google).not.toHaveBeenCalled();
});
it("the deployed handler calls Places Text Search with the server key and a bounded field mask", async () => {
  const service = handler();
  const r = await service.invoke(request());
  expect(r.status).toBe(200);
  expect((await r.json()).places[0].id).toBe("place-1");
  expect(service.google).toHaveBeenCalledOnce();
  const [url, options] = service.google.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
  expect(JSON.parse(String(options.body))).toEqual({
    textQuery: "times square",
    maxResultCount: 5,
  });
  expect((options.headers as any)["X-Goog-Api-Key"]).toBe("test-server-key");
  expect((options.headers as any)["X-Goog-FieldMask"]).toContain("places.id");
});
it("missing server configuration returns an actionable error without sending a Google request", async () => {
  const service = handler({ key: "" });
  const r = await service.invoke(request());
  expect((await r.json()).error).toContain("GOOGLE_MAPS_SERVER_KEY");
  expect(service.google).not.toHaveBeenCalled();
});
it.each([
  { member: false, authenticated: true, status: 403 },
  { member: true, authenticated: false, status: 401 },
])(
  "search keeps auth/membership enforced: $status",
  async ({ member, authenticated, status }) => {
    const service = handler({ member, authenticated });
    const r = await service.invoke(request());
    expect(r.status).toBe(status);
    expect(service.google).not.toHaveBeenCalled();
  },
);

it("Google rejection details remain actionable while key values are redacted", () => {
  const key = "AIzaFakeServerSecretThatMustNeverBeShown";
  const error = googleFailure(
    403,
    {
      error: {
        message: `Website-restricted key ${key} cannot call this API.`,
        details: [{ reason: "API_KEY_HTTP_REFERRER_BLOCKED" }],
      },
    },
    key,
  );
  expect(error).toContain("Website-restricted");
  expect(error).toContain("API_KEY_HTTP_REFERRER_BLOCKED");
  expect(error).not.toContain(key);
});

function nearbyRequest(over: Record<string, unknown> = {}) {
  return new Request("https://test.supabase.co/functions/v1/travel-services", {
    method: "POST",
    headers: {
      Origin: local,
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "nearby",
      tripId: "11111111-1111-4111-8111-111111111111",
      category: "cafe",
      location: "Midtown Manhattan",
      radius: 1500,
      ...over,
    }),
  });
}
it("nearby resolves typed locations and uses bounded, distance-ranked category searches", async () => {
  const service = handler();
  service.google
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          places: [
            {
              location: { latitude: 40.75, longitude: -73.98 },
              displayName: { text: "Midtown Manhattan" },
            },
          ],
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          places: [
            {
              id: "cafe-1",
              displayName: { text: "Cafe" },
              formattedAddress: "New York",
            },
          ],
        }),
      ),
    );
  const r = await service.invoke(nearbyRequest());
  expect(r.status).toBe(200);
  expect((await r.json()).centerLabel).toBe("Midtown Manhattan");
  const [url, opts] = service.google.mock.calls[1];
  expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
  expect(JSON.parse(opts.body)).toEqual({
    includedTypes: ["cafe"],
    maxResultCount: 8,
    rankPreference: "DISTANCE",
    locationRestriction: {
      circle: { center: { latitude: 40.75, longitude: -73.98 }, radius: 1500 },
    },
  });
  expect(opts.headers["X-Goog-FieldMask"]).not.toContain("rating");
});
it("nearby can use coordinates without an additional location lookup", async () => {
  const service = handler();
  const r = await service.invoke(
    nearbyRequest({ anchor: { lat: 40.75, lng: -73.98 }, category: "museum" }),
  );
  expect(r.status).toBe(200);
  expect(service.google).toHaveBeenCalledOnce();
  expect(
    JSON.parse(service.google.mock.calls[0][1].body).includedTypes,
  ).toEqual(["museum"]);
});
it("nearby resolves a linked activity and handles no results without inventing places", async () => {
  const service = handler();
  service.google
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          location: { latitude: 40.75, longitude: -73.98 },
          displayName: { text: "Linked stop" },
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({})));
  const r = await service.invoke(
    nearbyRequest({ anchor: { placeId: "activity-place" } }),
  );
  expect(r.status).toBe(200);
  expect((await r.json()).places).toEqual([]);
  expect(service.google.mock.calls[0][0]).toBe(
    "https://places.googleapis.com/v1/places/activity-place",
  );
});
it.each([
  { radius: 0 },
  { radius: 50001 },
  { category: "invalid" },
  { anchor: { lat: 91, lng: 0 } },
  { location: "" },
])("nearby rejects invalid inputs without calls: %j", async (over) => {
  const service = handler();
  expect((await service.invoke(nearbyRequest(over))).status).not.toBe(200);
  expect(service.google).not.toHaveBeenCalled();
});
it("nearby keeps membership and authentication checks", async () => {
  for (const options of [{ member: false }, { authenticated: false }]) {
    const service = handler(options);
    expect((await service.invoke(nearbyRequest())).status).not.toBe(200);
    expect(service.google).not.toHaveBeenCalled();
  }
});
