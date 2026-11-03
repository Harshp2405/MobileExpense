import {
  getAccountsWithBalances,
  getAllIncome,
  getExpensesByMonth,
  getFuelLogsByMonth,
} from "../db/queries";

const sumBy = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

export function accountNameFor(accounts, accountId) {
  if (accountId == null) return "Unassigned";
  return accounts.find((account) => account.id === accountId)?.name || "Unassigned";
}

// Collects everything the monthly PDF, Excel and email reports show.
// Accounts carry all-time balances (opening + income - expenses +/- transfers).
export async function getMonthlyReportData({ monthKey, monthName, year, expenses }) {
  const [monthExpenses, fuelLogs, allIncome, accounts] = await Promise.all([
    expenses ? Promise.resolve(expenses) : getExpensesByMonth(monthKey),
    getFuelLogsByMonth(monthKey),
    getAllIncome(),
    getAccountsWithBalances(),
  ]);
  const income = allIncome.filter((item) => item.month === monthKey);
  const totalSpent = sumBy(monthExpenses, "amount");
  const fuelTotal = sumBy(fuelLogs, "totalCost");
  const incomeTotal = sumBy(income, "amount");
  const combinedTotal = totalSpent + fuelTotal;

  return {
    expenses: monthExpenses,
    fuelLogs,
    income,
    accounts,
    monthName,
    year,
    totalSpent,
    fuelTotal,
    incomeTotal,
    combinedTotal,
    netSavings: incomeTotal - combinedTotal,
    totalBalance: sumBy(accounts, "balance"),
  };
}

export const hasReportData = (report) =>
  report.expenses.length > 0 || report.fuelLogs.length > 0 ||
  report.income.length > 0 || report.accounts.length > 0;
