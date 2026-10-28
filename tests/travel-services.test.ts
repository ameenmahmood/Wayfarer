import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { corsHeaders } from "@supabase/supabase-js/cors";
import { it, expect, vi } from "vitest";
import { serviceCors } from "../supabase/functions/_shared/cors";
const local = "http://localhost:5173",
  production = "https://ameenmahmood.github.io";
function handler({
  key = "test-server-key",
  member = true,
  authenticated = true,
} = {}) {
  let serve: (req: Request) => Promise<Response> = async () => new Response();
  const google = vi.fn(
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
