import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
vi.stubGlobal("navigator", { onLine: false });
vi.stubGlobal("window", { addEventListener: () => {} });
import {
  init,
  all,
  save,
  remove,
  pending,
  saveBatch,
  deleteTrip,
} from "../src/store";
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

it("batch application is atomic locally and checks unchanged reservation guards", async () => {
  const [a, b] = await saveBatch([
    makeEntity("entry", "batch-trip", { title: "A" }),
    makeEntity("entry", "batch-trip", { title: "Fixed" }),
  ]);
  const changed = await save({
    ...b,
    data: { title: "Fixed updated elsewhere" },
  });
  await expect(
    saveBatch([{ ...a, data: { title: "A shifted" } }], [a, b]),
  ).rejects.toThrow("changed");
  expect((await all()).find((e) => e.id === a.id)?.data.title).toBe("A");
  const saved = await saveBatch(
    [{ ...a, data: { title: "A shifted" } }],
    [a, changed],
  );
  expect(saved[0].version).toBe(a.version + 1);
  expect((await all()).find((e) => e.id === a.id)?.data.title).toBe(
    "A shifted",
  );
});

it("a new local activity invalidates a day preview before any writes", async () => {
  const date = "2027-04-12",
    tripId = "scope-trip";
  const [a] = await saveBatch([
    makeEntity("entry", tripId, { title: "First", date }),
  ]);
  await save(makeEntity("entry", tripId, { title: "Added elsewhere", date }));
  await expect(
    saveBatch([{ ...a, data: { ...a.data, title: "Shifted" } }], [a], {
      tripId,
      date,
    }),
  ).rejects.toThrow("day changed");
  expect((await all()).find((e) => e.id === a.id)?.data.title).toBe("First");
});

it("deleting a local demo trip hides its children and leaves other trips intact", async () => {
  const trip = await save(
    makeEntity("trip", "demo-deletion", {
      title: "Disposable",
      people: [{ id: "local-owner", role: "owner" }],
    }),
  );
  const child = await save(
    makeEntity("packing", trip.id, { title: "Bag", quantity: 1 }),
  );
  await deleteTrip(trip);
  const rows = await all();
  expect(rows.find((e) => e.id === trip.id)?.deleted).toBe(true);
  expect(rows.find((e) => e.id === child.id)?.deleted).toBe(true);
  expect(rows.find((e) => e.id === "demo-japan")?.deleted).toBe(false);
});
