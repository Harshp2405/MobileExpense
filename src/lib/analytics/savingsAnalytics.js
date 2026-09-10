import { sum, safeDiv } from "./calculations";

export const savingsStats = (expenses, incomes) => {
  const totalIncome = sum(incomes);
  const totalExpense = sum(expenses);
  const savings = totalIncome - totalExpense;
  return {
    totalIncome,
    totalExpense,
    savings,
    // Null when there's no income — the UI shows "—" rather than a fake 0% or -Infinity.
    savingsRate: totalIncome > 0 ? safeDiv(savings, totalIncome) * 100 : null,
    hasIncome: incomes.length > 0,
  };
};

// Per-month savings across a 12-month comparison series (from yearStats.comparison).
export const savingsBreakdown = (comparison) => {
  const withData = comparison.filter((m) => m.income > 0 || m.expense > 0);
  if (withData.length === 0) return { best: null, worst: null, months: [] };
  return {
    months: withData,
    best: withData.reduce((a, b) => (b.savings > a.savings ? b : a)),
    worst: withData.reduce((a, b) => (b.savings < a.savings ? b : a)),
  };
};
