import { useState } from "react";
import {
  Plus,
  Download,
  ArrowUpRight,
  Check,
  Receipt,
  Trash2,
  Pencil,
} from "lucide-react";
import type { Entity, Expense, Repayment, Trip, Entry } from "./model";
import { makeEntity, today } from "./model";
import { save, remove } from "./store";
import { expenseCSV, report, money, minor, precision } from "./money";
import { Button, Modal, Field, Notice, Empty, useAsyncAction } from "./ui";
import { ExpenseForm, newExpense } from "./Forms";
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
    }>(),
    [budgeting, setBudgeting] = useState(false),
    a = useAsyncAction();
  const r = report(
    expenses.map((e) => e.data),
    repayments.map((e) => e.data),
    trip.currency,
    trip.people.map((p) => p.id),
  );
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
          <h2>A little clarity for every cost</h2>
          <p>Actual spending, fair splits, and a settled-up feeling.</p>
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
      <section className="planned-costs notice">
        <b>Planned estimates · separate from actual spending</b>
        <div className="button-row">
          {Object.entries(
            entries.reduce(
              (totals, e) => {
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
        <small>
          Shown in original currencies. Adding an actual expense does not
          automatically remove the linked estimate.
        </small>
      </section>
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
            {trip.budget - r.spent >= 0 ? "Left to explore" : "Over budget"}
          </small>
          <strong>
            {money(Math.abs(trip.budget - r.spent), trip.currency)}
          </strong>
          <span>Base currency · {trip.currency}</span>
        </div>
      </div>
      <div className="two-columns">
        <section className="panel">
          <div className="section-head">
            <h3>Expenses</h3>
            <span className="count">{expenses.length}</span>
          </div>
          {!expenses.length && (
            <Empty title="Start with the first coffee">
              Add an expense and choose who shared it.
            </Empty>
          )}
          {expenses.map((e) => (
            <div className="expense-row" key={e.id}>
              <div className="category-icon">
                <Receipt size={19} />
              </div>
              <div className="grow">
                <b>{e.data.title}</b>
                <small>
                  {e.data.date} · {e.data.category} · paid by{" "}
                  {name(e.data.payer)}
                </small>
                <small>
                  {e.data.items.length ? "Itemized" : "Split " + e.data.mode} ·{" "}
                  {e.data.rate.source}, {e.data.rate.date}
                </small>
                <small>
                  Changed {new Date(e.updatedAt).toLocaleString()} ·{" "}
                  {name(e.updatedBy)}
                </small>
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
          ))}
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
              Suggestions preserve everyone’s net balance. Recording a repayment
              does not add to trip spending.
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
        <div className="table-scroll">
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
                await save(
                  makeEntity("repayment", tripEntity.id, {
                    ...settle,
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
                    ...trip,
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
