import { CalendarDays, Plus, X, Pencil, MapPin } from "lucide-react";
import type { Entity, Entry } from "./model";
import { formatTime } from "./schedule";
import { Button } from "./ui";
import MapPanel from "./MapPanel";
export default function MapWorkspace({
  entries,
  tripId,
  date,
  dates,
  view,
  selected,
  mode,
  canEdit,
  onDate,
  onView,
  onSelect,
  onMode,
  onAdd,
  onEdit,
}: {
  entries: Entity<Entry>[];
  tripId: string;
  date: string;
  dates: string[];
  view: string;
  selected: string;
  mode: string;
  canEdit: boolean;
  onDate: (date: string) => void;
  onView: (view: string) => void;
  onSelect: (id: string) => void;
  onMode: (mode: string) => void;
  onAdd: () => void;
  onEdit: (entry: Entity<Entry>) => void;
}) {
  const stop = entries.find((e) => e.id === selected);
  const located = entries.filter(
    (e) => e.data.placeId || (e.data.lat != null && e.data.lng != null),
  );
  return (
    <section className="map-workspace-view" aria-label="Expanded trip map">
      <div className="map-workspace-toolbar">
        <div className="map-workspace-heading">
          <h2>Every place, in one view</h2>
          <small>
            {located.length} {located.length === 1 ? "stop" : "stops"} on the
            map
          </small>
        </div>
        <div className="map-workspace-controls">
          <select
            aria-label="Map view"
            value={view}
            onChange={(e) => {
              onView(e.target.value);
              onSelect("");
            }}
          >
            <option value="day">Daily plan</option>
            <option value="all">Whole trip</option>
            <option value="saved">Saved places</option>
          </select>
          {view === "day" && (
            <label className="map-day-select">
              <CalendarDays size={15} aria-hidden="true" />
              <select
                aria-label="Map day"
                value={date}
                onChange={(e) => {
                  onDate(e.target.value);
                  onSelect("");
                }}
              >
                {dates.map((d, i) => (
                  <option key={d} value={d}>
                    Day {i + 1} ·{" "}
                    {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <select
            aria-label="Map transport"
            value={mode}
            onChange={(e) => onMode(e.target.value)}
          >
            <option value="WALK">Walking</option>
            <option value="DRIVE">Driving</option>
            <option value="BICYCLE">Cycling</option>
            <option value="TRANSIT">Public transit</option>
          </select>
          {canEdit && (
            <Button className="primary" onClick={onAdd}>
              <Plus size={16} />
              Add a plan
            </Button>
          )}
        </div>
      </div>
      <div className="map-workspace-stage">
        <MapPanel
          expanded
          entries={entries}
          selected={selected}
          onSelect={onSelect}
          tripId={tripId}
          mode={mode}
        />
        {!located.length && (
          <div className="map-workspace-empty">
            <MapPin size={17} />
            <span>
              No mapped stops in this view. Add a location to an activity, or
              choose another day.
            </span>
          </div>
        )}
        {stop && (
          <section className="map-stop-detail" aria-label="Selected map stop">
            <div>
              <h3>{stop.data.title}</h3>
              <p>
                {formatTime(stop.data.start)}
                {stop.data.address && ` · ${stop.data.address}`}
              </p>
            </div>
            {canEdit && (
              <Button
                onClick={() => onEdit(stop)}
                aria-label={`Edit ${stop.data.title}`}
              >
                <Pencil size={15} />
                Edit
              </Button>
            )}
            <button
              className="icon-button"
              aria-label="Close selected stop"
              onClick={() => onSelect("")}
            >
              <X size={17} />
            </button>
          </section>
        )}
      </div>
    </section>
  );
}
