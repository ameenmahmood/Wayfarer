import SignIn from "./SignIn";
import { useEffect, useState } from "react";
import { Search, Plus, X } from "lucide-react";
import {
  currencies,
  today,
  type Entity,
  type Trip,
  type Entry,
  type Expense,
} from "./model";
import { save, api, demo, supabase } from "./store";
import { minor, precision, money, splitExpense } from "./money";
import { entryBounds } from "./schedule";
import { Field, Button, Notice, useAsyncAction } from "./ui";
export function TripForm({
  entity,
  onDone,
}: {
  entity: Entity<Trip>;
  onDone: () => void;
}) {
  const [t, setT] = useState(entity.data),
    a = useAsyncAction();
  const [signedIn, setSignedIn] = useState(demo);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(!!data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session),
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!entity.version)
      sessionStorage.setItem(
        "wayfarer-trip-draft",
        JSON.stringify({ ...entity, data: t }),
      );
  }, [t, entity.id]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        a.run(async () => {
          if (t.end < t.start)
            throw Error("End date must follow the start date.");
          if ((Date.parse(t.end) - Date.parse(t.start)) / 86400000 > 89)
            throw Error("Choose a trip of up to 90 days.");
          if (
            !Intl.supportedValuesOf("timeZone").includes(t.zone) &&
            t.zone !== "UTC"
          )
            throw Error("Choose a valid IANA time zone.");
          let next = t;
          if (supabase) {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (!session)
              throw Error(
                "Sign in below to save this private trip. Your draft stays in this tab.",
              );
            if (!entity.version)
              next = {
                ...t,
                people: [{ id: session.user.id, name: "You", role: "owner" }],
              };
          }
          await save({ ...entity, data: next });
          sessionStorage.removeItem("wayfarer-trip-draft");
          onDone();
        });
      }}
    >
      <Field label="Trip name">
        <input
          required
          maxLength={120}
          value={t.title}
          onChange={(e) => setT({ ...t, title: e.target.value })}
        />
      </Field>
      <Field label="Destinations">
        <input
          required
          value={t.destinations}
          onChange={(e) => setT({ ...t, destinations: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Start date">
          <input
            required
            type="date"
            value={t.start}
            onChange={(e) => setT({ ...t, start: e.target.value })}
          />
        </Field>
        <Field label="End date">
          <input
            required
            type="date"
            value={t.end}
            onChange={(e) => setT({ ...t, end: e.target.value })}
          />
        </Field>
        <Field label="Default time zone">
          <input
            required
            list="zones"
            value={t.zone}
            onChange={(e) => setT({ ...t, zone: e.target.value })}
          />
        </Field>
        <Field label="Base currency">
          <select
            value={t.currency}
            disabled={entity.version > 0}
            onChange={(e) => setT({ ...t, currency: e.target.value })}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Trip budget">
        <input
          required
          min="0"
          type="number"
          step={1 / 10 ** precision(t.currency)}
          defaultValue={t.budget / 10 ** precision(t.currency)}
          onChange={(e) => {
            try {
              setT({ ...t, budget: minor(e.target.value, t.currency) });
            } catch {}
          }}
        />
      </Field>
      <Field label="A note for the trip">
        <textarea
          value={t.description}
          onChange={(e) => setT({ ...t, description: e.target.value })}
        />
      </Field>
      {a.error && <Notice tone="error">{a.error}</Notice>}
      {!signedIn && (
        <SignIn purpose="Sign in to save this private trip. Your draft is kept in this tab while you sign in; nothing is shared until you save." />
      )}
      <div className="dialog-actions">
        <Button
          type="submit"
          className="primary"
          disabled={a.busy || !signedIn}
        >
          Save trip
        </Button>
      </div>
      <datalist id="zones">
        {Intl.supportedValuesOf("timeZone").map((z) => (
          <option key={z}>{z}</option>
        ))}
      </datalist>
    </form>
  );
}
export function EntryForm({
  entity,
  trip,
  onDone,
}: {
  entity: Entity<Entry>;
  trip: Trip;
  onDone: () => void;
}) {
  const [v, setV] = useState(entity.data),
    [q, setQ] = useState(""),
    [places, setPlaces] = useState<any[]>([]),
    [searched, setSearched] = useState(false),
    [cost, setCost] = useState(String(v.cost / 10 ** precision(v.currency))),
    a = useAsyncAction(),
    searchAction = useAsyncAction();
  function searchPlaces() {
    if (demo || q.trim().length < 2) return;
    setSearched(false);
    setPlaces([]);
    void searchAction.run(async () => {
      const result = await api("places", entity.tripId, { query: q.trim() });
      setPlaces(result.places || []);
      setSearched(true);
    });
  }
  const change = (k: keyof Entry, value: any) =>
    setV((v) => ({ ...v, [k]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        a.run(async () => {
          if (v.date) {
            entryBounds(v);
            if (v.duration < 1 || v.duration > 10080)
              throw Error("Choose a duration between 1 minute and 7 days.");
          }
          if (v.link && !/^https?:\/\//i.test(v.link))
            throw Error("Links must start with https:// or http://.");
          if ((v.lat == null) !== (v.lng == null))
            throw Error("Supply both latitude and longitude.");
          await save({
            ...entity,
            data: {
              ...v,
              duration:
                v.date && v.end
                  ? Math.round(
                      (entryBounds(v).end - entryBounds(v).start) / 60000,
                    )
                  : v.duration,
              cost: minor(cost, v.currency),
            },
          });
          onDone();
        });
      }}
    >
      <div className="notice">
        Your own notes and coordinates are available offline. Google place
        results are fetched live and are not saved; only the place ID is
        retained.
      </div>
      <div className="search-row">
        <input
          aria-label="Find a Google place"
          placeholder="Find a place or address with Google…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSearched(false);
            searchAction.setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              searchPlaces();
            }
          }}
        />
        <Button
          disabled={searchAction.busy || demo || q.trim().length < 2}
          onClick={searchPlaces}
        >
          <Search size={17} />
          {searchAction.busy ? "Searching..." : "Search"}
        </Button>
      </div>
      {demo && (
        <Notice>
          Place search requires a connected account and configured Google
          services. Manual plans work offline.
        </Notice>
      )}
      {searchAction.busy && <p role="status">Searching Google Places...</p>}
      {searchAction.error && <Notice tone="error">{searchAction.error}</Notice>}
      {searched && !places.length && (
        <Notice>
          No places found. Try a more specific place name, city, or address.
        </Notice>
      )}
      {places.length > 0 && (
        <div className="search-results">
          <span className="google-attribution" translate="no">
            Google Maps
          </span>
          <small> · live place results</small>
          {places.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                change("placeId", p.id);
                setPlaces([]);
                setSearched(false);
              }}
            >
              {p.displayName?.text}
              <small>{p.formattedAddress}</small>
              {(p.attributions || []).map((at: any, j: number) => (
                <small key={j}>
                  {at.provider}{" "}
                  {at.providerUri && (
                    <a href={at.providerUri} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  )}
                </small>
              ))}
            </button>
          ))}
        </div>
      )}
      {v.placeId && (
        <small>Google place linked. Add your own title and notes below.</small>
      )}
      <Field label="Title">
        <input
          autoFocus
          required
          maxLength={200}
          value={v.title}
          onChange={(e) => change("title", e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Type">
          <select
            value={v.type}
            onChange={(e) => change("type", e.target.value)}
          >
            {[
              "Activity",
              "Restaurant",
              "Attraction",
              "Transportation",
              "Flight",
              "Lodging",
              "Note",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Date (empty = saved place)">
          <input
            type="date"
            min={trip.start}
            max={trip.end}
            value={v.date}
            onChange={(e) =>
              setV({ ...v, date: e.target.value, endDate: e.target.value })
            }
          />
        </Field>
        <Field label="Start time">
          <input
            type="time"
            value={v.start}
            onChange={(e) => change("start", e.target.value)}
          />
        </Field>
        <Field label="Duration · minutes">
          <input
            type="number"
            min="1"
            max="10080"
            required
            value={v.duration}
            onChange={(e) => change("duration", Number(e.target.value))}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={v.endDate}
            onChange={(e) => change("endDate", e.target.value)}
          />
        </Field>
        <Field label="End time (optional)">
          <input
            type="time"
            value={v.end}
            onChange={(e) => change("end", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Destination time zone (IANA)">
        <input
          required
          value={v.zone}
          onChange={(e) => change("zone", e.target.value)}
        />
      </Field>
      <Field label="End / arrival time zone (optional)">
        <input
          placeholder={v.zone}
          value={v.endZone || ""}
          onChange={(e) => change("endZone", e.target.value || undefined)}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={v.fixed}
          onChange={(e) => change("fixed", e.target.checked)}
        />
        Fixed reservation · keep its time when optimizing
      </label>
      <Field label="Your address / meeting point">
        <input
          value={v.address}
          onChange={(e) => change("address", e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Your latitude">
          <input
            type="number"
            step="any"
            min="-90"
            max="90"
            value={v.lat ?? ""}
            onChange={(e) =>
              change(
                "lat",
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
          />
        </Field>
        <Field label="Your longitude">
          <input
            type="number"
            step="any"
            min="-180"
            max="180"
            value={v.lng ?? ""}
            onChange={(e) =>
              change(
                "lng",
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
          />
        </Field>
        <Field label="Estimated cost">
          <input
            required
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <select
            value={v.currency}
            onChange={(e) => change("currency", e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Known opens (your research)">
          <input
            type="time"
            value={
              v.opening
                ? `${String(Math.floor(v.opening.open / 60)).padStart(2, "0")}:${String(v.opening.open % 60).padStart(2, "0")}`
                : ""
            }
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              change(
                "opening",
                e.target.value
                  ? { open: h * 60 + m, close: v.opening?.close ?? 1080 }
                  : undefined,
              );
            }}
          />
        </Field>
        <Field label="Known closes">
          <input
            type="time"
            value={
              v.opening
                ? `${String(Math.floor(v.opening.close / 60)).padStart(2, "0")}:${String(v.opening.close % 60).padStart(2, "0")}`
                : ""
            }
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              change(
                "opening",
                e.target.value
                  ? { open: v.opening?.open ?? 540, close: h * 60 + m }
                  : undefined,
              );
            }}
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          value={v.notes}
          onChange={(e) => change("notes", e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Link">
          <input
            type="url"
            value={v.link}
            onChange={(e) => change("link", e.target.value)}
          />
        </Field>
        <Field label="Reservation reference">
          <input
            value={v.reservation}
            onChange={(e) => change("reservation", e.target.value)}
          />
        </Field>
      </div>
      {a.error && <Notice tone="error">{a.error}</Notice>}
      <div className="dialog-actions">
        <Button type="submit" className="primary" disabled={a.busy}>
          Save to itinerary
        </Button>
      </div>
    </form>
  );
}
export function ExpenseForm({
  entity,
  trip,
  entries,
  onDone,
}: {
  entity: Entity<Expense>;
  trip: Trip;
  entries: Entity<Entry>[];
  onDone: () => void;
}) {
  const [v, setV] = useState(entity.data),
    [total, setTotal] = useState(String(v.total / 10 ** precision(v.currency))),
    [rate, setRate] = useState(String(v.rate.num / v.rate.den)),
    [itemized, setItemized] = useState(v.items.length > 0),
    a = useAsyncAction();
  const change = (k: keyof Expense, value: any) =>
    setV((s) => ({ ...s, [k]: value }));
  function build() {
    if (itemized && !v.items.length)
      throw Error("Add at least one item or turn off itemization.");
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0)
      throw Error("A positive exchange rate is required.");
    const currencyRate =
      v.currency === trip.currency
        ? { num: 1, den: 1, date: v.date, source: "Same currency" }
        : {
            num: Math.round(n * 100000000),
            den: 100000000,
            date: v.rate.date,
            source: v.rate.source,
          };
    const e = {
      ...v,
      total: minor(total, v.currency),
      items: itemized ? v.items : [],
      rate: currencyRate,
    };
    splitExpense(e);
    return e;
  }
  let preview: Record<string, number> | undefined;
  let previewError = "";
  try {
    preview = splitExpense(build());
  } catch (error: any) {
    previewError = error.message;
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        a.run(async () => {
          await save({ ...entity, data: build() });
          onDone();
        });
      }}
    >
      <div className="form-grid">
        <Field label="Merchant / title">
          <input
            required
            maxLength={200}
            value={v.title}
            onChange={(e) => change("title", e.target.value)}
          />
        </Field>
        <Field label="Category">
          <select
            value={v.category}
            onChange={(e) => change("category", e.target.value)}
          >
            {[
              "Food",
              "Stay",
              "Transport",
              "Activities",
              "Shopping",
              "Other",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Total, including tax and tips">
          <input
            required
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <select
            value={v.currency}
            onChange={(e) => {
              change("currency", e.target.value);
              setItemized(false);
              change("items", []);
            }}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            required
            type="date"
            value={v.date}
            onChange={(e) => change("date", e.target.value)}
          />
        </Field>
        <Field label="Paid by">
          <select
            value={v.payer}
            onChange={(e) => change("payer", e.target.value)}
          >
            {trip.people.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Participants">
        <div className="checks">
          {trip.people.map((p) => (
            <label className="check" key={p.id}>
              <input
                type="checkbox"
                checked={v.participants.includes(p.id)}
                onChange={(e) =>
                  change(
                    "participants",
                    e.target.checked
                      ? [...v.participants, p.id]
                      : v.participants.filter((id) => id !== p.id),
                  )
                }
              />
              {p.name}
            </label>
          ))}
        </div>
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={itemized}
          onChange={(e) => setItemized(e.target.checked)}
        />
        Itemize this expense
      </label>
      {itemized ? (
        <div className="item-list">
          {v.items.map((item, i) => (
            <div className="item-edit" key={i}>
              <div className="search-row">
                <input
                  aria-label={`Item ${i + 1} title`}
                  required
                  placeholder="Item title"
                  value={item.title}
                  onChange={(e) =>
                    change(
                      "items",
                      v.items.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Item ${i + 1} amount in minor units`}
                  type="number"
                  min="0"
                  required
                  value={item.amount}
                  onChange={(e) =>
                    change(
                      "items",
                      v.items.map((x, j) =>
                        j === i ? { ...x, amount: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
                <Button
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() =>
                    change(
                      "items",
                      v.items.filter((_, j) => j !== i),
                    )
                  }
                >
                  <X size={15} />
                </Button>
              </div>
              <small>
                Amount in {v.currency} minor units (1 unit ={" "}
                {money(1, v.currency)})
              </small>
              <div className="checks">
                {v.participants.map((id) => (
                  <label className="check" key={id}>
                    <input
                      type="checkbox"
                      checked={item.participants.includes(id)}
                      onChange={(e) =>
                        change(
                          "items",
                          v.items.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  participants: e.target.checked
                                    ? [...x.participants, id]
                                    : x.participants.filter((p) => p !== id),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    {trip.people.find((p) => p.id === id)?.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button
            onClick={() =>
              change("items", [
                ...v.items,
                { title: "", amount: 0, participants: [...v.participants] },
              ])
            }
          >
            <Plus size={15} />
            Add item
          </Button>
        </div>
      ) : (
        <>
          <Field label="Split method">
            <select
              value={v.mode}
              onChange={(e) => change("mode", e.target.value)}
            >
              {["equal", "exact", "percentage", "weighted"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {v.mode !== "equal" &&
            v.participants.map((id) => (
              <Field
                key={id}
                label={`${trip.people.find((p) => p.id === id)?.name} · ${v.mode === "percentage" ? "percentage (0–100)" : v.mode === "exact" ? "minor units of subtotal" : "weight"}`}
              >
                <input
                  required
                  type="number"
                  min="0"
                  step={v.mode === "percentage" ? 0.01 : 1}
                  value={
                    (v.shares[id] || 0) / (v.mode === "percentage" ? 100 : 1)
                  }
                  onChange={(e) =>
                    change("shares", {
                      ...v.shares,
                      [id]: Math.round(
                        Number(e.target.value) *
                          (v.mode === "percentage" ? 100 : 1),
                      ),
                    })
                  }
                />
              </Field>
            ))}
        </>
      )}
      <div className="form-grid">
        {(["tax", "tip", "fees"] as const).map((k) => (
          <Field key={k} label={`${k} · minor units`}>
            <input
              type="number"
              min="0"
              step="1"
              required
              value={v[k]}
              onChange={(e) => change(k, Number(e.target.value))}
            />
          </Field>
        ))}
        <Field label="Allocate tax, tip & fees">
          <select
            value={v.extraMode}
            onChange={(e) => change("extraMode", e.target.value)}
          >
            <option value="proportional">
              In proportion to items / subtotal
            </option>
            <option value="equal">Equally across participants</option>
          </select>
        </Field>
      </div>
      {v.currency !== trip.currency && (
        <div className="inset">
          <Field
            label={`Snapshot: 1 ${v.currency} = how many ${trip.currency}?`}
          >
            <input
              required
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Rate date">
              <input
                required
                type="date"
                value={v.rate.date}
                onChange={(e) =>
                  change("rate", { ...v.rate, date: e.target.value })
                }
              />
            </Field>
            <Field label="Source / override reason">
              <input
                required
                value={v.rate.source}
                onChange={(e) =>
                  change("rate", { ...v.rate, source: e.target.value })
                }
              />
            </Field>
          </div>
          <Button
            disabled={demo || a.busy}
            onClick={() =>
              a.run(async () => {
                const r = await api("rate", entity.tripId, {
                  from: v.currency,
                  to: trip.currency,
                });
                setRate(String(r.rate));
                change("rate", {
                  num: Math.round(r.rate * 1e8),
                  den: 1e8,
                  date: r.date,
                  source: r.source,
                });
              })
            }
          >
            Fetch configured rate
          </Button>
          <small>
            Stored with this expense. Balances never follow live market rates.
          </small>
        </div>
      )}
      <Field label="Link to itinerary">
        <select
          value={v.entryId || ""}
          onChange={(e) => change("entryId", e.target.value || undefined)}
        >
          <option value="">No linked activity</option>
          {entries.map((e) => (
            <option value={e.id} key={e.id}>
              {e.data.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <textarea
          value={v.notes}
          onChange={(e) => change("notes", e.target.value)}
        />
      </Field>
      {preview ? (
        <div className="split-preview">
          {Object.entries(preview).map(([id, n]) => (
            <span key={id}>
              {trip.people.find((p) => p.id === id)?.name}
              <b>{money(n, v.currency)}</b>
            </span>
          ))}
        </div>
      ) : (
        <Notice>
          {previewError} Items + extras must equal the total; exact splits and
          percentages must reconcile.
        </Notice>
      )}
      {a.error && <Notice tone="error">{a.error}</Notice>}
      <div className="dialog-actions">
        <Button type="submit" className="primary" disabled={a.busy || !preview}>
          Save expense
        </Button>
      </div>
    </form>
  );
}
export function newExpense(trip: Trip): Expense {
  return {
    title: "",
    category: "Food",
    date: today(),
    notes: "",
    payer: trip.people[0]?.id || "",
    currency: trip.currency,
    total: 0,
    participants: trip.people.map((p) => p.id),
    mode: "equal",
    shares: {},
    items: [],
    tax: 0,
    tip: 0,
    fees: 0,
    extraMode: "proportional",
    rate: { num: 1, den: 1, date: today(), source: "Manual override" },
  };
}
