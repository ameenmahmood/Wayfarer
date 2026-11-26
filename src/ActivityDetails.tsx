import { useState } from "react";
import { Copy, ExternalLink, MapPin, Pencil, Check } from "lucide-react";
import type { Entity, Entry } from "./model";
import { formatTime } from "./schedule";
import { money } from "./money";
import { displayNameFor } from "./profiles";
import { Button } from "./ui";
import { LegacyTravelDetails } from "./TransportEditor";
import { flightTimingParts } from "./flights";

export function activityDirections(entry: Entry) {
  const destination =
    entry.placeId ||
    (entry.lat != null && entry.lng != null
      ? `${entry.lat},${entry.lng}`
      : entry.address);
  if (!destination) return undefined;
  const params = new URLSearchParams({
    api: "1",
    destination: entry.address || entry.title,
  });
  if (entry.placeId) params.set("destination_place_id", entry.placeId);
  else params.set("destination", destination);
  return `https://www.google.com/maps/dir/?${params}`;
}
export default function ActivityDetails({
  entity,
  previous,
  entries,
  canEdit,
  onEdit,
  address,
  provider,
  attributions,
  placeName,
  onLoadPlace,
  loadingPlace,
}: {
  entity: Entity<Entry>;
  previous?: Entity<Entry>;
  entries: Entity<Entry>[];
  canEdit: boolean;
  onEdit: () => void;
  address?: string;
  provider?: boolean;
  attributions?: { provider: string; providerUri?: string }[];
  placeName?: string;
  onLoadPlace?: () => void;
  loadingPlace?: boolean;
}) {
  const e = entity.data;
  const [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  const directions = activityDirections(e);
  const departure = entries.find(
    (entry) => entry.data.flight?.arrivalId === entity.id,
  );
  const arrival = entries.find((entry) => entry.id === e.flight?.arrivalId);
  const connection = arrival
    ? flightTimingParts({ from: entity, to: arrival })
    : departure
      ? flightTimingParts({ from: departure, to: entity })
      : undefined;
  return (
    <div className="activity-details-body" id={`plan-details-${entity.id}`}>
      <dl className="activity-facts">
        {placeName && placeName !== e.title && (
          <div>
            <dt>Place</dt>
            <dd>{placeName}</dd>
          </div>
        )}
        {(address || e.address) && (
          <div>
            <dt>
              <MapPin size={15} />
              Address
            </dt>
            <dd>
              {address || e.address}
              {provider && (
                <small className="google-attribution">
                  Google Maps
                  {attributions?.map((a, i) => (
                    <span key={i}>
                      {" "}
                      ·{" "}
                      {a.providerUri ? (
                        <a
                          href={a.providerUri}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.provider}
                        </a>
                      ) : (
                        a.provider
                      )}
                    </span>
                  ))}
                </small>
              )}
            </dd>
          </div>
        )}
        {e.type === "Flight" && e.flight?.number && (
          <div>
            <dt>Flight</dt>
            <dd>{e.flight.number}</dd>
          </div>
        )}
        {connection && (
          <div>
            <dt>Flight connection</dt>
            <dd>
              {connection.times}
              {connection.duration ? ` · ${connection.duration}` : ""}
            </dd>
          </div>
        )}
        {(e.endDate > e.date || e.end) && (
          <div>
            <dt>Until</dt>
            <dd>
              {e.endDate > e.date ? e.endDate : ""}
              {e.end
                ? `${e.endDate > e.date ? " · " : ""}${formatTime(e.end)}`
                : ""}
            </dd>
          </div>
        )}
        {e.reservation && (
          <div>
            <dt>Booking reference</dt>
            <dd className="booking-reference">
              <span>{e.reservation}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Copy booking reference for ${e.title}`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(e.reservation);
                    setCopied(true);
                    setCopyError(false);
                  } catch {
                    setCopyError(true);
                  }
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <span className="visually-hidden" role="status">
                {copied
                  ? "Booking reference copied"
                  : copyError
                    ? "Copy unavailable. Select the booking reference to copy it."
                    : ""}
              </span>
            </dd>
          </div>
        )}
        {e.notes && (
          <div>
            <dt>Notes</dt>
            <dd className="activity-note">{e.notes}</dd>
          </div>
        )}
        {e.cost > 0 && (
          <div>
            <dt>Estimated cost</dt>
            <dd>{money(e.cost, e.currency)}</dd>
          </div>
        )}
      </dl>
      <div className="activity-primary-actions">
        {directions && (
          <a
            className="button"
            href={directions}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin size={15} />
            Directions
          </a>
        )}
        {e.link && (
          <a className="button" href={e.link} target="_blank" rel="noreferrer">
            Open link
            <ExternalLink size={14} />
          </a>
        )}
        {canEdit && (
          <Button aria-label={`Edit ${e.title}`} onClick={onEdit}>
            <Pencil size={15} />
            Edit
          </Button>
        )}
        {onLoadPlace && (
          <Button
            disabled={loadingPlace}
            aria-label={`Load Google details for ${e.title}`}
            onClick={onLoadPlace}
          >
            Load place details
          </Button>
        )}
      </div>
      {(e.arrival || entity.createdBy || entity.updatedBy || e.fixed) && (
        <details className="activity-more">
          <summary>More details</summary>
          {e.start && e.duration > 0 && (
            <p>Planned duration: {e.duration} min</p>
          )}
          {e.fixed && <p>Fixed time</p>}
          <LegacyTravelDetails previous={previous} entry={entity} />
          {entity.createdBy && (
            <p>Added by {displayNameFor(entity.createdBy)}</p>
          )}
          {entity.updatedBy && (
            <p>
              Updated by {displayNameFor(entity.updatedBy)} ·{" "}
              {new Date(entity.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </details>
      )}
    </div>
  );
}
