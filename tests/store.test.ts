import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
vi.stubGlobal("navigator", { onLine: false });
vi.stubGlobal("window", { addEventListener: () => {} });
import { init, all, save, remove, pending } from "../src/store";
import { makeEntity } from "../src/model";
it("initializes once, supports offline create/edit/delete and retains data across reads", async () => {
  await Promise.all([init(), init()]);
  const seeded = await all();
  expect(seeded.filter((e) => e.kind === "entry")).toHaveLength(6);
  const e = makeEntity("packing", "demo-japan", {
    title: "Offline camera",
    packed: false,
  });
  await save(e);
  let loaded = (await all()).find((x) => x.id === e.id)!;
  expect(loaded.data.title).toBe("Offline camera");
  await save({ ...loaded, data: { ...loaded.data, packed: true } });
  loaded = (await all()).find((x) => x.id === e.id)!;
  expect(loaded.data.packed).toBe(true);
  expect(loaded.version).toBe(2);
  await remove(loaded);
  expect((await all()).find((x) => x.id === e.id)?.deleted).toBe(true);
  expect(await pending()).toHaveLength(0);
});
