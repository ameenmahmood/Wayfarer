import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
vi.stubGlobal("navigator", { onLine: false });
vi.stubGlobal("window", { addEventListener: () => {} });
import { init, all, save, remove } from "../src/store";
import { ideaEntry, scheduleIdea } from "../src/ideaPlanning";
import { makeEntity, type Idea, type Trip } from "../src/model";

it("saves ideas offline, promotes a reviewed hotel once, and keeps idea estimates out of spending", async () => {
  await init();
  const trip = (await all()).find((e) => e.id === "demo-japan")!.data as Trip;
  const idea = await save(
    makeEntity<Idea>("idea", "demo-japan", {
      title: "A riverside hotel",
      category: "Hotel",
      status: "Considering",
      cost: 12500,
      currency: "USD",
      notes: "Compare room sizes",
      location: "Kyoto",
      link: "https://example.com/hotel",
    }),
  );
  expect((await all()).filter((e) => e.kind === "expense")).toHaveLength(1);
  const draft = ideaEntry(idea, trip, []);
  expect(draft.data).toMatchObject({
    type: "Lodging",
    date: trip.start,
    zone: trip.zone,
    cost: 12500,
    sourceIdeaId: idea.id,
  });
  const saved = await scheduleIdea(idea, {
    ...draft,
    data: { ...draft.data, date: "2027-04-14", endDate: "2027-04-16" },
  });
  expect(saved.data.date).toBe("2027-04-14");
  const current = (await all()).find((e) => e.id === idea.id)!;
  expect(current.data.status).toBe("Approved");
  await expect(scheduleIdea(idea, draft)).rejects.toThrow("changed");
  await expect(
    scheduleIdea(current, ideaEntry(current, trip, [])),
  ).rejects.toThrow("already on the itinerary");
  expect(
    (await all()).filter((e) => e.data.sourceIdeaId === idea.id),
  ).toHaveLength(1);
  expect((await all()).filter((e) => e.kind === "expense")).toHaveLength(1);
  await remove(saved);
  const replacement = await scheduleIdea(current, ideaEntry(current, trip, []));
  expect(replacement.id).not.toBe(saved.id);
  await remove((await all()).find((e) => e.id === idea.id)!);
  expect((await all()).find((e) => e.id === replacement.id)?.deleted).toBe(
    false,
  );
});

it("concurrent local promotions cannot create duplicate plans or silently overwrite the idea", async () => {
  const trip = (await all()).find((e) => e.id === "demo-japan")!.data as Trip;
  const idea = await save(
    makeEntity<Idea>("idea", "demo-japan", {
      title: "Train option",
      category: "Transport",
      status: "Approved",
      currency: "JPY",
      notes: "",
      location: "",
      link: "",
    }),
  );
  const results = await Promise.allSettled([
    scheduleIdea(idea, ideaEntry(idea, trip, [])),
    scheduleIdea(idea, ideaEntry(idea, trip, [])),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await all()).filter((e) => !e.deleted && e.data.sourceIdeaId === idea.id),
  ).toHaveLength(1);
});
