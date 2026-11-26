import { useState } from "react";
import {
  Plus,
  Download,
  ArrowUpRight,
  Check,
  Receipt,
  Trash2,
  Pencil,
  History,
} from "lucide-react";
import type { Entity, Expense, Repayment, Trip, Entry } from "./model";
import { makeEntity, today, currencies } from "./model";
import { save, remove } from "./store";
import { expenseCSV, report, money, minor, precision } from "./money";
import { Button, Modal, Field, Notice, Empty, useAsyncAction } from "./ui";
import { ExpenseForm, newExpense } from "./Forms";
import { expenseSettlements } from "./expenseSettlements";
export default function Budget({
  trip,
  tripEntity,
  expenses,
  repayments,
  entries,
  canEdit,
  canManageBudget,
}: {
  trip: Trip;
  tripEntity: Entity<Trip>;
  expenses: Entity<Expense>[];
  repayments: Entity<Repayment>[];
  entries: Entity<Entry>[];
  canEdit: boolean;
  canManageBudget: boolean;
}) {
  const [editing, setEditing] = useState<Entity<Expense>>(),
    [settle, setSettle] = useState<{
      from: string;
      to: string;
      amount: number;
      expenseId?: string;
    }>(),
    [budgeting, setBudgeting] = useState(false),
    [plannedOpen, setPlannedOpen] = useState(false),
    [plannedEntry, setPlannedEntry] = useState<Entity<Entry>>(),
    a = useAsyncAction();
  const r = report(
    expenses.map((e) => e.data),
    repayments.map((e) => e.data),
    trip.currency,
    trip.people.map((p) => p.id),
  );
  const coverage = expenseSettlements(expenses, repayments, trip.currency);
  const name = (id: string) =>
    trip.people.find((p) => p.id === id)?.name || "Former traveler";
  function csv() {
    const blob = new Blob(
        [
          expenseCSV(
            expenses.map((e) => e.data),
            trip.currency,
          ),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "wayfarer-expenses.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="content-heading">
        <div>
          <h2>Expenses</h2>
        </div>
        <div className="button-row">
          <Button onClick={csv}>
            <Download size={16} />
            Export CSV
          </Button>
          {canEdit && (
            <Button
              className="primary"
              onClick={() =>
                setEditing(
                  makeEntity("expense", tripEntity.id, newExpense(trip)),
                )
              }
            >
              <Plus size={17} />
              Add expense
            </Button>
          )}
        </div>
      </div>
      <div className="budget-stats">
        <div className="metric-card">
          <small>Actual spending</small>
          <strong>{money(r.spent, trip.currency)}</strong>
          <span>Repayments excluded</span>
        </div>
        <div className="metric-card">
          <small>Trip budget</small>
          <strong>{money(trip.budget, trip.currency)}</strong>
          {canEdit && (
            <button
              className="text-button"
              disabled={!canManageBudget}
              title={
                !canManageBudget
                  ? "Only the trip owner can change budgets"
                  : undefined
              }
              onClick={() => setBudgeting(true)}
            >
              Manage budgets <ArrowUpRight size={13} />
            </button>
          )}
        </div>
        <div className="metric-card">
          <small>
            {trip.budget - r.spent >= 0 ? "Remaining" : "Over budget"}
          </small>
          <strong>
            {money(Math.abs(trip.budget - r.spent), trip.currency)}
          </strong>
          <span>Base currency · {trip.currency}</span>
        </div>
      </div>
      <section className="planned-costs compact-disclosure">
        <button
          className="planned-cost-toggle"
          aria-expanded={plannedOpen}
          aria-controls="planned-cost-content"
          onClick={() => setPlannedOpen((open) => !open)}
        >
          <span aria-hidden="true">{plannedOpen ? "▾" : "▸"}</span>
          Planned costs <span className="pill">Estimates</span>
        </button>
        <div
          className="planned-cost-content"
          id="planned-cost-content"
          hidden={!plannedOpen}
        >
          {!entries.some((entry) => entry.data.cost > 0) && (
            <p className="muted">
              No planned costs yet. Add an estimate to an itinerary activity.
            </p>
          )}
          <div className="button-row">
            {Object.entries(
              entries.reduce(
                (totals, e) => {
                  if (!e.data.cost) return totals;
                  totals[e.data.currency] =
                    (totals[e.data.currency] || 0) + e.data.cost;
                  return totals;
                },
                {} as Record<string, number>,
              ),
            ).map(([currency, total]) => (
              <span key={currency}>{money(total, currency)}</span>
            ))}
          </div>
          {entries
            .filter((entry) => entry.data.cost > 0)
            .map((entry) => (
              <div className="planned-cost-row" key={entry.id}>
                <div className="grow">
                  <b>{entry.data.title}</b>
                  <small>{entry.data.date || "Saved place"}</small>
                </div>
                <b>{money(entry.data.cost, entry.data.currency)}</b>
                {canEdit && (
                  <button
                    className="icon-button"
                    aria-label={`Edit planned cost for ${entry.data.title}`}
                    onClick={() => setPlannedEntry(entry)}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            ))}
          {canEdit && entries.length > 0 && (
            <Button onClick={() => setPlannedEntry(entries[0])}>
              <Plus size={15} />
              Add planned cost
            </Button>
          )}
          {entries.length === 0 && (
            <p>Add an itinerary activity first to attach a planned cost.</p>
          )}
          <small>
            Shown in original currencies. Adding an actual expense does not
            automatically remove the linked estimate.
          </small>
        </div>
      </section>
      <div className="two-columns">
        <section className="panel">
          <div className="section-head">
            <h3>Recent expenses</h3>
            <span className="count">{expenses.length}</span>
          </div>
          {!expenses.length && (
            <Empty title="No expenses yet">
              Add an expense and choose who shared it.
            </Empty>
          )}
          {expenses.map((e) => {
            const row = coverage.rows.find((row) => row.expense.id === e.id)!;
            const others = row.shares.filter(
              (s) => s.personId !== e.data.payer,
            );
            const remaining = others.reduce(
              (sum, s) => sum + s.amount - s.repaid,
              0,
            );
            const repaid = others.reduce((sum, s) => sum + s.repaid, 0);
            return (
              <div className="expense-row expense-record" key={e.id}>
                <div className="category-icon">
                  <Receipt size={19} />
                </div>
                <div className="grow">
                  <div className="expense-title-line">
                    <b>{e.data.title}</b>
                    <span className={`pill ${remaining === 0 ? "green" : ""}`}>
                      {remaining === 0
                        ? "Settled"
                        : repaid > 0
                          ? "Partially settled"
                          : "Unsettled"}
                    </span>
                  </div>
                  <small>
                    {e.data.date} · {e.data.category} · paid by{" "}
                    {name(e.data.payer)}
                  </small>
                  <details className="record-details expense-details">
                    <summary>Details</summary>
                    <div className="expense-shares">
                      {row.shares.map((share) => (
                        <div className="expense-share" key={share.personId}>
                          <b>{name(share.personId)}</b>
                          <span className="expense-share-amount">
                            {money(share.amount, trip.currency)}
                          </span>
                          <span
                            className={
                              share.personId !== e.data.payer &&
                              share.amount === share.repaid
                                ? "expense-paid"
                                : "muted"
                            }
                          >
                            {share.personId === e.data.payer
                              ? "Payer"
                              : share.amount === share.repaid
                                ? "Settled"
                                : `${money(share.amount - share.repaid, trip.currency)} remaining`}
                          </span>
                          {canEdit &&
                            share.personId !== e.data.payer &&
                            share.amount > share.repaid && (
                              <Button
                                className="expense-repay-button"
                                onClick={() =>
                                  setSettle({
                                    from: share.personId,
                                    to: e.data.payer,
                                    amount: share.amount - share.repaid,
                                    expenseId: e.id,
                                  })
                                }
                              >
                                Record repayment
                              </Button>
                            )}
                        </div>
                      ))}
                      {row.payments.length > 0 && (
                        <div className="expense-payment-history">
                          {row.payments.map(({ repayment, amount }) => (
                            <div
                              className="expense-payment-line"
                              key={repayment.id}
                            >
                              <History size={14} aria-hidden="true" />
                              <span>
                                {name(repayment.data.from)} paid{" "}
                                {money(amount, trip.currency)} ·{" "}
                                {new Date(
                                  repayment.data.date + "T12:00:00",
                                ).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                              {canEdit && (
                                <button
                                  className="text-button"
                                  aria-label="Undo full repayment"
                                  title={`Undo the full ${money(repayment.data.amount, trip.currency)} repayment to ${name(repayment.data.to)}`}
                                  disabled={a.busy}
                                  onClick={() => a.run(() => remove(repayment))}
                                >
                                  Undo
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <small
                      className="expense-detail-meta"
                      title={`Rate ${e.data.rate.source}, ${e.data.rate.date}. Updated ${new Date(e.updatedAt).toLocaleString()}`}
                    >
                      {e.data.items.length
                        ? "Itemized"
                        : e.data.mode === "equal"
                          ? "Equal split"
                          : "Split " + e.data.mode}{" "}
                      · {trip.currency} · Updated{" "}
                      {new Date(e.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      by {name(e.updatedBy)}
                    </small>
                  </details>
                </div>
                <b>{money(e.data.total, e.data.currency)}</b>
                {canEdit && (
                  <>
                    <button
                      aria-label={`Edit ${e.data.title}`}
                      className="icon-button"
                      onClick={() => setEditing(e)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      aria-label={`Delete ${e.data.title}`}
                      className="icon-button"
                      onClick={() => a.run(() => remove(e))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </section>
        <div className="stack">
          <section className="panel">
            <div className="section-head">
              <h3>Settle up</h3>
              <span className="pill green">{trip.currency}</span>
            </div>
            {!r.settlements.length ? (
              <Empty title="All square">Everyone is settled up.</Empty>
            ) : (
              r.settlements.map((s, i) => (
                <div className="settlement" key={i}>
                  <p>
                    <b>{name(s.from)}</b> pays <b>{name(s.to)}</b>
                  </p>
                  <div>
                    <strong>{money(s.amount, trip.currency)}</strong>
                    {canEdit && (
                      <Button onClick={() => setSettle(s)}>
                        Record repayment
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
            <p className="muted small">
              Repayments settle balances without adding to spending.
            </p>
          </section>
          <section className="panel">
            <h3>Category budgets</h3>
            {[
              "Food",
              "Stay",
              "Transport",
              "Activities",
              "Shopping",
              "Other",
            ].map((c) => (
              <div className="category-budget" key={c}>
                <div>
                  <span>{c}</span>
                  <small>
                    {money(r.categories[c] || 0, trip.currency)} /{" "}
                    {trip.categoryBudgets[c]
                      ? money(trip.categoryBudgets[c], trip.currency)
                      : "No limit"}
                  </small>
                </div>
                <progress
                  max={
                    trip.categoryBudgets[c] || Math.max(r.categories[c] || 0, 1)
                  }
                  value={r.categories[c] || 0}
                />
              </div>
            ))}
          </section>
        </div>
      </div>
      <section className="panel">
        <h3>Everyone’s share</h3>
        <div
          className="table-scroll"
          role="region"
          aria-label="Per-person balances, scroll horizontally for more columns"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Traveler</th>
                <th>Paid</th>
                <th>Share of spending</th>
                <th>Remaining balance</th>
              </tr>
            </thead>
            <tbody>
              {trip.people.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{money(r.paid[p.id] || 0, trip.currency)}</td>
                  <td>{money(r.owed[p.id] || 0, trip.currency)}</td>
                  <td>
                    {money(Math.abs(r.net[p.id] || 0), trip.currency)}{" "}
                    {(r.net[p.id] || 0) > 0
                      ? "to receive"
                      : (r.net[p.id] || 0) < 0
                        ? "to pay"
                        : "settled"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {repayments.length > 0 && (
        <section className="panel">
          <h3>Recorded repayments</h3>
          {coverage.unallocated.length > 0 && (
            <Notice>
              {money(
                coverage.unallocated.reduce(
                  (sum, item) => sum + item.amount,
                  0,
                ),
                trip.currency,
              )}{" "}
              in repayments affects the trip balance without matching an
              outstanding share. This can happen with net settlements or changed
              expenses.
            </Notice>
          )}
          {repayments.map((e) => (
            <div key={e.id} className="expense-row">
              <Check size={17} />
              <div className="grow">
                {name(e.data.from)} → {name(e.data.to)}
                <small>
                  {e.data.date} · {e.data.notes}
                </small>
              </div>
              <b>{money(e.data.amount, trip.currency)}</b>
              {canEdit && (
                <button
                  className="icon-button"
                  aria-label="Delete repayment"
                  onClick={() => a.run(() => remove(e))}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {a.error && <Notice tone="error">{a.error}</Notice>}
      {plannedEntry && (
        <Modal
          title="Planned activity cost"
          onClose={() => setPlannedEntry(undefined)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              a.run(async () => {
                const currency = String(form.get("currency"));
                const cost = minor(String(form.get("cost")), currency);
                await save({
                  ...plannedEntry,
                  data: { ...plannedEntry.data, cost, currency },
                });
                setPlannedEntry(undefined);
                setPlannedOpen(true);
              });
            }}
          >
            <Field label="Activity">
              <select
                value={plannedEntry.id}
                onChange={(event) =>
                  setPlannedEntry(
                    entries.find((entry) => entry.id === event.target.value),
                  )
                }
              >
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.data.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estimated amount">
              <input
                key={plannedEntry.id + "cost"}
                name="cost"
                required
                inputMode="decimal"
                defaultValue={
                  plannedEntry.data.cost /
                  10 ** precision(plannedEntry.data.currency)
                }
              />
            </Field>
            <Field label="Currency">
              <select
                key={plannedEntry.id + "currency"}
                name="currency"
                defaultValue={plannedEntry.data.currency}
              >
                {[...new Set([plannedEntry.data.currency, ...currencies])].map(
                  (currency) => (
                    <option key={currency}>{currency}</option>
                  ),
                )}
              </select>
            </Field>
            <small>Use zero to remove an estimate.</small>
            {a.error && <Notice tone="error">{a.error}</Notice>}
            <Button type="submit" className="primary" disabled={a.busy}>
              Save planned cost
            </Button>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={editing.version ? "Edit expense" : "Add an expense"}
          onClose={() => setEditing(undefined)}
          wide
        >
          <ExpenseForm
            entity={editing}
            trip={trip}
            entries={entries}
            onDone={() => setEditing(undefined)}
          />
        </Modal>
      )}
      {settle && (
        <Modal title="Record a repayment" onClose={() => setSettle(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              a.run(async () => {
                const amount = minor(String(f.get("amount")), trip.currency);
                if (!amount || amount > settle.amount)
                  throw Error(
                    "Enter a positive amount up to the remaining balance.",
                  );
                const expenseId = String(f.get("expenseId") || "");
                if (expenseId) {
                  const row = coverage.rows.find(
                    (row) => row.expense.id === expenseId,
                  );
                  const share = row?.shares.find(
                    (share) => share.personId === settle.from,
                  );
                  if (
                    !row ||
                    row.expense.data.payer !== settle.to ||
                    !share ||
                    amount > share.amount - share.repaid
                  )
                    throw Error(
                      "The amount exceeds this expense's remaining share. Refresh and try again.",
                    );
                }
                await save(
                  makeEntity("repayment", tripEntity.id, {
                    from: settle.from,
                    to: settle.to,
                    ...(expenseId ? { expenseId } : {}),
                    amount,
                    date: String(f.get("date")),
                    notes: String(f.get("notes")),
                  }),
                );
                setSettle(undefined);
              });
            }}
          >
            <Notice>
              This records money sent outside Wayfarer. No payment is processed.
            </Notice>
            <p>
              {name(settle.from)} → {name(settle.to)}
            </p>
            <Field label="Apply to">
              <select name="expenseId" defaultValue={settle.expenseId || ""}>
                <option value="">Oldest unsettled shares first</option>
                {coverage.rows
                  .filter(
                    (row) =>
                      row.expense.data.payer === settle.to &&
                      row.shares.some(
                        (share) =>
                          share.personId === settle.from &&
                          share.amount > share.repaid,
                      ),
                  )
                  .map((row) => (
                    <option key={row.expense.id} value={row.expense.id}>
                      {row.expense.data.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={`Amount · ${trip.currency}`}>
              <input
                required
                name="amount"
                defaultValue={settle.amount / 10 ** precision(trip.currency)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Date">
              <input required name="date" type="date" defaultValue={today()} />
            </Field>
            <Field label="Notes">
              <input name="notes" />
            </Field>
            {a.error && <Notice tone="error">{a.error}</Notice>}
            <Button className="primary" type="submit" disabled={a.busy}>
              Record repayment
            </Button>
          </form>
        </Modal>
      )}
      {budgeting && (
        <Modal
          title="Trip & category budgets"
          onClose={() => setBudgeting(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              a.run(async () => {
                const categoryBudgets = Object.fromEntries(
                  [
                    "Food",
                    "Stay",
                    "Transport",
                    "Activities",
                    "Shopping",
                    "Other",
                  ].map((c) => [
                    c,
                    minor(String(f.get(c) || "0"), trip.currency),
                  ]),
                );
                await save({
                  ...tripEntity,
                  data: {
                    ...tripEntity.data,
                    budget: minor(String(f.get("budget")), trip.currency),
                    categoryBudgets,
                  },
                });
                setBudgeting(false);
              });
            }}
          >
            {[
              "budget",
              "Food",
              "Stay",
              "Transport",
              "Activities",
              "Shopping",
              "Other",
            ].map((c) => (
              <Field
                key={c}
                label={`${c === "budget" ? "Total budget" : c} · ${trip.currency}`}
              >
                <input
                  name={c}
                  required
                  inputMode="decimal"
                  defaultValue={
                    (c === "budget"
                      ? trip.budget
                      : trip.categoryBudgets[c] || 0) /
                    10 ** precision(trip.currency)
                  }
                />
              </Field>
            ))}
            {a.error && <Notice tone="error">{a.error}</Notice>}
            <Button type="submit" className="primary">
              Save budgets
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
