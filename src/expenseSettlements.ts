import type { Entity, Expense, Repayment } from "./model";
import { allocate, convert, splitExpense } from "./money";

// Shares and repayments use the same base-currency rounding as the trip report.
// Derive coverage on every render so edits, deletions and sync conflicts cannot
// leave a separately stored settled flag out of date.
export function expenseSettlements(
  expenses: Entity<Expense>[],
  repayments: Entity<Repayment>[],
  currency: string,
) {
  const rows = [...expenses]
    .sort(
      (a, b) =>
        a.data.date.localeCompare(b.data.date) || a.id.localeCompare(b.id),
    )
    .map((expense) => ({
      expense,
      shares: Object.entries(
        allocate(
          convert(
            expense.data.total,
            expense.data.currency,
            currency,
            expense.data.rate,
          ),
          splitExpense(expense.data),
        ),
      ).map(([personId, amount]) => ({ personId, amount, repaid: 0 })),
      payments: [] as { repayment: Entity<Repayment>; amount: number }[],
    }));
  const unallocated: { repayment: Entity<Repayment>; amount: number }[] = [];
  // Explicit links take precedence over automatic matching, irrespective of dates.
  const ordered = [...repayments].sort(
    (a, b) =>
      Number(!!b.data.expenseId) - Number(!!a.data.expenseId) ||
      a.data.date.localeCompare(b.data.date) ||
      a.id.localeCompare(b.id),
  );
  for (const repayment of ordered) {
    let remaining = repayment.data.amount;
    for (const row of rows) {
      if (
        repayment.data.expenseId &&
        repayment.data.expenseId !== row.expense.id
      )
        continue;
      if (row.expense.data.payer !== repayment.data.to) continue;
      const share = row.shares.find((s) => s.personId === repayment.data.from);
      if (!share || share.personId === row.expense.data.payer) continue;
      const amount = Math.min(remaining, share.amount - share.repaid);
      if (amount > 0) {
        share.repaid += amount;
        remaining -= amount;
        row.payments.push({ repayment, amount });
      }
    }
    if (remaining > 0) unallocated.push({ repayment, amount: remaining });
  }
  return { rows, unallocated };
}
