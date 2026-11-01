import { it, expect, vi } from "vitest";
import { fetchVisibleEntities } from "../src/syncPull";

function backend(rows: any[], cap = 2, failAfter?: string) {
  return {
    from: vi.fn(() => {
      let cursor = "";
      const query: any = {
        select: () => query,
        order: () => query,
        limit: () => query,
        gt: (_key: string, value: string) => {
          cursor = value;
          return query;
        },
        then: (resolve: any) =>
          resolve(
            cursor === failAfter
              ? { error: Error("Download interrupted") }
              : {
                  data: rows.filter((e) => e.id > cursor).slice(0, cap),
                  error: null,
                },
          ),
      };
      return query;
    }),
  };
}
it("returns all records when the server row cap is smaller than the requested page", async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `id-${i}` }));
  const client = backend(rows);
  expect(await fetchVisibleEntities(client)).toEqual(rows);
  expect(client.from).toHaveBeenCalledTimes(5);
});
it("does not return a partial snapshot if a later page fails", async () => {
  const client = backend([{ id: "a" }, { id: "b" }, { id: "c" }], 2, "b");
  await expect(fetchVisibleEntities(client)).rejects.toThrow("interrupted");
});
it("refuses a misordered download instead of looping or pruning against incomplete data", async () => {
  await expect(
    fetchVisibleEntities(backend([{ id: "b" }, { id: "a" }])),
  ).rejects.toThrow("order was invalid");
});
