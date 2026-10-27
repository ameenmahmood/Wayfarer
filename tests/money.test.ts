import { describe, it, expect } from "vitest";
import {
  allocate,
  minor,
  precision,
  splitExpense,
  report,
  convert,
  expenseCSV,
} from "../src/money";
import type { Expense } from "../src/model";
const expense = (over: Partial<Expense> = {}): Expense => ({
  title: "Dinner",
  category: "Food",
  date: "2027-04-12",
  notes: "",
  payer: "a",
  currency: "USD",
  total: 100,
  participants: ["a", "b", "c"],
  mode: "equal",
  shares: {},
  items: [],
  tax: 0,
  tip: 0,
  fees: 0,
  extraMode: "equal",
  rate: { num: 1, den: 1, date: "2027-04-12", source: "Manual" },
  ...over,
});
describe("money and splits", () => {
  it("supports zero, two and three decimal currencies", () => {
    expect(precision("JPY")).toBe(0);
    expect(minor("123", "JPY")).toBe(123);
    expect(minor("1.234", "KWD")).toBe(1234);
    expect(() => minor("1.1", "JPY")).toThrow();
    expect(() => minor("-1", "USD")).toThrow();
    expect(() => minor("Infinity", "USD")).toThrow();
  });
  it("allocates deterministic largest remainders by participant ID", () => {
    expect(allocate(100, { c: 1, b: 1, a: 1 })).toEqual({
      a: 34,
      b: 33,
      c: 33,
    });
    expect(allocate(1, { z: 1, a: 1 })).toEqual({ a: 1, z: 0 });
  });
  it("reconciles randomized integer allocations", () => {
    for (let total = 0; total < 700; total += 7) {
      const r = allocate(total, { a: 2, b: 3, c: 7, d: 1 });
      expect(Object.values(r).reduce((s, n) => s + n, 0)).toBe(total);
      expect(Object.values(r).every(Number.isInteger)).toBe(true);
    }
  });
  it("handles exact, percentage and weighted splits", () => {
    expect(
      splitExpense(expense({ mode: "exact", shares: { a: 10, b: 20, c: 70 } })),
    ).toEqual({ a: 10, b: 20, c: 70 });
    expect(
      splitExpense(
        expense({ mode: "percentage", shares: { a: 5000, b: 2500, c: 2500 } }),
      ),
    ).toEqual({ a: 50, b: 25, c: 25 });
    expect(
      splitExpense(expense({ mode: "weighted", shares: { a: 2, b: 1, c: 1 } })),
    ).toEqual({ a: 50, b: 25, c: 25 });
  });
  it("rejects invalid and duplicate participants and shares", () => {
    expect(() =>
      splitExpense(expense({ mode: "exact", shares: { a: 3 } })),
    ).toThrow();
    expect(() =>
      splitExpense(expense({ mode: "percentage", shares: { a: 500 } })),
    ).toThrow();
    expect(() => splitExpense(expense({ participants: ["a", "a"] }))).toThrow();
    expect(() => allocate(10, { a: -1 })).toThrow();
  });
  it("splits individual items and allocates proportional extras once", () => {
    const r = splitExpense(
      expense({
        total: 1200,
        participants: ["a", "b"],
        items: [
          { title: "food", amount: 900, participants: ["a", "b"] },
          { title: "drink", amount: 100, participants: ["b"] },
        ],
        tax: 100,
        tip: 100,
        extraMode: "proportional",
      }),
    );
    expect(r).toEqual({ a: 540, b: 660 });
    expect(Object.values(r).reduce((s, n) => s + n, 0)).toBe(1200);
  });
  it("rejects double-counted item totals and out-of-scope assignments", () => {
    expect(() =>
      splitExpense(
        expense({
          items: [{ title: "food", amount: 100, participants: ["a"] }],
          tax: 10,
        }),
      ),
    ).toThrow();
    expect(() =>
      splitExpense(
        expense({
          items: [{ title: "food", amount: 100, participants: ["z"] }],
        }),
      ),
    ).toThrow();
  });
  it("converts precision with half-up rounding using a saved rational rate", () => {
    expect(
      convert(12000, "JPY", "USD", {
        num: 67,
        den: 10000,
        date: "2027-04-12",
        source: "Manual",
      }),
    ).toBe(8040);
    expect(
      convert(1000, "KWD", "USD", { num: 325, den: 100, date: "", source: "" }),
    ).toBe(325);
    expect(
      convert(1, "USD", "USD", { num: 1, den: 2, date: "", source: "" }),
    ).toBe(1);
  });
  it("preserves net balances and excludes repayments from spending", () => {
    const e = expense({ total: 300 });
    const r = report([e], [], "USD", ["a", "b", "c"]);
    expect(r.net).toEqual({ a: 200, b: -100, c: -100 });
    const settled = report(
      [e],
      r.settlements.map((s) => ({ ...s, date: "2027-04-12", notes: "" })),
      "USD",
      ["a", "b", "c"],
    );
    expect(settled.spent).toBe(300);
    expect(settled.net).toEqual({ a: 0, b: 0, c: 0 });
    expect(settled.settlements).toEqual([]);
  });
  it("recalculates edits and deletions without residual balances", () => {
    expect(
      report([expense({ total: 600 })], [], "USD", ["a", "b", "c"]).owed.a,
    ).toBe(200);
    expect(report([], [], "USD", ["a", "b", "c"]).spent).toBe(0);
  });
  it("CSV escapes formula injection and quotes", () => {
    expect(expenseCSV([expense({ title: "=1+1" })], "USD")).toContain(
      '"\'=1+1"',
    );
    expect(expenseCSV([expense({ title: 'a"b' })], "USD")).toContain('"a""b"');
  });
});
