import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Settings, LayoutGrid } from "lucide-react";
import type { Entity, Trip } from "./model";
import CoverPhoto from "./CoverPhoto";
import { getCover, suggestCovers } from "./covers";

export default function TripSwitcher({
  trips,
  currentId,
  onSelect,
  onDetails,
  onLibrary,
  onNew,
}: {
  trips: Entity<Trip>[];
  currentId: string;
  onSelect: (id: string) => void;
  onDetails: () => void;
  onLibrary: () => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const trip = trips.find((t) => t.id === currentId)?.data;
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  useEffect(() => setOpen(false), [currentId]);
  if (!trip) return null;
  const dates = (t: Trip) =>
    `${new Date(t.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(t.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const act = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  return (
    <div
      className="trip-switcher"
      ref={ref}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="trip-switcher-trigger"
        aria-label={`Switch trip: ${trip.title}`}
        aria-expanded={open}
        aria-controls="trip-switcher-options"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <b>{trip.title}</b>
          <small>{dates(trip)}</small>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div
          className="trip-switcher-options"
          id="trip-switcher-options"
          aria-label="Choose a trip"
        >
          <div className="trip-switcher-list">
            {trips.map((t) => (
              <button
                key={t.id}
                aria-label={`Open trip ${t.data.title}`}
                aria-current={t.id === currentId ? "true" : undefined}
                onClick={() => act(() => onSelect(t.id))}
              >
                <CoverPhoto
                  key={t.data.cover?.id || t.id}
                  cover={
                    t.data.cover
                      ? getCover(t.data.cover.id)
                      : suggestCovers(
                          `${t.data.title} ${t.data.destinations}`,
                        )[0] || getCover("forest")
                  }
                  position={t.data.cover?.position}
                  thumbnail
                  className="trip-switcher-photo"
                />
                <span>
                  <b>{t.data.title}</b>
                  <small>{dates(t.data)}</small>
                </span>
                {t.id === currentId && <Check size={17} />}
              </button>
            ))}
          </div>
          <div className="trip-switcher-actions">
            <button onClick={() => act(onDetails)}>
              <Settings size={16} />
              Trip details
              <ChevronDown size={14} />
            </button>
            <button onClick={() => act(onLibrary)}>
              <LayoutGrid size={16} />
              All trips
            </button>
            <button onClick={() => act(onNew)}>
              <Plus size={16} />
              New trip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
