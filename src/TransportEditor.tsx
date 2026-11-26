import { useRef, useState } from "react";
import { displayNameFor } from "./profiles";
import { RefreshCw, Route, Search } from "lucide-react";
import type { Entity, Entry, TransportLocation } from "./model";
import { api, demo, save } from "./store";
import { Field, Button, Notice, useAsyncAction } from "./ui";
import TimeInput from "./TimeInput";
import { entryBounds, formatTravelDuration } from "./schedule";
import {
  hasTransportLocation,
  resolveTransportLocation,
  transportArrival,
  transportMethods,
  transportProblem,
  transportQuery,
} from "./transport";
import { requestTransport, useTransportRoutes } from "./transportRoutes";

function LocationPicker({
  label,
  value,
  entries,
  tripId,
  onChange,
}: {
  label: string;
  value?: TransportLocation;
  entries: Entity<Entry>[];
  tripId: string;
  onChange: (value?: TransportLocation) => void;
}) {
  const [mode, setMode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [lat, setLat] = useState(String(value?.lat ?? ""));
  const [lng, setLng] = useState(String(value?.lng ?? ""));
  const [name, setName] = useState(value?.label || "");
  const latest = useRef(0);
  const action = useAsyncAction();
  const options = entries.filter(
    (e) =>
      !e.deleted &&
      e.data.type !== "Transportation" &&
      hasTransportLocation({
        label: e.data.title,
        placeId: e.data.placeId,
        lat: e.data.lat,
        lng: e.data.lng,
      }),
  );
  return (
    <div className="transport-location">
      <Field label={label}>
        <select
          aria-label={label}
          value={
            mode ||
            (value?.entryId ? `entry:${value.entryId}` : value ? "custom" : "")
          }
          onChange={(event) => {
            latest.current++;
            action.setError("");
            setResults([]);
            setSearched(false);
            const next = event.target.value;
            if (next === "search" || next === "coordinates") {
              setMode(next);
              return;
            }
            setMode("");
            const entry = entries.find((e) => `entry:${e.id}` === next);
            if (entry) onChange({ entryId: entry.id, label: entry.data.title });
            else if (!next) onChange(undefined);
          }}
        >
          <option value="">Choose a location…</option>
          {value?.entryId && !options.some((e) => e.id === value.entryId) && (
            <option value={`entry:${value.entryId}`}>
              {value.label} · location unavailable
            </option>
          )}
          {value && !value.entryId && (
            <option value="custom">{value.label}</option>
          )}
          <optgroup label="From your plans">
            {options.map((e) => (
              <option key={e.id} value={`entry:${e.id}`}>
                {e.data.title}
              </option>
            ))}
          </optgroup>
          <option value="search">Search a place or address…</option>
          <option value="coordinates">Enter a label and coordinates…</option>
        </select>
      </Field>
      {mode === "search" && (
        <div className="transport-place-search">
          <div className="search-row">
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder="Search a place or address"
              value={query}
              maxLength={200}
              onChange={(event) => {
                setQuery(event.target.value);
                latest.current++;
                setResults([]);
                setSearched(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
            <Button
              aria-label={`Search places for ${label.toLowerCase()}`}
              disabled={
                demo ||
                !navigator.onLine ||
                action.busy ||
                query.trim().length < 2
              }
              onClick={() => {
                const sequence = ++latest.current;
                void action.run(async () => {
                  const response = await api("places", tripId, {
                    query: query.trim(),
                  });
                  if (sequence !== latest.current) return;
                  setResults(response.places || []);
                  setSearched(true);
                });
              }}
            >
              <Search size={15} />
            </Button>
          </div>
          {demo && (
            <small>
              Place search needs a connected account. Choose a saved location or
              enter coordinates.
            </small>
          )}
          {searched && results.length === 0 && (
            <small>No places found. Try a more specific address.</small>
          )}
          {results.length > 0 && (
            <div className="search-results">
              <span className="google-attribution" translate="no">
                Google Maps
              </span>
              {results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => {
                    onChange({ label: query.trim(), placeId: place.id });
                    setMode("");
                    setResults([]);
                  }}
                >
                  {place.displayName?.text}
                  <small>{place.formattedAddress}</small>
                  {place.attributions?.map(
                    (attribution: any, index: number) => (
                      <small key={index}>{attribution.provider}</small>
                    ),
                  )}
                </button>
              ))}
            </div>
          )}
          {action.error && <Notice tone="error">{action.error}</Notice>}
        </div>
      )}
      {mode === "coordinates" && (
        <div className="transport-coordinates">
          <Field label={`${label} label`}>
            <input
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label={`${label} latitude`}>
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                value={lat}
                onChange={(event) => setLat(event.target.value)}
              />
            </Field>
            <Field label={`${label} longitude`}>
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                value={lng}
                onChange={(event) => setLng(event.target.value)}
              />
            </Field>
          </div>
          <Button
            disabled={
              !name.trim() ||
              !lat.trim() ||
              !lng.trim() ||
              !hasTransportLocation({
                label: name,
                lat: Number(lat),
                lng: Number(lng),
              })
            }
            onClick={() => {
              onChange({
                label: name.trim(),
                lat: Number(lat),
                lng: Number(lng),
              });
              setMode("");
            }}
          >
            Use coordinates
          </Button>
        </div>
      )}
      {mode && (
        <Button
          className="text-button"
          onClick={() => {
            setMode("");
            latest.current++;
          }}
        >
          Cancel location search
        </Button>
      )}
      {value && !value.entryId && !mode && (
        <Field label={`${label} label`}>
          <input
            value={value.label}
            maxLength={200}
            onChange={(event) =>
              onChange({ ...value, label: event.target.value })
            }
          />
        </Field>
      )}
    </div>
  );
}

export function TransportFields({
  entity,
  entries,
  onChange,
  readOnly = false,
  showMore = true,
}: {
  entity: Entity<Entry>;
  entries: Entity<Entry>[];
  onChange: (data: Entry) => void;
  readOnly?: boolean;
  showMore?: boolean;
}) {
  const data = entity.data;
  const plan = data.transport || { method: "taxi" as const };
  const estimate = useTransportRoutes([entity], entries)[entity.id];
  const problem = transportProblem({ ...data, transport: plan }, entries);
  const update = (changes: Partial<typeof plan>) =>
    onChange({ ...data, transport: { ...plan, ...changes } });
  let arrival = "";
  try {
    if (estimate?.minutes) arrival = transportArrival(data, estimate.minutes);
  } catch {
    /* Invalid pickup is explained beside the fields. */
  }
  return (
    <section className="transport-fields" aria-label="Transport details">
      {readOnly ? (
        <dl className="transport-readonly">
          <div>
            <dt>From</dt>
            <dd>
              {resolveTransportLocation(plan.from, entries)?.label || "Not set"}
            </dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>
              {resolveTransportLocation(plan.to, entries)?.label || "Not set"}
            </dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{transportMethods[plan.method]}</dd>
          </div>
        </dl>
      ) : (
        <div className="transport-field-grid">
          <LocationPicker
            label="From"
            value={plan.from}
            tripId={entity.tripId}
            entries={entries.filter((e) => e.id !== entity.id)}
            onChange={(from) => update({ from })}
          />
          <LocationPicker
            label="To"
            value={plan.to}
            tripId={entity.tripId}
            entries={entries.filter((e) => e.id !== entity.id)}
            onChange={(to) => update({ to })}
          />
          <Field label="Pickup">
            <TimeInput
              label="Pickup time"
              required
              value={data.start}
              onChange={(start) =>
                onChange({ ...data, start, transport: plan })
              }
            />
          </Field>
          <Field label="Method">
            <select
              value={plan.method}
              onChange={(event) =>
                update({ method: event.target.value as typeof plan.method })
              }
            >
              {Object.entries(transportMethods).map(([method, label]) => (
                <option key={method} value={method}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {estimate?.state === "ready" && !problem && (
        <div className="transport-estimate" role="status">
          <Route size={17} />
          <strong>
            {formatTravelDuration(estimate.minutes!)}{" "}
            {estimate.source === "Manual" ? "manual" : "estimated"}
          </strong>
          {arrival && (
            <span>
              Arrive {estimate.source === "Manual" ? "" : "~"}
              {arrival}
            </span>
          )}
        </div>
      )}
      {estimate?.state === "loading" && (
        <p role="status">Calculating travel…</p>
      )}
      {problem && <p className="transport-hint">{problem}</p>}
      {!problem && estimate?.state === "error" && (
        <Notice>{estimate.error}</Notice>
      )}
      {estimate?.warnings?.map((warning) => (
        <Notice key={warning}>{warning}</Notice>
      ))}
      {plan.manualMinutes === undefined &&
        (plan.method === "bus" || plan.method === "train") &&
        estimate?.state === "ready" && (
          <small>Public transit estimate; verify your booked service.</small>
        )}
      {!readOnly && (
        <div className="transport-estimate-actions">
          {plan.manualMinutes === undefined ? (
            <Button
              className="text-button"
              onClick={() =>
                update({
                  manualMinutes: estimate?.minutes || data.duration || 60,
                })
              }
            >
              Enter duration instead
            </Button>
          ) : (
            <>
              <Field label="Travel duration · minutes">
                <input
                  aria-label="Transport duration in minutes"
                  type="number"
                  min="1"
                  max="10080"
                  step="1"
                  value={plan.manualMinutes}
                  onChange={(event) =>
                    update({ manualMinutes: Number(event.target.value) })
                  }
                />
              </Field>
              <Button
                className="text-button"
                onClick={() => update({ manualMinutes: undefined })}
              >
                Use automatic estimate
              </Button>
            </>
          )}
          {!problem &&
            !demo &&
            navigator.onLine &&
            transportQuery(entity, entries) && (
              <Button
                aria-label="Refresh transport estimate"
                disabled={estimate?.state === "loading"}
                onClick={() => {
                  const query = transportQuery(entity, entries);
                  if (query) void requestTransport(query, true);
                }}
              >
                <RefreshCw size={15} />
                Refresh
              </Button>
            )}
        </div>
      )}
      {showMore && (
        <details className="transport-more">
          <summary>More details</summary>
          {readOnly ? (
            <>
              <p>{plan.company}</p>
              <p>{plan.meetingPoint}</p>
              <p>{data.reservation}</p>
              <p>{data.notes}</p>
            </>
          ) : (
            <>
              <Field label="Driver or company">
                <input
                  value={plan.company || ""}
                  maxLength={200}
                  onChange={(event) => update({ company: event.target.value })}
                />
              </Field>
              <Field label="Meeting point">
                <input
                  value={plan.meetingPoint || ""}
                  maxLength={500}
                  onChange={(event) =>
                    update({ meetingPoint: event.target.value })
                  }
                />
              </Field>
              <Field label="Booking reference">
                <input
                  value={data.reservation}
                  maxLength={200}
                  onChange={(event) =>
                    onChange({
                      ...data,
                      transport: plan,
                      reservation: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Travel notes">
                <textarea
                  value={data.notes}
                  maxLength={2000}
                  onChange={(event) =>
                    onChange({
                      ...data,
                      transport: plan,
                      notes: event.target.value,
                    })
                  }
                />
              </Field>
            </>
          )}
          {data.arrival && (
            <LegacyTravelDetails
              previous={entries.find(
                (entry) => entry.id === data.arrival!.fromId,
              )}
              entry={entity}
            />
          )}
          {entity.createdBy && (
            <small>Added by {displayNameFor(entity.createdBy)}</small>
          )}
          {entity.version > 1 && (
            <small>Updated by {displayNameFor(entity.updatedBy)}</small>
          )}
        </details>
      )}
    </section>
  );
}

export default function TransportEditor({
  entity,
  entries,
  canEdit,
  onDone,
}: {
  entity: Entity<Entry>;
  entries: Entity<Entry>[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const [data, setData] = useState<Entry>({
    ...entity.data,
    transport: entity.data.transport || { method: "taxi" },
  });
  const action = useAsyncAction();
  return (
    <form
      className="transport-inline-editor"
      aria-label={`Transport for ${entity.data.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;
        void action.run(async () => {
          const problem = transportProblem(data, entries);
          if (problem) throw Error(problem);
          entryBounds(data);
          await save({ ...entity, data });
          onDone();
        });
      }}
    >
      <TransportFields
        entity={{ ...entity, data }}
        entries={entries}
        readOnly={!canEdit}
        onChange={setData}
      />
      {canEdit && (
        <div className="transport-save-actions">
          <Button disabled={action.busy} onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" className="primary" disabled={action.busy}>
            Save changes
          </Button>
        </div>
      )}
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </form>
  );
}

export function LegacyTravelDetails({
  previous,
  entry,
}: {
  previous?: Entity<Entry>;
  entry: Entity<Entry>;
}) {
  const arrival = entry.data.arrival;
  if (!arrival || (previous && arrival.fromId !== previous.id)) return null;
  const booking = arrival.booking;
  return (
    <details className="legacy-travel-details">
      <summary>Saved travel details</summary>
      <p>
        {previous?.data.title || "Previous stop"} → {entry.data.title}
      </p>
      <p>
        {booking?.title || booking?.transport || arrival.mode}
        {arrival.manualMinutes !== undefined
          ? ` · ${arrival.manualMinutes} min manual`
          : ""}
      </p>
      {booking && (
        <>
          <p>
            {booking.status}
            {booking.company && ` · ${booking.company}`}
          </p>
          {booking.pickup && (
            <p>
              Pickup {booking.pickup.date} · {booking.pickup.time}
            </p>
          )}
          <p>{booking.meetingPoint}</p>
          <p>{booking.reference}</p>
          <p>{booking.contact}</p>
          <p>{booking.notes}</p>
        </>
      )}
    </details>
  );
}
