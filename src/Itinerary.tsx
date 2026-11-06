import { displayNameFor } from "./profiles";
import MapWorkspace from "./MapWorkspace";
import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  ExternalLink,
  CalendarDays,
} from "lucide-react";
import { days, makeEntity, type Entity, type Trip, type Entry } from "./model";
import { api, save, remove, userId, demo } from "./store";
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
import { preservesTransfers } from "./transfers";
import NearbyPlaces from "./NearbyPlaces";
import RoutePlanner from "./RoutePlanner";
type PinDetails = {
  displayName?: { text?: string };
  formattedAddress?: string;
  location: { latitude: number; longitude: number };
  attributions?: { provider: string; providerUri?: string }[];
};

function useItineraryPins(tripId: string, placeIds: string[]) {
  const key = JSON.stringify([...new Set(placeIds)].sort());
  const lookup = useMemo(() => {
    const requests = new Map<string, Promise<PinDetails>>();
    return (id: string) => {
      let request = requests.get(id);
      if (!request) {
        request = api("place", tripId, { placeId: id }).catch((error) => {
          requests.delete(id);
          throw error;
        });
        requests.set(id, request);
      }
      return request;
    };
  }, [tripId, key]);
  const [result, setResult] = useState<{
    lookup: typeof lookup;
    pins: Record<string, PinDetails>;
  }>();
  useEffect(() => {
    if (demo) return;
    let active = true;
    async function load() {
      if (!navigator.onLine) return;
      const pins: Record<string, PinDetails> = {};
      for (const id of JSON.parse(key) as string[]) {
        if (!active) return;
        try {
          pins[id] = await lookup(id);
          if (active) setResult({ lookup, pins: { ...pins } });
        } catch {
          // The activity's saved information stays visible if Google is unavailable.
        }
      }
    }
    void load();
    window.addEventListener("online", load);
    return () => {
      active = false;
      window.removeEventListener("online", load);
    };
  }, [key, lookup]);
  return { lookup, pins: result?.lookup === lookup ? result.pins : undefined };
}

export default function Itinerary({
  trip,
  tripId,
  entries,
  canEdit,
  mapOnly = false,
  initialDate,
}: {
  trip: Trip;
  tripId: string;
  entries: Entity<Entry>[];
  canEdit: boolean;
  mapOnly?: boolean;
  initialDate?: string;
}) {
  const pointerDrag = useRef<{
    id: string;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const [date, setDate] = useState(initialDate || trip.start),
    [view, setView] = useState("day"),
    [selected, setSelected] = useState(""),
    [expandedEntry, setExpandedEntry] = useState<string>(),
    [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({}),
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
  const { lookup: lookupPin, pins } = useItineraryPins(
    tripId,
    mapOnly
      ? []
      : filtered.flatMap(({ data }) => (data.placeId ? [data.placeId] : [])),
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
    if (!preservesTransfers(list))
      throw Error(
        "This move separates saved travel details from their stops. Remove the linked travel details first, then rearrange the activities.",
      );
    for (let i = 0; i < list.length; i++)
      if (list[i].data.order !== i)
        await save({ ...list[i], data: { ...list[i].data, order: i } });
    setReorderMessage(
      `${item.data.title} moved to position ${to + 1}. Activity times have not changed.`,
    );
  }
  const hasTransferFor = (id: string) =>
    entries.some(
      (e) =>
        !!e.data.arrival?.booking &&
        (e.id === id || e.data.arrival.fromId === id),
    );
  const Icon = (type: string) =>
    type === "Flight"
      ? Plane
      : type === "Lodging"
        ? Building2
        : type === "Restaurant"
          ? Utensils
          : Footprints;
  const renderEntry = (e: Entity<Entry>, i: number, list: Entity<Entry>[]) => {
    const EIcon = Icon(e.data.type),
      previous = list[i - 1],
      pin = e.data.placeId ? pins?.[e.data.placeId] : undefined;
    return (
      <div key={e.id} className="timeline-wrap">
        {previous && view !== "saved" && previous.data.date === e.data.date && (
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
          className={`plan-card ${canEdit && view === "day" ? "can-reorder" : ""} ${drag === e.id ? "is-dragging" : ""} ${dropTarget === e.id && drag !== e.id ? "drop-target" : ""} ${selected === e.id ? "selected" : ""} ${expandedEntry === e.id ? "is-expanded" : ""}`}
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
                  Math.hypot(ev.clientX - moving.x, ev.clientY - moving.y) < 6
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
                if (ev.currentTarget.hasPointerCapture?.(ev.pointerId))
                  ev.currentTarget.releasePointerCapture(ev.pointerId);
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
                if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
                ev.preventDefault();
                ev.stopPropagation();
                if (a.busy) return;
                const target = list[i + (ev.key === "ArrowUp" ? -1 : 1)];
                if (target) void a.run(() => reorder(e.id, target.id));
              }}
            >
              <DragHandleIcon size={16} aria-hidden="true" />
            </button>
          )}
          <div className="activity-clock" aria-label={formatTime(e.data.start)}>
            <b>{formatTime(e.data.start).replace(/ (AM|PM)$/, "")}</b>
            {e.data.start && <span>{formatTime(e.data.start).slice(-2)}</span>}
          </div>
          <div className="timeline-dot">{i + 1}</div>
          <div
            className="plan-main"
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                setSelected(e.id);
                setExpandedEntry(e.id);
              }
            }}
            onClick={() => {
              setSelected(e.id);
              setExpandedEntry(e.id);
              if (mapOnly)
                document
                  .querySelector(".map-card")
                  ?.scrollIntoView({ block: "nearest" });
            }}
          >
            <div className="plan-top">
              <span className={`type-icon ${e.data.type.toLowerCase()}`}>
                <EIcon size={18} />
              </span>
              <h3>{e.data.title}</h3>
              <span className="plan-type">{e.data.type}</span>
              {e.data.fixed && <span className="pill">Fixed</span>}
              <span className="plan-time">{formatTime(e.data.start)}</span>
            </div>
            {(pin?.displayName?.text || pin?.formattedAddress) && (
              <div className="plan-google-pin">
                {pin.displayName?.text && <b>{pin.displayName.text}</b>}
                {pin.formattedAddress && (
                  <>
                    <span className="pin-address-short">
                      {pin.formattedAddress.split(",").length > 2
                        ? pin.formattedAddress
                            .split(",")
                            .slice(-3, -1)
                            .map((part) => part.trim())
                            .join(", ")
                        : pin.formattedAddress}
                    </span>
                    <span className="pin-address-full">
                      {pin.formattedAddress}
                    </span>
                  </>
                )}
                {pin.attributions?.map((attribution, i) => (
                  <span key={i}>{attribution.provider}</span>
                ))}
                <span className="google-attribution" translate="no">
                  Google Maps
                </span>
              </div>
            )}
            <div className="plan-summary">
              <span className="compact-duration">
                <EIcon size={14} aria-label={e.data.type} />
                {e.data.endDate > e.data.date
                  ? `Until ${new Date(e.data.endDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : `${e.data.duration} min`}
              </span>
              <span className="compact-location">
                {pin ? "" : e.data.address || e.data.type}
              </span>
              {e.data.fixed && <span className="compact-fixed">Fixed</span>}
            </div>
            <div
              className={`plan-secondary ${e.data.address || e.data.notes || e.data.cost > 0 || e.data.reservation || e.data.link || e.data.endDate > e.data.date || e.createdBy || e.updatedBy ? "has-detail-content" : ""}`}
              id={`plan-details-${e.id}`}
            >
              <div className="plan-attribution">
                {e.createdBy && (
                  <span
                    title={
                      e.createdAt
                        ? new Date(e.createdAt).toLocaleString()
                        : undefined
                    }
                  >
                    Added by{" "}
                    {displayNameFor(
                      e.createdBy,
                      trip.people.find((p) => p.id === e.createdBy)?.name,
                      userId,
                      demo,
                    )}
                  </span>
                )}
                {(!e.createdBy || e.version > 1) && (
                  <span title={new Date(e.updatedAt).toLocaleString()}>
                    Updated by{" "}
                    {displayNameFor(
                      e.updatedBy,
                      trip.people.find((p) => p.id === e.updatedBy)?.name,
                      userId,
                      demo,
                    )}{" "}
                    ·{" "}
                    {new Date(e.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
              {e.data.address && (
                <p className="place-address">
                  <MapPin size={13} />
                  {e.data.address}
                </p>
              )}
              {e.data.notes && <p className="plan-notes">{e.data.notes}</p>}
              <div className="plan-details">
                <span className="desktop-duration">
                  <Clock size={13} />
                  {e.data.duration} min
                </span>
                {e.data.cost > 0 && (
                  <span>Est. {money(e.data.cost, e.data.currency)}</span>
                )}
                {e.data.endDate > e.data.date && (
                  <span>
                    Until {e.data.endDate}{" "}
                    {e.data.end ? formatTime(e.data.end) : ""}
                  </span>
                )}
                {e.data.reservation && <span>{e.data.reservation}</span>}
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
          </div>
          <button
            className="plan-details-toggle icon-button"
            aria-label={`Details for ${e.data.title}`}
            aria-expanded={expandedEntry === e.id}
            aria-controls={`plan-details-${e.id}`}
            onClick={() => {
              setSelected(e.id);
              setExpandedEntry((current) =>
                current === e.id ? undefined : e.id,
              );
            }}
          >
            <ChevronDown size={17} />
          </button>
          {canEdit && (
            <div className="plan-actions">
              <div className="activity-action-row">
                <button
                  className="icon-button"
                  aria-label={`Move ${e.data.title} up`}
                  title="Move up"
                  disabled={a.busy || i === 0 || view !== "day"}
                  onClick={() => a.run(() => reorder(e.id, list[i - 1].id))}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${e.data.title} down`}
                  title="Move down"
                  disabled={a.busy || i === list.length - 1 || view !== "day"}
                  onClick={() => a.run(() => reorder(e.id, list[i + 1].id))}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Edit ${e.data.title}`}
                  title="Edit"
                  onClick={() => setEditing(e)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move or duplicate ${e.data.title}`}
                  title="Move or duplicate"
                  onClick={() => setMoving(e)}
                >
                  <Copy size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${e.data.title}`}
                  title="Delete"
                  disabled={a.busy}
                  onClick={() =>
                    a.run(async () => {
                      if (hasTransferFor(e.id))
                        throw Error(
                          "Remove the linked travel details before deleting this activity.",
                        );
                      await remove(e);
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
        </article>
      </div>
    );
  };
  const entryEditor = editing && (
    <Modal
      title={editing.version ? "Edit plan" : "Add a plan"}
      onClose={() => setEditing(undefined)}
      wide
    >
      <EntryForm
        entity={editing}
        trip={trip}
        onDone={() => setEditing(undefined)}
      />
    </Modal>
  );
  if (mapOnly)
    return (
      <>
        <MapWorkspace
          entries={filtered}
          tripId={tripId}
          date={date}
          dates={dayList}
          view={view}
          selected={selected}
          mode={mode}
          canEdit={canEdit}
          onDate={setDate}
          onView={setView}
          onSelect={setSelected}
          onMode={setMode}
          onAdd={() => add(view === "saved" ? "" : date)}
          onEdit={setEditing}
        />
        {entryEditor}
      </>
    );
  return (
    <>
      <div className="content-heading itinerary-heading">
        <div>
          <h2>{mapOnly ? "Map" : "Itinerary"}</h2>
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
            aria-label="Daily plan"
            aria-pressed={view === "day"}
            className={view === "day" ? "active" : ""}
            onClick={() => setView("day")}
          >
            <CalendarDays size={15} />
            <span className="view-label-full">Daily plan</span>
            <span className="view-label-compact" aria-hidden="true">
              Day plan
            </span>
          </button>
          <button
            aria-label="Whole trip"
            aria-pressed={view === "all"}
            className={view === "all" ? "active" : ""}
            onClick={() => setView("all")}
          >
            <span className="view-label-full">Whole trip</span>
            <span className="view-label-compact" aria-hidden="true">
              Whole trip
            </span>
          </button>
          <button
            aria-label={`Saved places ${entries.filter((e) => !e.data.date).length}`}
            aria-pressed={view === "saved"}
            className={view === "saved" ? "active" : ""}
            onClick={() => setView("saved")}
          >
            <Bookmark size={14} />
            <span className="view-label-full">Saved places</span>
            <span className="view-label-compact" aria-hidden="true">
              Saved
            </span>{" "}
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
              title="Optimize day · preview a route before applying changes"
              aria-label="Optimize day"
            >
              <Route size={15} />
              <span className="optimize-label">Optimize day</span>
              <span className="optimize-label-mobile" aria-hidden="true">
                Route
              </span>
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
              aria-label={`DAY ${i + 1} ${new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })} ${new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              aria-pressed={d === date}
            >
              <small>DAY {i + 1}</small>
              <b>
                {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                })}
              </b>
              <span className="day-label-full">
                {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="day-number" aria-hidden="true">
                {Number(d.slice(-2))}
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
      <div
        className={
          "itinerary-columns timeline-view " + (mapOnly ? "map-first" : "")
        }
      >
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
              <small className="day-context">
                {filtered.length} {filtered.length === 1 ? "plan" : "plans"}
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
                view === "saved" ? "No saved places" : "No plans for this day"
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
            {view === "all"
              ? [...new Set([...dayList, ...filtered.map((e) => e.data.date)])]
                  .sort()
                  .map((day) => {
                    const list = filtered.filter((e) => e.data.date === day);
                    const collapsed = collapsedDays[day] ?? list.length === 0;
                    const label = new Date(
                      day + "T12:00:00",
                    ).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      ...(day.slice(0, 4) !== trip.start.slice(0, 4)
                        ? { year: "numeric" }
                        : {}),
                    });
                    return (
                      <section className="whole-trip-day" key={day}>
                        <h3 className="whole-trip-day-heading">
                          <button
                            aria-expanded={!collapsed}
                            aria-controls={`plans-${day}`}
                            onClick={() =>
                              setCollapsedDays((current) => ({
                                ...current,
                                [day]: !collapsed,
                              }))
                            }
                          >
                            <span>{label}</span>
                            <small>
                              {list.length}{" "}
                              {list.length === 1 ? "plan" : "plans"}
                            </small>
                            <ChevronDown size={18} aria-hidden="true" />
                          </button>
                        </h3>
                        <div
                          className="whole-trip-day-plans"
                          id={`plans-${day}`}
                          hidden={collapsed}
                        >
                          {list.length ? (
                            list.map((entry, index) =>
                              renderEntry(entry, index, list),
                            )
                          ) : (
                            <p className="day-empty">No plans yet.</p>
                          )}
                          {canEdit && (
                            <Button
                              className="day-add-plan"
                              onClick={() => add(day)}
                            >
                              <Plus size={14} />
                              Add a plan
                            </Button>
                          )}
                        </div>
                      </section>
                    );
                  })
              : filtered.map((entry, index) =>
                  renderEntry(entry, index, filtered),
                )}
          </div>
          {canEdit && view !== "all" && (
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
            lookupPlace={lookupPin}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              const day = entries.find((entry) => entry.id === id)?.data.date;
              if (day)
                setCollapsedDays((current) => ({ ...current, [day]: false }));
              requestAnimationFrame(() =>
                document
                  .getElementById(id)
                  ?.scrollIntoView({ block: "nearest" }),
              );
            }}
            tripId={tripId}
            mode={mode}
          />
          <section className="inspiration-card">
            <span className="type-icon">
              <MapPin size={20} />
            </span>
            <h3>Nearby places</h3>
            <p>Find cafés, food, parks, and sights near your stops.</p>
            <Button onClick={() => setNearby(true)}>
              Find places nearby <ChevronRight size={15} />
            </Button>
            <small>Google Places · internet required</small>
          </section>
        </aside>
      </div>
      {a.error && <Notice tone="error">{a.error}</Notice>}
      {entryEditor}
      {route && (
        <Modal title="Optimize day" onClose={() => setRoute(false)} wide>
          <RoutePlanner
            entries={entries}
            date={date}
            trip={trip}
            tripId={tripId}
            initialMode={mode}
            onEditEntry={(entry) => {
              setRoute(false);
              setEditing(entry);
            }}
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
                if (
                  !duplicate &&
                  target !== moving.data.date &&
                  hasTransferFor(moving.id)
                )
                  throw Error(
                    "Remove the linked travel details before moving this activity to another day.",
                  );
                const next = {
                  ...moving.data,
                  ...(duplicate ? { arrival: undefined } : {}),
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
