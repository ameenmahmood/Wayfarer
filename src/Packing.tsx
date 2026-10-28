import { useState } from "react";
import { Plus, Trash2, PackageCheck, Bookmark, Pencil } from "lucide-react";
import {
  makeEntity,
  type Entity,
  type Trip,
  type Packing as Item,
} from "./model";
import { save, remove, userId } from "./store";
import { Button, Modal, Field, Notice, Empty, useAsyncAction } from "./ui";
export default function Packing({
  trip,
  tripId,
  items,
  templates,
  canEdit,
}: {
  trip: Trip;
  tripId: string;
  items: Entity<Item>[];
  templates: Entity[];
  canEdit: boolean;
}) {
  const [scope, setScope] = useState("shared"),
    [editing, setEditing] = useState<Entity<Item>>(),
    a = useAsyncAction();
  const visible = items.filter((e) =>
      scope === "shared"
        ? !e.data.personal
        : e.data.personal && e.data.assigned === userId,
    ),
    packed = visible.filter((e) => e.data.packed).length;
  return (
    <>
      <div className="content-heading">
        <div>
          <h2>Room for everything you need</h2>
          <p>Shared essentials and a checklist that’s just yours.</p>
        </div>
        {canEdit && (
          <Button
            className="primary"
            onClick={() =>
              setEditing(
                makeEntity("packing", tripId, {
                  title: "",
                  category: "Essentials",
                  quantity: 1,
                  notes: "",
                  assigned: scope === "personal" ? userId : "",
                  personal: scope === "personal",
                  packed: false,
                }),
              )
            }
          >
            <Plus size={17} />
            Add item
          </Button>
        )}
      </div>
      <div className="packing-toolbar">
        <div className="segmented">
          <button
            className={scope === "shared" ? "active" : ""}
            onClick={() => setScope("shared")}
          >
            Trip-wide list
          </button>
          <button
            className={scope === "personal" ? "active" : ""}
            onClick={() => setScope("personal")}
          >
            My personal list
          </button>
        </div>
        <span>
          {packed} of {visible.length} packed
        </span>
      </div>
      <progress
        className="packing-progress"
        max={Math.max(visible.length, 1)}
        value={packed}
      />
      <div className="two-columns">
        <section className="panel">
          {!visible.length && (
            <Empty title="Travel a little lighter">
              Start a list or use a saved template.
            </Empty>
          )}
          {[...new Set(visible.map((e) => e.data.category))].map((c) => (
            <div key={c}>
              <h3 className="packing-category">{c}</h3>
              {visible
                .filter((e) => e.data.category === c)
                .map((e) => (
                  <div className="packing-row" key={e.id}>
                    <input
                      aria-label={`Mark ${e.data.title} packed`}
                      type="checkbox"
                      checked={e.data.packed}
                      disabled={!canEdit || a.busy}
                      onChange={(ev) =>
                        a.run(() =>
                          save({
                            ...e,
                            data: { ...e.data, packed: ev.target.checked },
                          }),
                        )
                      }
                    />
                    <div className="grow">
                      <b className={e.data.packed ? "struck" : ""}>
                        {e.data.title}
                      </b>
                      <small>
                        {e.data.quantity} × ·{" "}
                        {trip.people.find((p) => p.id === e.data.assigned)
                          ?.name || "Anyone"}
                        {e.data.notes ? " · " + e.data.notes : ""}
                      </small>
                      <small>
                        Changed {new Date(e.updatedAt).toLocaleString()}
                      </small>
                    </div>
                    {canEdit && (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${e.data.title}`}
                          onClick={() => setEditing(e)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${e.data.title}`}
                          disabled={a.busy}
                          onClick={() => a.run(() => remove(e))}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </section>
        <div className="stack">
          <section className="panel template-panel">
            <PackageCheck size={28} />
            <h3>Good lists travel well</h3>
            <p>
              Save this checklist as a reusable template. Packed status resets
              when you use it.
            </p>
            <Button
              disabled={!canEdit || !visible.length || a.busy}
              onClick={() =>
                a.run(async () => {
                  await save(
                    makeEntity("template", tripId, {
                      title: `${scope === "shared" ? "Shared" : "Personal"} essentials · ${new Date().toLocaleDateString()}`,
                      personal: scope === "personal",
                      assigned: scope === "personal" ? userId : "",
                      items: visible.map((e) => ({ ...e.data, packed: false })),
                    }),
                  );
                })
              }
            >
              <Bookmark size={16} />
              Save as template
            </Button>
            {templates.map((t) => (
              <div className="template-row" key={t.id}>
                <span>{t.data.title}</span>
                <Button
                  disabled={!canEdit || a.busy}
                  onClick={() =>
                    a.run(async () => {
                      for (const item of t.data.items)
                        await save(
                          makeEntity("packing", tripId, {
                            ...item,
                            personal: scope === "personal",
                            assigned: scope === "personal" ? userId : "",
                            packed: false,
                          }),
                        );
                    })
                  }
                >
                  Use list
                </Button>
                <button
                  className="icon-button"
                  aria-label={`Delete template ${t.data.title}`}
                  disabled={!canEdit || a.busy}
                  onClick={() => a.run(() => remove(t))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>
          <Notice>
            Personal items belong to your account. In connected mode, other
            travelers cannot read or change them. Shared items synchronize with
            the group.
          </Notice>
        </div>
      </div>
      {a.error && <Notice tone="error">{a.error}</Notice>}
      {editing && (
        <Modal
          title={editing.version ? "Edit packing item" : "Add packing item"}
          onClose={() => setEditing(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              a.run(async () => {
                if (editing.data.quantity < 1)
                  throw Error("Quantity must be positive.");
                await save(editing);
                setEditing(undefined);
              });
            }}
          >
            {(["title", "category", "notes"] as const).map((k) => (
              <Field
                key={k}
                label={
                  { title: "Item name", category: "Category", notes: "Notes" }[
                    k
                  ]
                }
              >
                <input
                  required={k !== "notes"}
                  value={editing.data[k]}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      data: { ...editing.data, [k]: e.target.value },
                    })
                  }
                />
              </Field>
            ))}
            <Field label="Quantity">
              <input
                type="number"
                min="1"
                step="1"
                required
                value={editing.data.quantity}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    data: { ...editing.data, quantity: Number(e.target.value) },
                  })
                }
              />
            </Field>
            {!editing.data.personal && (
              <Field label="Assigned to">
                <select
                  value={editing.data.assigned}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      data: { ...editing.data, assigned: e.target.value },
                    })
                  }
                >
                  <option value="">Anyone</option>
                  {trip.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {a.error && <Notice tone="error">{a.error}</Notice>}
            <Button type="submit" className="primary" disabled={a.busy}>
              Save item
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
