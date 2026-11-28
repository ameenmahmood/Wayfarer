import { useState } from "react";
import { Footprints, Car, Bike, TramFront, ChevronRight } from "lucide-react";
import type { Entity, Entry } from "./model";
import { demo, save } from "./store";
import { formatTravelDuration, formatTime } from "./schedule";
import { Button, Field, Modal, Notice, useAsyncAction } from "./ui";
import TransferBookingForm from "./TransferBookingForm";
import {
  activityMode,
  savedArrival,
  formatRouteDistance,
  requestActivityRoute,
  type ActivityEstimate,
} from "./activityRoutes";

export default function ActivityConnection({
  previous,
  entry,
  estimate,
  canEdit,
  onSelect,
}: {
  previous: Entity<Entry>;
  entry: Entity<Entry>;
  estimate: ActivityEstimate;
  canEdit: boolean;
  onSelect: (id: string) => void;
}) {
  const leg = { previous, entry },
    arrival = savedArrival(leg),
    booking = arrival?.booking;
  const [open, setOpen] = useState(false),
    [editingBooking, setEditingBooking] = useState(false);
  const [manual, setManual] = useState(arrival?.manualMinutes !== undefined);
  const a = useAsyncAction();
  const labels: Record<string, string> = {
    WALK: "walk",
    DRIVE: "drive",
    BICYCLE: "cycle",
    TRANSIT: "transit",
    MANUAL: "travel",
  };
  const Icon =
    (
      {
        WALK: Footprints,
        DRIVE: Car,
        BICYCLE: Bike,
        TRANSIT: TramFront,
      } as Record<string, typeof Car>
    )[estimate.mode] || Car;
  const duration = arrival?.manualMinutes ?? estimate.minutes;
  const text =
    duration !== undefined
      ? `${formatTravelDuration(duration)} ${labels[estimate.mode] || "travel"}${estimate.distanceMeters !== undefined ? ` · ${formatRouteDistance(estimate.distanceMeters)}` : ""}${arrival?.manualMinutes !== undefined ? " · manual" : ""}`
      : estimate.state === "loading"
        ? "Calculating route…"
        : "Route unavailable";
  return (
    <>
      <button
        className="activity-connection"
        aria-label={`Travel from ${previous.data.title} to ${entry.data.title}: ${booking ? `${booking.title || booking.transport} · ` : ""}${text}`}
        onClick={() => {
          onSelect(entry.id);
          setManual(arrival?.manualMinutes !== undefined);
          setEditingBooking(false);
          setOpen(true);
        }}
      >
        <Icon size={15} aria-hidden="true" />
        <span>
          {booking && <strong>{booking.title || booking.transport} · </strong>}
          {text}
          {booking?.pickup && (
            <small> · Pickup {formatTime(booking.pickup.time)}</small>
          )}
        </span>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      {open && (
        <Modal title="Travel between activities" onClose={() => setOpen(false)}>
          <p className="connection-endpoints">
            {previous.data.title} → {entry.data.title}
          </p>
          <p className="connection-estimate" role="status">
            <Icon size={18} /> {text}
          </p>
          {estimate.state === "error" && <Notice>{estimate.error}</Notice>}
          {estimate.state === "ready" && (
            <small className="muted">
              Google Maps estimate
              {estimate.mode === "DRIVE" ? " · average traffic" : ""}. Activity
              times stay unchanged.
            </small>
          )}
          {estimate.warnings?.map((warning) => (
            <Notice key={warning}>{warning}</Notice>
          ))}
          {editingBooking && canEdit ? (
            <TransferBookingForm
              booking={booking}
              date={entry.data.date}
              defaultTime={previous.data.end || ""}
              zone={previous.data.zone}
              onCancel={() => setEditingBooking(false)}
              onSave={async (next) => {
                const mode = [
                  "Taxi",
                  "Private transfer",
                  "Rental car",
                ].includes(next.transport)
                  ? "DRIVE"
                  : ["Train", "Bus"].includes(next.transport)
                    ? "TRANSIT"
                    : "MANUAL";
                await save({
                  ...entry,
                  data: {
                    ...entry.data,
                    arrival: {
                      fromId: previous.id,
                      mode,
                      booking: next,
                      ...(arrival?.manualMinutes !== undefined
                        ? { manualMinutes: arrival.manualMinutes }
                        : {}),
                    },
                  },
                });
                setOpen(false);
              }}
            />
          ) : (
            <>
              <form
                className="connection-settings"
                onSubmit={(event) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  a.run(async () => {
                    const minutes = manual
                      ? Number(fields.get("minutes"))
                      : undefined;
                    if (
                      minutes !== undefined &&
                      (!Number.isInteger(minutes) ||
                        minutes < 0 ||
                        minutes > 10080)
                    )
                      throw Error("Enter 0–10080 whole minutes.");
                    await save({
                      ...entry,
                      data: {
                        ...entry.data,
                        arrival: {
                          fromId: previous.id,
                          mode: String(fields.get("mode")),
                          ...(minutes !== undefined
                            ? { manualMinutes: minutes }
                            : {}),
                          ...(booking ? { booking } : {}),
                        },
                      },
                    });
                    setOpen(false);
                  });
                }}
              >
                <Field
                  label="Travel mode"
                  hint={
                    !booking
                      ? "Auto walks up to 20 minutes; otherwise it uses driving."
                      : undefined
                  }
                >
                  <select
                    name="mode"
                    defaultValue={activityMode(leg)}
                    disabled={!canEdit || a.busy}
                  >
                    {!booking && (
                      <option value="AUTO">Auto (walk or drive)</option>
                    )}
                    <option value="WALK">Walk</option>
                    <option value="DRIVE">Drive</option>
                    <option value="BICYCLE">Cycle</option>
                    <option value="TRANSIT">Public transit</option>
                    {booking && activityMode(leg) === "MANUAL" && (
                      <option value="MANUAL">Booked transport</option>
                    )}
                  </select>
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={manual}
                    disabled={!canEdit || a.busy}
                    onChange={(event) => setManual(event.target.checked)}
                  />
                  Set time manually
                </label>
                {manual && (
                  <Field label="Travel minutes">
                    <input
                      name="minutes"
                      required
                      type="number"
                      min={0}
                      max={10080}
                      step={1}
                      defaultValue={
                        arrival?.manualMinutes ?? estimate.minutes ?? 15
                      }
                      disabled={!canEdit || a.busy}
                    />
                  </Field>
                )}
                <div className="button-row">
                  {canEdit && (
                    <Button type="submit" className="primary" disabled={a.busy}>
                      Save travel settings
                    </Button>
                  )}
                  <Button
                    disabled={
                      demo ||
                      !navigator.onLine ||
                      a.busy ||
                      estimate.state === "loading"
                    }
                    onClick={() => a.run(() => requestActivityRoute(leg, true))}
                  >
                    Refresh estimate
                  </Button>
                </div>
              </form>
              {canEdit && (
                <Button onClick={() => setEditingBooking(true)}>
                  {booking ? "Edit booked transport" : "Add booked transport"}
                </Button>
              )}
              {booking && (
                <dl className="connection-booking">
                  {[
                    ["Status", booking.status],
                    ["Company", booking.company],
                    ["Meeting point", booking.meetingPoint],
                    ["Reference", booking.reference],
                    ["Contact", booking.contact],
                    ["Notes", booking.notes],
                    [
                      "Pickup",
                      booking.pickup
                        ? `${booking.pickup.date} · ${formatTime(booking.pickup.time)}`
                        : "",
                    ],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>
              )}
            </>
          )}
          {a.error && <Notice tone="error">{a.error}</Notice>}
        </Modal>
      )}
    </>
  );
}
