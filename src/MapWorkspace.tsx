import {
  CalendarDays,
  X,
  Pencil,
  MapPin,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import type { Entity, Entry } from "./model";
import { formatTime } from "./schedule";
import { Button } from "./ui";
import MapPanel from "./MapPanel";
import { flightConnections, flightTiming } from "./flights";
export default function MapWorkspace({
  entries,
  contextEntries,
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
  onEdit,
  onBack,
}: {
  entries: Entity<Entry>[];
  contextEntries?: Entity<Entry>[];
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
  onEdit: (entry: Entity<Entry>) => void;
  onBack?: () => void;
}) {
  const stop = entries.find((e) => e.id === selected);
  const flight = flightConnections(entries, contextEntries || entries).find(
    (connection) =>
      connection.from.id === selected || connection.to.id === selected,
  );
  const located = entries.filter(
    (e) => e.data.placeId || (e.data.lat != null && e.data.lng != null),
  );
  const dayLabel = (day: string) =>
    new Date(day + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  return (
    <section
      className="map-workspace-view map-focus-view"
      aria-label="Expanded trip map"
    >
      <h2 className="visually-hidden">Map</h2>
      <div className="map-workspace-stage map-focus-stage">
        <div className="map-focus-navigation">
          {onBack && (
            <button
              className="map-overlay-button map-back-button"
              aria-label="Back to itinerary"
              onClick={onBack}
            >
              <ArrowLeft size={17} />
              <span>Back</span>
            </button>
          )}
          {view === "day" ? (
            <label className="map-focus-day">
              <CalendarDays
                className="map-day-calendar"
                size={15}
                aria-hidden="true"
              />
              <span className="map-day-size" aria-hidden="true">
                {dayLabel(date)}
              </span>
              <select
                aria-label="Map day"
                value={date}
                onChange={(event) => {
                  onDate(event.target.value);
                  onSelect("");
                }}
              >
                {dates.map((day) => (
                  <option key={day} value={day}>
                    {dayLabel(day)}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="map-day-chevron"
                size={12}
                aria-hidden="true"
              />
            </label>
          ) : (
            <span className="map-overlay-button">
              {view === "all" ? "Whole trip" : "Saved places"}
            </span>
          )}
        </div>
        <label className="map-focus-view-control">
          <span className="map-view-size" aria-hidden="true">
            {view === "day"
              ? "Daily plan"
              : view === "all"
                ? "Whole trip"
                : "Saved places"}
          </span>
          <select
            aria-label="Map view"
            value={view}
            onChange={(event) => {
              onView(event.target.value);
              onSelect("");
            }}
          >
            <option value="day">Daily plan</option>
            <option value="all">Whole trip</option>
            <option value="saved">Saved places</option>
          </select>
          <ChevronDown
            className="map-view-chevron"
            size={12}
            aria-hidden="true"
          />
        </label>
        <MapPanel
          expanded
          entries={entries}
          contextEntries={contextEntries}
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
              <h3>
                {flight ? flight.from.data.title : stop.data.title}
                {flight?.from.data.flight?.number && (
                  <small> · {flight.from.data.flight.number}</small>
                )}
              </h3>
              <p>
                {flight ? (
                  flightTiming(flight)
                ) : (
                  <>
                    {formatTime(stop.data.start)}
                    {stop.data.address && ` · ${stop.data.address}`}
                  </>
                )}
              </p>
            </div>
            {canEdit && (
              <Button
                onClick={() => onEdit(flight?.from || stop)}
                aria-label={`Edit ${flight?.from.data.title || stop.data.title}`}
              >
                <Pencil size={15} />
                Details
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
