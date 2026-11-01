import {
  makeEntity,
  type Entity,
  type Entry,
  type Idea,
  type Trip,
} from "./model";
import { all, saveBatch } from "./store";

export const ideaCategories = [
  "Activity",
  "Restaurant",
  "Hotel",
  "Flight",
  "Transport",
  "Other",
] as const;
export const ideaStatuses = ["Considering", "Passed", "Approved"] as const;

export function ideaEntry(
  idea: Entity<Idea>,
  trip: Trip,
  entries: Entity<Entry>[],
) {
  return makeEntity<Entry>("entry", idea.tripId, {
    sourceIdeaId: idea.id,
    title: idea.data.title,
    type:
      (
        {
          Hotel: "Lodging",
          Transport: "Transportation",
          Other: "Note",
        } as Record<string, string>
      )[idea.data.category] || idea.data.category,
    date: trip.start,
    endDate: trip.start,
    start: "09:00",
    end: "",
    duration: 60,
    zone: trip.zone,
    address: idea.data.location,
    notes: idea.data.notes,
    link: idea.data.link,
    reservation: "",
    cost: idea.data.cost ?? 0,
    currency: idea.data.currency,
    fixed: false,
    order: Math.max(-1, ...entries.map((e) => e.data.order)) + 1,
  });
}

/** Guard the idea and new plan together locally; the server also prevents duplicate links. */
export async function scheduleIdea(idea: Entity<Idea>, entry: Entity<Entry>) {
  const rows = await all();
  const current = rows.find((e) => e.id === idea.id);
  if (!current || current.deleted || current.version !== idea.version)
    throw Error("This idea changed. Close and reopen it before adding a plan.");
  if (
    rows.some(
      (e) =>
        !e.deleted &&
        e.tripId === idea.tripId &&
        e.kind === "entry" &&
        e.data.sourceIdeaId === idea.id,
    )
  )
    throw Error(
      "This idea is already on the itinerary. Close this form to view it.",
    );
  if (
    entry.tripId !== idea.tripId ||
    entry.data.sourceIdeaId !== idea.id ||
    !entry.data.date
  )
    throw Error("Choose a date before adding this idea to the itinerary.");
  const [, saved] = await saveBatch([
    { ...idea, data: { ...idea.data, status: "Approved" } },
    entry,
  ]);
  return saved as Entity<Entry>;
}
