import type { Expense, Repayment } from "./model";
export function precision(currency: string) {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function minor(value: string, currency: string) {
  if (!/^\d+(\.\d+)?$/.test(value.trim()))
    throw Error("Enter a non-negative decimal amount.");
  const p = precision(currency),
    [whole, frac = ""] = value.split(".");
  if (frac.length > p) throw Error(`${currency} allows ${p} decimal places.`);
  const n = Number(
    BigInt(whole) * 10n ** BigInt(p) + BigInt(frac.padEnd(p, "0")),
  );
  if (!Number.isSafeInteger(n)) throw Error("Amount is too large.");
  return n;
}
export function money(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    n / 10 ** precision(currency),
  );
}
function integer(n: number) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error("Amounts and shares must be non-negative safe integers.");
}
export function allocate(
  total: number,
  weights: Record<string, number>,
): Record<string, number> {
  integer(total);
  const entries = Object.entries(weights).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  entries.forEach(([, w]) => integer(w));
  const sum = entries.reduce((s, [, w]) => s + BigInt(w), 0n);
  if (!entries.length || sum === 0n)
    throw Error("Choose at least one participant with a positive share.");
  const parts = entries.map(([id, w]) => {
    const n = BigInt(total) * BigInt(w);
    return { id, amount: Number(n / sum), remainder: n % sum };
  });
  let left = total - parts.reduce((s, p) => s + p.amount, 0);
  parts.sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; i < left; i++) parts[i].amount++;
  return Object.fromEntries(parts.map((p) => [p.id, p.amount]));
}
export function splitExpense(e: Expense) {
  integer(e.total);
  if (
    !e.participants.length ||
    new Set(e.participants).size !== e.participants.length
  )
    throw Error("Choose unique participants.");
  for (const n of [e.tax, e.tip, e.fees]) integer(n);
  let result: Record<string, number> = {};
  const extras = e.tax + e.tip + e.fees,
    subtotal = e.total - extras;
  if (subtotal < 0) throw Error("Tax, tip and fees exceed the total.");
  if (e.items.length) {
    if (e.items.reduce((s, i) => s + i.amount, 0) !== subtotal)
      throw Error("Items plus tax, tip and fees must equal the total exactly.");
    for (const item of e.items) {
      if (
        item.participants.some((p) => !e.participants.includes(p)) ||
        new Set(item.participants).size !== item.participants.length
      )
        throw Error("Item participants must be unique expense participants.");
      const part = allocate(
        item.amount,
        Object.fromEntries(item.participants.map((p) => [p, 1])),
      );
      for (const [id, n] of Object.entries(part))
        result[id] = (result[id] || 0) + n;
    }
  } else {
    const w = Object.fromEntries(
      e.participants.map((p) => [
        p,
        e.mode === "equal" ? 1 : (e.shares[p] ?? 0),
      ]),
    );
    if (e.mode === "exact") {
      Object.values(w).forEach(integer);
      if (Object.values(w).reduce((s, n) => s + n, 0) !== subtotal)
        throw Error("Exact amounts must equal the subtotal.");
      result = w;
    } else {
      if (
        e.mode === "percentage" &&
        Object.values(w).reduce((s, n) => s + n, 0) !== 10000
      )
        throw Error("Percentages must add to 100%.");
      result = allocate(subtotal, w);
    }
  }
  const extra = allocate(
    extras,
    Object.fromEntries(
      e.participants.map((p) => [
        p,
        e.extraMode === "proportional" ? result[p] || 0 : 1,
      ]),
    ),
  );
  for (const p of e.participants)
    result[p] = (result[p] || 0) + (extra[p] || 0);
  return result;
}
export function convert(
  amount: number,
  from: string,
  to: string,
  rate: Expense["rate"],
) {
  integer(amount);
  integer(rate.num);
  integer(rate.den);
  if (!rate.num || !rate.den) throw Error("Exchange rate must be positive.");
  const n = BigInt(amount) * BigInt(rate.num) * 10n ** BigInt(precision(to)),
    d = BigInt(rate.den) * 10n ** BigInt(precision(from));
  const result = Number((n + d / 2n) / d);
  integer(result);
  return result;
}
export function report(
  expenses: Expense[],
  repayments: Repayment[],
  base: string,
  ids: string[],
) {
  const paid: Record<string, number> = Object.fromEntries(
      ids.map((p) => [p, 0]),
    ),
    owed = { ...paid },
    net = { ...paid };
  let spent = 0;
  const categories: Record<string, number> = {};
  for (const e of expenses) {
    const s = splitExpense(e),
      total = convert(e.total, e.currency, base, e.rate);
    const baseSplits = allocate(total, s);
    spent += total;
    categories[e.category] = (categories[e.category] || 0) + total;
    paid[e.payer] = (paid[e.payer] || 0) + total;
    for (const [p, n] of Object.entries(baseSplits))
      owed[p] = (owed[p] || 0) + n;
  }
  for (const p of new Set([...Object.keys(paid), ...Object.keys(owed)]))
    net[p] = (paid[p] || 0) - (owed[p] || 0);
  for (const r of repayments) {
    integer(r.amount);
    if (r.from === r.to) throw Error("Repayment participants must differ.");
    net[r.from] = (net[r.from] || 0) + r.amount;
    net[r.to] = (net[r.to] || 0) - r.amount;
  }
  const debtors = Object.entries(net)
      .filter(([, n]) => n < 0)
      .map(([id, n]) => ({ id, n: -n })),
    creditors = Object.entries(net)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n })),
    settlements: { from: string; to: string; amount: number }[] = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].n, creditors[j].n);
    settlements.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].n -= amount;
    creditors[j].n -= amount;
    if (!debtors[i].n) i++;
    if (!creditors[j].n) j++;
  }
  return { paid, owed, net, spent, categories, settlements };
}
export function expenseCSV(expenses: Expense[], base: string) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/"/g, '""')
      .replace(/^[=+@\-]/, "'$&") +
    '"';
  return [
    [
      "Date",
      "Title",
      "Category",
      "Payer",
      "Currency",
      "Minor units",
      "Base currency",
      "Base minor units",
      "Rate numerator",
      "Rate denominator",
      "Rate date",
      "Rate source",
    ],
    ...expenses.map((e) => [
      e.date,
      e.title,
      e.category,
      e.payer,
      e.currency,
      e.total,
      base,
      convert(e.total, e.currency, base, e.rate),
      e.rate.num,
      e.rate.den,
      e.rate.date,
      e.rate.source,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
