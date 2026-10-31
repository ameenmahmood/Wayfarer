import { useRef, useState } from "react";
import {
  Plus,
  ArrowDown,
  ArrowUp,
  Copy,
  Trash2,
  Pencil,
  MapPin,
  Clock,
  Plane,
  Building2,
  Utensils,
  Footprints,
  Bookmark,
  Route,
  ChevronRight,
  Menu as DragHandleIcon,
  ExternalLink,
  CalendarDays,
} from "lucide-react";
import { days, makeEntity, type Entity, type Trip, type Entry } from "./model";
import { save, remove } from "./store";
import { travel, warnings, entryBounds, formatTime } from "./schedule";
import { money } from "./money";
import { EntryForm } from "./Forms";
import {
  Button,
  Modal,
  Field,
  Notice,
  Empty,
  useAsyncAction,
  ScrollRail,
} from "./ui";
import MapPanel from "./MapPanel";
import TravelLeg from "./TravelLeg";
import NearbyPlaces from "./NearbyPlaces";
import RoutePlanner from "./RoutePlanner";
export default function Itinerary({
  trip,
  tripId,
  entries,
  canEdit,
  mapOnly = false,
}: {
  trip: Trip;
  tripId: string;
  entries: Entity<Entry>[];
  canEdit: boolean;
  mapOnly?: boolean;
}) {
  const pointerDrag = useRef<{
    id: string;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const [date, setDate] = useState(trip.start),
    [view, setView] = useState("day"),
    [selected, setSelected] = useState(""),
    [editing, setEditing] = useState<Entity<Entry>>(),
    [route, setRoute] = useState(false),
    [nearby, setNearby] = useState(false),
    [moving, setMoving] = useState<Entity<Entry>>(),
    [drag, setDrag] = useState(""),
    [dropTarget, setDropTarget] = useState(""),
    [reorderMessage, setReorderMessage] = useState(""),
    [mode, setMode] = useState("WALK"),
    [showWarnings, setShowWarnings] = useState(false),
    a = useAsyncAction();
  const dayList = days(trip.start, trip.end),
    filtered = entries
      .filter((e) =>
        view === "saved"
          ? !e.data.date
          : view === "all"
            ? !!e.data.date
            : e.data.date &&
              e.data.date <= date &&
              (e.data.endDate || e.data.date) >= date,
      )
      .sort((a, b) =>
        view === "all"
          ? `${a.data.date}${a.data.start}`.localeCompare(
              `${b.data.date}${b.data.start}`,
            )
          : a.data.order - b.data.order,
      );
  const dayEntries = filtered.filter(
    (e) => e.data.date === date && e.data.endDate <= date,
  );
  const alerts = (() => {
    try {
      return warnings(
        dayEntries.map((e) => e.data),
        mode,
        undefined,
        (from, to) => {
          const fromEntity = dayEntries.find((e) => e.data === from);
          const leg =
            to.arrival?.fromId === fromEntity?.id ? to.arrival : undefined;
          return leg?.manualMinutes ?? travel(from, to, leg?.mode || mode);
        },
      );
    } catch {
      return [
        "An entry has an invalid local time. Edit it to resolve the schedule.",
      ];
    }
  })();
  const add = (d = date) =>
    setEditing(
      makeEntity("entry", tripId, {
        title: "",
        type: "Activity",
        date: d,
        endDate: d,
        start: d ? "09:00" : "",
        end: "",
        duration: 60,
        zone: trip.zone,
        address: "",
        notes: "",
        link: "",
        reservation: "",
        cost: 0,
        currency: trip.currency,
        fixed: false,
        order: entries.length,
      }),
    );
  async function reorder(id: string, target: string) {
    if (!canEdit || view !== "day") return;
    const list = [...filtered],
      from = list.findIndex((e) => e.id === id),
      to = list.findIndex((e) => e.id === target);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    for (let i = 0; i < list.length; i++)
      if (list[i].data.order !== i)
        await save({ ...list[i], data: { ...list[i].data, order: i } });
    setReorderMessage(
      `${item.data.title} moved to position ${to + 1}. Activity times have not changed.`,
    );
  }
  const Icon = (type: string) =>
    type === "Flight"
      ? Plane
      : type === "Lodging"
        ? Building2
        : type === "Restaurant"
          ? Utensils
          : Footprints;
  return (
    <>
      <div className="content-heading itinerary-heading">
        <div>
          <h2>{mapOnly ? "Every place, in one view" : "Itinerary"}</h2>
          <p>
            {mapOnly
              ? "Pick a stop to connect your map and itinerary."
              : `${entries.filter((e) => e.data.date).length} plans · ${dayList.length} ${dayList.length === 1 ? "day" : "days"}`}
          </p>
        </div>
        {canEdit && (
          <Button
            className="primary"
            onClick={() => add(view === "saved" ? "" : date)}
          >
            <Plus size={17} />
            Add a plan
          </Button>
        )}
      </div>
      <div className="itinerary-toolbar">
        <div className="segmented" role="group" aria-label="Itinerary view">
          <button
            aria-pressed={view === "day"}
            className={view === "day" ? "active" : ""}
            onClick={() => setView("day")}
          >
            <CalendarDays size={15} />
            Daily plan
          </button>
          <button
            aria-pressed={view === "all"}
            className={view === "all" ? "active" : ""}
            onClick={() => setView("all")}
          >
            Whole trip
          </button>
          <button
            aria-pressed={view === "saved"}
            className={view === "saved" ? "active" : ""}
            onClick={() => setView("saved")}
          >
            <Bookmark size={14} />
            Saved places{" "}
            <span>{entries.filter((e) => !e.data.date).length}</span>
          </button>
        </div>
        {canEdit && view === "day" && dayEntries.length > 0 && (
          <div
            className="itinerary-tools"
            role="group"
            aria-label="Day planning tools"
          >
            <Button
              onClick={() => setRoute(true)}
              title="Preview a route before applying changes"
            >
              <Route size={15} />
              Optimize day
            </Button>
          </div>
        )}
      </div>
      <span className="visually-hidden" role="status" aria-live="polite">
        {reorderMessage}
      </span>
      {view === "day" && (
        <ScrollRail className="day-strip" label="Trip days">
          {dayList.map((d, i) => (
            <button
              key={d}
              className={d === date ? "active" : ""}
              onClick={(e) => {
                setDate(d);
                e.currentTarget.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
              }}
              aria-pressed={d === date}
            >
              <small>DAY {i + 1}</small>
              <b>
                {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                })}
              </b>
              <span>
                {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <i
                className={
                  entries.some((e) => e.data.date === d) ? "has-plans" : ""
                }
              />
            </button>
          ))}
        </ScrollRail>
      )}
      <div className={"itinerary-columns " + (mapOnly ? "map-first" : "")}>
        <section className="timeline-panel">
          <div className="day-heading">
            <div>
              <span className="eyebrow">
                {view === "saved"
                  ? "YOUR LITTLE COLLECTION"
                  : view === "all"
                    ? "THE ADVENTURE"
                    : "DAY " + (dayList.indexOf(date) + 1)}
              </span>
              <h3>
                {view === "saved"
                  ? "For when inspiration strikes"
                  : view === "all"
                    ? trip.destinations
                    : new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
              </h3>
              <small>
                {filtered.length} plans · {trip.zone.replace("_", " ")}
              </small>
            </div>
            {alerts.length > 0 && view === "day" && (
              <button
                className="pill amber"
                onClick={() => setShowWarnings(!showWarnings)}
              >
                {alerts.length} checks <ChevronRight size={13} />
              </button>
            )}
          </div>
          {showWarnings && alerts.length > 0 && view === "day" && (
            <div className="schedule-alerts">
              {alerts.map((msg, i) => (
                <Notice key={i}>{msg}</Notice>
              ))}
              <small>
                Travel checks use saved manual times where available, otherwise
                rough straight-line estimates for each travel method. Live leg
                estimates appear beside their activities.
              </small>
            </div>
          )}
          {!filtered.length && (
            <Empty
              title={
                view === "saved"
                  ? "Save a little possibility"
                  : "A beautifully open day"
              }
            >
              {view === "saved"
                ? "Add a place without a date and come back to it later."
                : "Add your first plan. Keep it flexible or lock in a reservation."}
            </Empty>
          )}
          <span id="activity-reorder-help" className="visually-hidden">
            Drag the three-bar handle to change activity order. With the handle
            focused, press the up or down arrow key, or use the move buttons
            below. Reordering does not change activity times.
          </span>
          <div className="timeline">
            {filtered.map((e, i) => {
              const EIcon = Icon(e.data.type),
                previous = filtered[i - 1];
              return (
                <div key={e.id} className="timeline-wrap">
                  {previous &&
                    view !== "saved" &&
                    previous.data.date === e.data.date && (
                      <TravelLeg
                        key={`${previous.id}:${e.id}`}
                        previous={previous}
                        entry={e}
                        mode={mode}
                        canEdit={canEdit}
                      />
                    )}
                  <article
                    id={e.id}
                    className={`plan-card ${canEdit && view === "day" ? "can-reorder" : ""} ${drag === e.id ? "is-dragging" : ""} ${dropTarget === e.id && drag !== e.id ? "drop-target" : ""} ${selected === e.id ? "selected" : ""}`}
                  >
                    {canEdit && view === "day" && (
                      <button
                        className="activity-drag-handle"
                        aria-label={`Reorder ${e.data.title}`}
                        aria-describedby="activity-reorder-help"
                        title="Drag to reorder · or use the up/down arrows"
                        draggable={false}
                        aria-disabled={a.busy}
                        onPointerDown={(ev) => {
                          if (a.busy || ev.button !== 0) return;
                          pointerDrag.current = {
                            id: e.id,
                            x: ev.clientX,
                            y: ev.clientY,
                            active: false,
                          };
                          ev.currentTarget.setPointerCapture?.(ev.pointerId);
                        }}
                        onPointerMove={(ev) => {
                          const moving = pointerDrag.current;
                          if (!moving) return;
                          if (
                            !moving.active &&
                            Math.hypot(
                              ev.clientX - moving.x,
                              ev.clientY - moving.y,
                            ) < 6
                          )
                            return;
                          ev.preventDefault();
                          moving.active = true;
                          setDrag(moving.id);
                          const target = document
                            .elementFromPoint(ev.clientX, ev.clientY)
                            ?.closest<HTMLElement>(".plan-card");
                          setDropTarget(target?.id || "");
                        }}
                        onPointerUp={(ev) => {
                          const moving = pointerDrag.current;
                          pointerDrag.current = null;
                          if (
                            ev.currentTarget.hasPointerCapture?.(ev.pointerId)
                          )
                            ev.currentTarget.releasePointerCapture(
                              ev.pointerId,
                            );
                          const target = document
                            .elementFromPoint(ev.clientX, ev.clientY)
                            ?.closest<HTMLElement>(".plan-card");
                          if (moving?.active && target)
                            void a.run(() => reorder(moving.id, target.id));
                          setDrag("");
                          setDropTarget("");
                        }}
                        onPointerCancel={() => {
                          pointerDrag.current = null;
                          setDrag("");
                          setDropTarget("");
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown")
                            return;
                          ev.preventDefault();
                          ev.stopPropagation();
                          if (a.busy) return;
                          const target =
                            filtered[i + (ev.key === "ArrowUp" ? -1 : 1)];
                          if (target)
                            void a.run(() => reorder(e.id, target.id));
                        }}
                      >
                        <DragHandleIcon size={16} aria-hidden="true" />
                      </button>
                    )}
                    <div className="timeline-dot">{i + 1}</div>
                    <div
                      className="plan-main"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setSelected(e.id);
                        }
                      }}
                      onClick={() => {
                        setSelected(e.id);
                        if (mapOnly)
                          document
                            .querySelector(".map-card")
                            ?.scrollIntoView({ block: "nearest" });
                      }}
                    >
                      <div className="plan-top">
                        <span
                          className={`type-icon ${e.data.type.toLowerCase()}`}
                        >
                          <EIcon size={18} />
                        </span>
                        <h3>{e.data.title}</h3>
                        <span className="plan-type">{e.data.type}</span>
                        {e.data.fixed && <span className="pill">Fixed</span>}
                        <span className="plan-time">
                          {formatTime(e.data.start)}
                        </span>
                      </div>
                      {view === "all" && <small>{e.data.date}</small>}
                      {e.data.address && (
                        <p className="place-address">
                          <MapPin size={13} />
                          {e.data.address}
                        </p>
                      )}
                      {e.data.notes && (
                        <p className="plan-notes">{e.data.notes}</p>
                      )}
                      <div className="plan-details">
                        <span>
                          {e.data.zone}
                          {e.data.endZone && e.data.endZone !== e.data.zone
                            ? " → " + e.data.endZone
                            : ""}
                        </span>
                        <span>
                          <Clock size={13} />
                          {e.data.duration} min
                        </span>
                        {e.data.cost > 0 && (
                          <span>
                            Est. {money(e.data.cost, e.data.currency)}
                          </span>
                        )}
                        {e.data.endDate > e.data.date && (
                          <span>
                            Until {e.data.endDate}{" "}
                            {e.data.end ? formatTime(e.data.end) : ""}
                          </span>
                        )}
                        {e.data.reservation && (
                          <span>{e.data.reservation}</span>
                        )}
                      </div>
                      {e.data.link && (
                        <a
                          className="plan-link"
                          href={e.data.link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          Open link <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    {canEdit && (
                      <div className="plan-actions">
                        <span className="updated">
                          Changed {new Date(e.updatedAt).toLocaleDateString()} ·{" "}
                          {trip.people.find((p) => p.id === e.updatedBy)
                            ?.name || "Traveler"}
                        </span>
                        <div>
                          <button
                            className="icon-button"
                            aria-label={`Move ${e.data.title} up`}
                            disabled={i === 0 || view !== "day"}
                            onClick={() =>
                              a.run(() => reorder(e.id, filtered[i - 1].id))
                            }
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Move ${e.data.title} down`}
                            disabled={
                              i === filtered.length - 1 || view !== "day"
                            }
                            onClick={() =>
                              a.run(() => reorder(e.id, filtered[i + 1].id))
                            }
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${e.data.title}`}
                            onClick={() => setEditing(e)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Move or duplicate ${e.data.title}`}
                            onClick={() => setMoving(e)}
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete ${e.data.title}`}
                            onClick={() => a.run(() => remove(e))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                </div>
              );
            })}
          </div>
          {canEdit && (
            <button
              className="add-plan"
              onClick={() => add(view === "saved" ? "" : date)}
            >
              <Plus size={17} />
              {view === "saved" ? "Save a place" : "Add something to this day"}
            </button>
          )}
        </section>
        <aside className="day-aside">
          <Field label="Preferred transport">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="WALK">Walking</option>
              <option value="DRIVE">Driving</option>
              <option value="BICYCLE">Cycling</option>
              <option value="TRANSIT">Public transit</option>
            </select>
          </Field>
          <MapPanel
            entries={filtered}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              document.getElementById(id)?.scrollIntoView({ block: "nearest" });
            }}
            tripId={tripId}
            mode={mode}
          />
          <section className="inspiration-card">
            <span className="type-icon">
              <MapPin size={20} />
            </span>
            <h3>Find your next little detour.</h3>
            <p>
              Browse cafés, food, parks and sights around a destination or a
              stop on your itinerary.
            </p>
            <Button onClick={() => setNearby(true)}>
              Find places nearby <ChevronRight size={15} />
            </Button>
            <small>Google Places · internet required</small>
          </section>
          <div className="travel-note">
            <span>✳</span>
            <p>
              Good trips aren’t packed to the minute.
              <br />A little breathing room goes a long way.
            </p>
          </div>
        </aside>
      </div>
      {a.error && <Notice tone="error">{a.error}</Notice>}
      {editing && (
        <Modal
          title={
            editing.version ? "Edit your plan" : "A new plan, a new possibility"
          }
          onClose={() => setEditing(undefined)}
          wide
        >
          <EntryForm
            entity={editing}
            trip={trip}
            onDone={() => setEditing(undefined)}
          />
        </Modal>
      )}
      {route && (
        <Modal
          title="A smoother way through your day"
          onClose={() => setRoute(false)}
          wide
        >
          <RoutePlanner
            entries={entries}
            date={date}
            trip={trip}
            tripId={tripId}
            onDone={() => setRoute(false)}
          />
        </Modal>
      )}
      {moving && (
        <Modal
          title="Move or duplicate this plan"
          onClose={() => setMoving(undefined)}
        >
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const f = new FormData(ev.currentTarget);
              a.run(async () => {
                const target = String(f.get("date")),
                  duplicate = f.get("action") === "duplicate";
                const next = {
                  ...moving.data,
                  date: target,
                  endDate: target,
                  order: entries.length,
                };
                await save(
                  duplicate
                    ? makeEntity("entry", tripId, next)
                    : { ...moving, data: next },
                );
                setMoving(undefined);
              });
            }}
          >
            <p>{moving.data.title}</p>
            <Field label="Destination day">
              <select name="date" defaultValue={date}>
                <option value="">Unscheduled saved place</option>
                {dayList.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Action">
              <select name="action">
                <option value="move">Move original</option>
                <option value="duplicate">Create a duplicate</option>
              </select>
            </Field>
            <Notice>
              Moving or duplicating resets the end date to the selected day.
              Edit the entry afterward to set a multi-day stay.
            </Notice>
            <Button type="submit" className="primary">
              Save change
            </Button>
            {a.error && <Notice tone="error">{a.error}</Notice>}
          </form>
        </Modal>
      )}
      {nearby && (
        <Modal title="Find places nearby" onClose={() => setNearby(false)} wide>
          <NearbyPlaces
            trip={trip}
            tripId={tripId}
            entries={entries}
            selected={selected}
            date={date}
            canEdit={canEdit}
            onPick={(placeId, targetDate, type) => {
              setNearby(false);
              setEditing(
                makeEntity("entry", tripId, {
                  title: "",
                  type,
                  date: targetDate,
                  endDate: targetDate,
                  start: targetDate ? "09:00" : "",
                  end: "",
                  duration: 60,
                  zone: trip.zone,
                  address: "",
                  notes: "",
                  link: "",
                  reservation: "",
                  cost: 0,
                  currency: trip.currency,
                  fixed: false,
                  order: entries.length,
                  placeId,
                }),
              );
            }}
          />
        </Modal>
      )}
    </>
  );
}
