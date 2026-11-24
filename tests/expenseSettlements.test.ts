import { describe, expect, it } from "vitest";
import { expenseSettlements } from "../src/expenseSettlements";
import { makeEntity, type Expense, type Repayment } from "../src/model";
import { report } from "../src/money";
const expense = (id: string, total: number, date = "2026-11-24") => ({
  ...makeEntity<Expense>("expense", "trip", {
    title: id,
    total,
    date,
    payer: "a",
    participants: ["a", "b"],
    category: "Transport",
    notes: "",
    currency: "USD",
    mode: "equal",
    shares: {},
    items: [],
    tax: 0,
    tip: 0,
    fees: 0,
    extraMode: "equal",
    rate: { num: 1, den: 1, date, source: "Manual" },
  }),
  id,
});
const payment = (amount: number, expenseId?: string) =>
  makeEntity<Repayment>("repayment", "trip", {
    amount,
    expenseId,
    from: "b",
    to: "a",
    date: "2026-11-25",
    notes: "",
  });
const owed = (rows: ReturnType<typeof expenseSettlements>["rows"]) =>
  rows.map((row) => row.shares.find((s) => s.personId === "b")!);
describe("expense repayment coverage", () => {
  it("settles one flight and reduces the total balance without adding spending", () => {
    const expenses = [expense("first", 17000), expense("second", 23780)];
    const repayments = [payment(8500, "first")];
    const { rows } = expenseSettlements(expenses, repayments, "USD");
    expect(owed(rows).map((s) => s.amount - s.repaid)).toEqual([0, 11890]);
    const totals = report(
      expenses.map((e) => e.data),
      repayments.map((e) => e.data),
      "USD",
      ["a", "b"],
    );
    expect(totals.spent).toBe(40780);
    expect(totals.settlements).toEqual([{ from: "b", to: "a", amount: 11890 }]);
  });
  it("matches legacy payments oldest first, reserves explicit links and supports partial payments", () => {
    const expenses = [
      expense("first", 17000, "2026-11-23"),
      expense("second", 23780),
    ];
    const { rows, unallocated } = expenseSettlements(
      expenses,
      [payment(10000), payment(8500, "first")],
      "USD",
    );
    expect(owed(rows).map((s) => s.repaid)).toEqual([8500, 10000]);
    expect(unallocated).toEqual([]);
  });
  it("recalculates edits and removals without losing overpayments or redirecting explicit payments", () => {
    const repayment = payment(8500, "first");
    const edited = expenseSettlements(
      [expense("first", 10000), expense("second", 10000)],
      [repayment],
      "USD",
    );
    expect(owed(edited.rows).map((s) => s.repaid)).toEqual([5000, 0]);
    expect(edited.unallocated[0].amount).toBe(3500);
    expect(
      expenseSettlements([expense("second", 10000)], [repayment], "USD")
        .unallocated[0].amount,
    ).toBe(8500);
    expect(
      owed(expenseSettlements([expense("first", 17000)], [], "USD").rows)[0]
        .repaid,
    ).toBe(0);
  });
  it("uses snapshot conversion and itemized splits with exact base rounding", () => {
    const e = expense("fx", 1001);
    e.data.currency = "KWD";
    e.data.rate = { num: 325, den: 100, date: "2026-11-24", source: "Manual" };
    e.data.items = [{ title: "Ticket", amount: 1001, participants: ["b"] }];
    const totals = report([e.data], [], "USD", ["a", "b"]);
    const share = owed(
      expenseSettlements([e], [payment(100, "fx")], "USD").rows,
    )[0];
    expect(share.amount).toBe(totals.owed.b);
    expect(share.repaid).toBe(100);
  });
  it("keeps net transfers through another traveler in the balance without claiming an expense was directly paid", () => {
    const repayment = payment(500);
    repayment.data.to = "c";
    const result = expenseSettlements(
      [expense("first", 1000)],
      [repayment],
      "USD",
    );
    expect(owed(result.rows)[0].repaid).toBe(0);
    expect(result.unallocated[0].amount).toBe(500);
  });
});
