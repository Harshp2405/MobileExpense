import { sum, average, pctChange, safeDiv } from "./calculations";
import { monthKey, previousMonthKey, toDate } from "./dateFilters";

const byMonth = (txns, key) =>
  txns.filter((t) => {
    const d = toDate(t);
    return d && monthKey(d) === key;
  });

export const monthStats = (expenses, incomes, key) => {
  const exp = byMonth(expenses, key);
  const inc = byMonth(incomes, key);
  const [y, m] = key.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate(); // leap-year safe

  const totalExpense = sum(exp);
  const totalIncome = sum(inc);

  return {
    key,
    totalExpense,
    totalIncome,
    net: totalIncome - totalExpense,
    avgDailyExpense: safeDiv(totalExpense, daysInMonth),
    transactionCount: exp.length + inc.length,
    expenseCount: exp.length,
    avgTransaction: average(exp),
    expenses: exp,
    incomes: inc,
  };
};

// Month vs previous month, with absolute + percentage difference.
export const monthComparison = (expenses, incomes, key) => {
  const current = monthStats(expenses, incomes, key);
  const previous = monthStats(expenses, incomes, previousMonthKey(key));
  return {
    current,
    previous,
    expenseDiff: current.totalExpense - previous.totalExpense,
    expenseChangePct: pctChange(current.totalExpense, previous.totalExpense),
    incomeDiff: current.totalIncome - previous.totalIncome,
    incomeChangePct: pctChange(current.totalIncome, previous.totalIncome),
    hasBaseline: previous.transactionCount > 0,
  };
};

// Per-category month-over-month change (powers "Transport is 35% higher than last month").
export const categoryMonthComparison = (expenses, key) => {
  const cur = byMonth(expenses, key);
  const prev = byMonth(expenses, previousMonthKey(key));
  const names = new Set(
    [...cur, ...prev].map((e) => e.category || "Uncategorized"),
  );
  return Array.from(names).map((name) => {
    const c = sum(cur.filter((e) => (e.category || "Uncategorized") === name));
    const p = sum(prev.filter((e) => (e.category || "Uncategorized") === name));
    return {
      name,
      current: c,
      previous: p,
      diff: c - p,
      changePct: pctChange(c, p),
    };
  });
};
