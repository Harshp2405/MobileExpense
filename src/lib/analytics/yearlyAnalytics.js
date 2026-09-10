import { sum, safeDiv } from "./calculations";
import { toDate, MONTH_LABELS } from "./dateFilters";

const byYear = (txns, year) =>
  txns.filter((t) => {
    const d = toDate(t);
    return d && d.getFullYear() === Number(year);
  });

// Always returns 12 entries so the chart never has holes.
export const monthlySeries = (txns, year) => {
  const buckets = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    label: MONTH_LABELS[i],
    key: `${year}-${String(i + 1).padStart(2, "0")}`,
    total: 0,
    count: 0,
  }));
  byYear(txns, year).forEach((t) => {
    const d = toDate(t);
    if (!d) return;
    buckets[d.getMonth()].total += Number(t.amount) || 0;
    buckets[d.getMonth()].count += 1;
  });
  return buckets;
};

export const yearStats = (expenses, incomes, year) => {
  const expSeries = monthlySeries(expenses, year);
  const incSeries = monthlySeries(incomes, year);
  const totalExpense = sum(expSeries, "total");
  const totalIncome = sum(incSeries, "total");

  // Only consider months that actually have data — an empty month is not "the lowest".
  const active = expSeries.filter((m) => m.count > 0);
  const highest = active.length
    ? active.reduce((a, b) => (b.total > a.total ? b : a))
    : null;
  const lowest = active.length
    ? active.reduce((a, b) => (b.total < a.total ? b : a))
    : null;

  return {
    year: String(year),
    totalIncome,
    totalExpense,
    totalSavings: totalIncome - totalExpense,
    avgMonthlyExpense: safeDiv(totalExpense, active.length || 12),
    avgMonthlyIncome: safeDiv(
      totalIncome,
      incSeries.filter((m) => m.count > 0).length || 12,
    ),
    highestMonth: highest,
    lowestMonth: lowest,
    transactionCount:
      expSeries.reduce((a, m) => a + m.count, 0) +
      incSeries.reduce((a, m) => a + m.count, 0),
    expenseSeries: expSeries,
    incomeSeries: incSeries,
    // Ready-to-render Income vs Expense vs Savings table/chart rows
    comparison: expSeries.map((m, i) => ({
      label: m.label,
      expense: m.total,
      income: incSeries[i].total,
      savings: incSeries[i].total - m.total,
    })),
  };
};
