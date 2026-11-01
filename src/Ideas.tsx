import { useState } from "react";
import {
  Plus,
  Lightbulb,
  Pencil,
  Trash2,
  CalendarPlus,
  ExternalLink,
  Check,
} from "lucide-react";
import {
  currencies,
  makeEntity,
  type Entity,
  type Entry,
  type Idea,
  type Trip,
} from "./model";
import { save, remove, userId } from "./store";
import { minor, money, precision } from "./money";
import { Button, Empty, Field, Modal, Notice, useAsyncAction } from "./ui";
import { EntryForm } from "./Forms";
import {
  ideaCategories,
  ideaStatuses,
  ideaEntry,
  scheduleIdea,
} from "./ideaPlanning";

export default function Ideas({
  trip,
  tripId,
  ideas,
  entries,
  canEdit,
  onViewEntry,
}: {
  trip: Trip;
  tripId: string;
  ideas: Entity<Idea>[];
  entries: Entity<Entry>[];
  canEdit: boolean;
  onViewEntry: (entry: Entity<Entry>) => void;
}) {
  const [status, setStatus] = useState("All"),
    [category, setCategory] = useState("All");
  const [editing, setEditing] = useState<Entity<Idea>>();
  const [planning, setPlanning] = useState<{
    idea: Entity<Idea>;
    entry: Entity<Entry>;
  }>();
  const [deleting, setDeleting] = useState<string>();
  const action = useAsyncAction();
  const visible = ideas
    .filter(
      (e) =>
        (status === "All" || e.data.status === status) &&
        (category === "All" || e.data.category === category),
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  const linked = (id: string) =>
    entries.find((e) => e.data.sourceIdeaId === id);
  return (
    <section className="ideas-workspace" aria-label="Trip ideas">
      <div className="content-heading">
        <div>
          <h2>Ideas</h2>
        </div>
        {canEdit && (
          <Button
            className="primary"
            onClick={() =>
              setEditing(
                makeEntity<Idea>("idea", tripId, {
                  title: "",
                  category: "Activity",
                  status: "Considering",
                  link: "",
                  location: "",
                  notes: "",
                  currency: trip.currency,
                }),
              )
            }
          >
            <Plus size={16} /> Add an idea
          </Button>
        )}
      </div>
      <div className="ideas-toolbar">
        <div
          className="segmented ideas-statuses"
          role="group"
          aria-label="Filter ideas by status"
        >
          {["All", ...ideaStatuses].map((s) => (
            <button
              key={s}
              className={status === s ? "active" : ""}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {s}{" "}
              <span>
                {ideas.filter((e) => s === "All" || e.data.status === s).length}
              </span>
            </button>
          ))}
        </div>
        <select
          aria-label="Filter ideas by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="All">All categories</option>
          {ideaCategories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="ideas-help">
        <span>Approved doesn’t mean booked.</span>
        <details>
          <summary>How ideas work</summary>
          <p>
            Ideas aren’t scheduled or included in trip totals. Add one to the
            itinerary to choose a day and time and carry over its estimated
            cost. Actual spending comes from expenses.
          </p>
        </details>
      </div>
      {action.error && <Notice tone="error">{action.error}</Notice>}
      {!visible.length ? (
        <Empty
          title={ideas.length ? "No ideas match these filters" : "No ideas yet"}
        >
          {ideas.length
            ? "Try another status or category."
            : canEdit
              ? "Add a hotel, transport option, or activity to compare."
              : "Ideas added by your companions will appear here."}
        </Empty>
      ) : (
        <div className="ideas-grid">
          {visible.map((idea) => {
            const v = idea.data,
              plan = linked(idea.id);
            const author =
              trip.people.find((p) => p.id === idea.updatedBy)?.name ||
              "A traveler";
            return (
              <article className="idea-card" key={idea.id}>
                <div className="idea-card-heading">
                  <span className="idea-category">
                    <Lightbulb size={15} />
                    {v.category}
                  </span>
                  <span
                    className={`pill idea-status status-${v.status.toLowerCase()}`}
                  >
                    {v.status}
                  </span>
                </div>
                <h3>{v.title}</h3>
                {v.location && <p className="idea-location">{v.location}</p>}
                {v.cost != null && (
                  <div className="idea-estimate">
                    {money(v.cost, v.currency)} <small>estimated</small>
                  </div>
                )}
                {v.notes && <p className="idea-notes">{v.notes}</p>}
                {/^https?:\/\//i.test(v.link) && (
                  <a
                    href={v.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="idea-link"
                  >
                    <ExternalLink size={14} /> Open reference
                  </a>
                )}
                <small className="idea-updated">
                  Changed{" "}
                  {new Date(idea.updatedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}{" "}
                  · {idea.updatedBy === userId ? "You" : author}
                </small>
                <div className="idea-card-actions">
                  {plan ? (
                    <Button onClick={() => onViewEntry(plan)}>
                      <Check size={14} /> View in itinerary
                    </Button>
                  ) : (
                    canEdit && (
                      <Button
                        onClick={() =>
                          setPlanning({
                            idea,
                            entry: ideaEntry(idea, trip, entries),
                          })
                        }
                      >
                        <CalendarPlus size={15} /> Add to itinerary
                      </Button>
                    )
                  )}
                  {canEdit && (
                    <div className="idea-edit-actions">
                      <button
                        className="icon-button"
                        aria-label={`Edit idea ${v.title}`}
                        onClick={() => setEditing(idea)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete idea ${v.title}`}
                        onClick={() => setDeleting(idea.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
                {deleting === idea.id && (
                  <div className="idea-delete">
                    <p>
                      Remove this idea?{" "}
                      {plan && "Its itinerary plan will stay."}
                    </p>
                    <Button onClick={() => setDeleting(undefined)}>
                      Keep idea
                    </Button>{" "}
                    <Button
                      className="danger-outline"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(async () => {
                          await remove(idea);
                          setDeleting(undefined);
                        })
                      }
                    >
                      Remove idea
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {editing && canEdit && (
        <Modal
          title={editing.version ? "Edit idea" : "Add an idea"}
          onClose={() => setEditing(undefined)}
        >
          <IdeaForm
            key={editing.id}
            entity={editing}
            onDone={() => setEditing(undefined)}
          />
        </Modal>
      )}
      {planning && canEdit && (
        <Modal
          title="Turn this idea into a plan"
          wide
          onClose={() => setPlanning(undefined)}
        >
          <Notice>
            Review the day, time, and details before saving. This will mark the
            idea Approved. It does not make a reservation.
          </Notice>
          <EntryForm
            entity={planning.entry}
            trip={trip}
            persist={(entry) => scheduleIdea(planning.idea, entry)}
            onDone={(entry) => {
              setPlanning(undefined);
              if (entry) onViewEntry(entry);
            }}
          />
        </Modal>
      )}
    </section>
  );
}

function IdeaForm({
  entity,
  onDone,
}: {
  entity: Entity<Idea>;
  onDone: () => void;
}) {
  const [v, setV] = useState(entity.data),
    [cost, setCost] = useState(
      entity.data.cost == null
        ? ""
        : String(entity.data.cost / 10 ** precision(entity.data.currency)),
    );
  const action = useAsyncAction();
  const change = <K extends keyof Idea>(key: K, value: Idea[K]) =>
    setV((v) => ({ ...v, [key]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        action.run(async () => {
          if (!v.title.trim()) throw Error("Give this idea a title.");
          if (v.link && !/^https?:\/\//i.test(v.link))
            throw Error("Links must start with https:// or http://.");
          await save({
            ...entity,
            data: {
              ...v,
              title: v.title.trim(),
              cost: cost.trim() ? minor(cost, v.currency) : undefined,
            },
          });
          onDone();
        });
      }}
    >
      <Field label="Title">
        <input
          required
          maxLength={200}
          value={v.title}
          placeholder="A hotel, a train, a little detour…"
          onChange={(e) => change("title", e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Category">
          <select
            value={v.category}
            onChange={(e) =>
              change("category", e.target.value as Idea["category"])
            }
          >
            {ideaCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={v.status}
            onChange={(e) => change("status", e.target.value as Idea["status"])}
          >
            {ideaStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Link (optional)">
        <input
          type="url"
          maxLength={2000}
          value={v.link}
          placeholder="https://"
          onChange={(e) => change("link", e.target.value)}
        />
      </Field>
      <Field label="Notes (optional)">
        <textarea
          maxLength={10000}
          value={v.notes}
          placeholder="Why it’s worth considering, options to compare…"
          onChange={(e) => change("notes", e.target.value)}
        />
      </Field>
      <details className="optional-details">
        <summary>Location & estimated cost</summary>
        <Field label="Location (optional)">
          <input
            maxLength={500}
            value={v.location}
            onChange={(e) => change("location", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Estimated cost (optional)">
            <input
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
          <Field label="Currency">
            <select
              value={v.currency}
              onChange={(e) => change("currency", e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
      </details>
      {action.error && <Notice tone="error">{action.error}</Notice>}
      <div className="dialog-actions">
        <Button className="primary" type="submit" disabled={action.busy}>
          {action.busy ? "Saving…" : "Save idea"}
        </Button>
      </div>
    </form>
  );
}
