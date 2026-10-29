import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
const backend = vi.hoisted(() => ({
  rows: new Map<string, any>(),
  receipts: new Map<string, any>(),
  dropResponse: false,
  requests: [] as any[],
  deletions: [] as any[],
}));
vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public-test-key");
vi.stubGlobal("navigator", { onLine: false });
vi.stubGlobal("window", { addEventListener: () => {} });
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: { user: { id: "owner", email: "owner@example.test" } },
        },
      }),
    },
    functions: {
      invoke: async () => ({
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: new Response(
            JSON.stringify({
              error:
                "Google services are not configured. Manual planning remains available.",
            }),
            { status: 503 },
          ),
        },
      }),
    },
    from: () => ({
      select: async () => ({ data: [...backend.rows.values()], error: null }),
    }),
    rpc: async (_name: string, m: any) => {
      if (_name === "delete_trip") {
        backend.deletions.push(m);
        for (const [id, row] of backend.rows)
          if (row.trip_id === m.target_trip)
            backend.rows.set(id, {
              ...row,
              deleted: true,
              version: row.version + 1,
            });
        return { data: { deleted: true }, error: null };
      }
      backend.requests.push(m);
      let result = backend.receipts.get(m.op_id);
      if (!result) {
        const old = backend.rows.get(m.entity_id);
        if (
          old?.deleted ||
          (old && old.version !== m.base_version) ||
          (!old && m.base_version !== 0)
        )
          return { data: { conflict: true, entity: old }, error: null };
        const row = {
          id: m.entity_id,
          trip_id: m.trip_id,
          kind: m.entity_kind,
          data: m.payload,
          version: (old?.version || 0) + 1,
          updated_by: "owner",
          updated_at: new Date().toISOString(),
          deleted: m.is_deleted,
        };
        backend.rows.set(row.id, row);
        result = { entity: row, conflict: false };
        backend.receipts.set(m.op_id, result);
      }
      if (backend.dropResponse) {
        backend.dropResponse = false;
        return { error: { message: "Connection lost after commit" } };
      }
      return { data: result, error: null };
    },
  }),
}));
const {
  save,
  synchronize,
  pending,
  all,
  remove,
  resolveConflict,
  saveBatch,
  deleteTrip,
} = await import("../src/store");
import { makeEntity } from "../src/model";
const flush = () => new Promise((r) => setTimeout(r, 10));
it("queues ordered offline edits, survives a lost acknowledgment, resolves concurrency, and preserves tombstones", async () => {
  const e = makeEntity("expense", "trip", {
    title: "Offline dinner",
    amount: 100,
  });
  await save(e);
  await flush();
  const first = (await all()).find((r) => r.id === e.id)!;
  await save({
    ...first,
    data: { title: "Offline dinner corrected", amount: 200 },
  });
  await flush();
  const q = await pending();
  expect(q).toHaveLength(2);
  expect(q.map((m) => m.baseVersion)).toEqual([0, 1]);
  expect(backend.rows.size).toBe(0);
  (navigator as any).onLine = true;
  backend.dropResponse = true;
  await synchronize();
  expect((await pending())[0].state).toBe("failed");
  expect(backend.rows.size).toBe(1);
  await synchronize();
  expect(await pending()).toHaveLength(0);
  expect(backend.rows.get(e.id).version).toBe(2);
  expect(backend.rows.get(e.id).data.amount).toBe(200);
  expect(backend.requests[0].op_id).toBe(backend.requests[1].op_id);
  (navigator as any).onLine = false;
  let local = (await all()).find((r) => r.id === e.id)!;
  await save({ ...local, data: { ...local.data, amount: 300 } });
  await flush();
  const remote = backend.rows.get(e.id);
  backend.rows.set(e.id, {
    ...remote,
    version: 3,
    data: { ...remote.data, amount: 400 },
  });
  (navigator as any).onLine = true;
  await synchronize();
  expect((await pending())[0].state).toBe("conflict");
  expect((await all()).find((r) => r.id === e.id)?.data.amount).toBe(300);
  await resolveConflict((await pending())[0], "remote");
  await flush();
  expect((await all()).find((r) => r.id === e.id)?.data.amount).toBe(400);
  (navigator as any).onLine = false;
  local = (await all()).find((r) => r.id === e.id)!;
  await remove(local);
  await flush();
  (navigator as any).onLine = true;
  await synchronize();
  expect(backend.rows.get(e.id).deleted).toBe(true);
  await synchronize();
  expect((await all()).find((r) => r.id === e.id)?.deleted).toBe(true);
  expect(backend.rows.size).toBe(1);
});

it("online-service errors expose actionable server instructions instead of a generic gateway error", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const { api } = await import("../src/store");
  await expect(api("search", "trip", { query: "Cafe" })).rejects.toThrow(
    "Google services are not configured. Manual planning remains available.",
  );
});

it("queues offline schedule batches with unique ordered operations and retries without duplicates", async () => {
  (navigator as any).onLine = false;
  const rows = await saveBatch([
    makeEntity("entry", "trip", { title: "Batch A" }),
    makeEntity("entry", "trip", { title: "Batch B" }),
  ]);
  await flush();
  const q = (await pending()).filter((m) =>
    rows.some((e) => e.id === m.entityId),
  );
  expect(q).toHaveLength(2);
  expect(new Set(q.map((m) => m.id)).size).toBe(2);
  expect(q[1].sequence).toBe(q[0].sequence + 1);
  (navigator as any).onLine = true;
  backend.dropResponse = true;
  await synchronize();
  await synchronize();
  expect(
    (await pending()).filter((m) => rows.some((e) => e.id === m.entityId)),
  ).toHaveLength(0);
  for (const row of rows) expect(backend.rows.get(row.id).version).toBe(1);
});

it("connected deletion requires online synchronized edits, then hides the trip and its children", async () => {
  (navigator as any).onLine = false;
  const trip = await save(
    makeEntity("trip", "delete-transport", {
      title: "Disposable transport trip",
      people: [{ id: "owner", role: "owner" }],
    }),
  );
  const child = await save(makeEntity("packing", trip.id, { title: "Bag" }));
  await flush();
  await expect(deleteTrip(trip)).rejects.toThrow("internet");
  (navigator as any).onLine = true;
  await expect(deleteTrip(trip)).rejects.toThrow("pending changes");
  expect(backend.deletions).toHaveLength(0);
  await synchronize();
  await deleteTrip(trip);
  await flush();
  expect(backend.deletions).toHaveLength(1);
  expect(backend.deletions[0]).toEqual({
    target_trip: trip.id,
    expected_version: trip.version,
  });
  expect((await all()).find((e) => e.id === trip.id)?.deleted).toBe(true);
  expect((await all()).find((e) => e.id === child.id)?.deleted).toBe(true);
});
it("a deleted parent cannot be kept visible by an offline trip-settings conflict", async () => {
  (navigator as any).onLine = false;
  const trip = await save(
    makeEntity("trip", "delete-conflict", { title: "Original" }),
  );
  await flush();
  (navigator as any).onLine = true;
  await synchronize();
  (navigator as any).onLine = false;
  const current = (await all()).find((e) => e.id === trip.id)!;
  await save({ ...current, data: { title: "Offline title" } });
  await flush();
  const remote = backend.rows.get(trip.id);
  backend.rows.set(trip.id, {
    ...remote,
    deleted: true,
    version: remote.version + 1,
  });
  (navigator as any).onLine = true;
  await synchronize();
  expect((await pending()).find((m) => m.entityId === trip.id)?.state).toBe(
    "conflict",
  );
  expect((await all()).find((e) => e.id === trip.id)?.deleted).toBe(true);
});
