import { useState } from "react";
import type { TransferBooking } from "./model";
import { instant } from "./schedule";
import TimeInput from "./TimeInput";
import { Button, Field, Notice, useAsyncAction } from "./ui";

export default function TransferBookingForm({
  booking,
  date,
  defaultTime,
  zone,
  onSave,
  onCancel,
}: {
  booking?: TransferBooking;
  date: string;
  defaultTime: string;
  zone: string;
  onSave: (booking: TransferBooking) => Promise<void>;
  onCancel: () => void;
}) {
  const [transport, setTransport] = useState<TransferBooking["transport"]>(
    booking?.transport || "Taxi",
  );
  const [status, setStatus] = useState<TransferBooking["status"]>(
    booking?.status || "Planned",
  );
  const [fixed, setFixed] = useState(!!booking?.pickup);
  const [pickupDate, setPickupDate] = useState(booking?.pickup?.date || date);
  const [pickupTime, setPickupTime] = useState(
    booking?.pickup?.time || defaultTime || "09:00",
  );
  const a = useAsyncAction();
  return (
    <form
      className="transfer-booking-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        a.run(async () => {
          if (fixed) instant(pickupDate, pickupTime, zone);
          const text = (name: string) => String(data.get(name) || "").trim();
          await onSave({
            title: text("title"),
            transport,
            status,
            company: text("company"),
            meetingPoint: text("meetingPoint"),
            reference: text("reference"),
            contact: text("contact"),
            notes: text("notes"),
            ...(fixed
              ? { pickup: { date: pickupDate, time: pickupTime } }
              : {}),
          });
        });
      }}
    >
      <Field label="Travel title">
        <input
          name="title"
          placeholder="Airport taxi with Carlos"
          maxLength={200}
          defaultValue={booking?.title || ""}
        />
      </Field>
      <div className="form-grid">
        <Field label="Transport">
          <select
            value={transport}
            onChange={(event) =>
              setTransport(event.target.value as TransferBooking["transport"])
            }
          >
            {[
              "Taxi",
              "Private transfer",
              "Rental car",
              "Train",
              "Bus",
              "Ferry",
              "Other",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="Booking status">
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as TransferBooking["status"])
            }
          >
            {["Considering", "Planned", "Booked"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={fixed}
          onChange={(event) => setFixed(event.target.checked)}
        />
        Fixed pickup time
      </label>
      {fixed && (
        <div className="form-grid">
          <Field label="Pickup date">
            <input
              type="date"
              required
              value={pickupDate}
              onChange={(event) => setPickupDate(event.target.value)}
            />
          </Field>
          <Field label="Pickup time">
            <TimeInput
              label="Pickup time"
              value={pickupTime}
              onChange={setPickupTime}
              required
            />
          </Field>
        </div>
      )}
      <Field label="Company or driver">
        <input
          name="company"
          maxLength={200}
          defaultValue={booking?.company || ""}
        />
      </Field>
      <Field label="Meeting point">
        <input
          name="meetingPoint"
          maxLength={500}
          defaultValue={booking?.meetingPoint || ""}
        />
      </Field>
      <div className="form-grid">
        <Field label="Confirmation reference">
          <input
            name="reference"
            maxLength={200}
            defaultValue={booking?.reference || ""}
          />
        </Field>
        <Field label="Contact">
          <input
            name="contact"
            maxLength={200}
            defaultValue={booking?.contact || ""}
          />
        </Field>
      </div>
      <Field label="Travel notes">
        <textarea
          name="notes"
          maxLength={2000}
          defaultValue={booking?.notes || ""}
        />
      </Field>
      <small>
        Booking status is your record. Wayfarer does not make or verify
        reservations.
      </small>
      <div className="transfer-form-actions">
        <Button type="submit" className="primary" disabled={a.busy}>
          {a.busy ? "Saving…" : "Save travel details"}
        </Button>
        <Button type="button" onClick={onCancel} disabled={a.busy}>
          Cancel
        </Button>
      </div>
      {a.error && <Notice tone="error">{a.error}</Notice>}
    </form>
  );
}
