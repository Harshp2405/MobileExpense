import { accountNameFor } from "../reports/monthlyReportData";

export async function createWebReportPDF({
  expenses,
  fuelLogs,
  income = [],
  accounts = [],
  monthName,
  year,
  totalSpent,
  fuelTotal,
  incomeTotal = 0,
  totalBalance = 0,
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  let y = 18;
  const line = (value) => {
    const lines = pdf.splitTextToSize(String(value ?? ""), 174);
    for (const text of lines) {
      if (y > 278) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(text, 18, y);
      y += 6;
    }
  };
  pdf.setFontSize(12);
  line(`Expense Report - ${monthName} ${year}`);
  line(`Expenses: INR ${totalSpent.toFixed(2)}`);
  line(`Fuel: INR ${fuelTotal.toFixed(2)}`);
  line(`Combined spending: INR ${(totalSpent + fuelTotal).toFixed(2)}`);
  line(`Income: INR ${incomeTotal.toFixed(2)}`);
  line(`Net: INR ${(incomeTotal - totalSpent - fuelTotal).toFixed(2)}`);
  line("Generated from local data.");
  line("");
  line("Expenses");
  if (!expenses.length) line("No expenses recorded.");
  for (const item of expenses) {
    line(`${item.title} - INR ${Number(item.amount).toFixed(2)}`);
    line(`${item.date || "-"} | ${item.category || "Other"}${item.subcategory ? ` / ${item.subcategory}` : ""} | ${item.method || "Cash"}`);
    if (item.description) line(item.description);
    line("");
  }
  line("Fuel logs");
  if (!fuelLogs.length) line("No fuel logs recorded.");
  for (const log of fuelLogs) {
    line(`${log.date || "-"} - INR ${Number(log.totalCost).toFixed(2)}`);
    line(`Litres: ${log.litres} | Price/litre: INR ${log.pricePerLitre}`);
    line(`Odometer: ${log.startKm ?? "-"} to ${log.odometerKm ?? "Pending"}`);
    if (log.note) line(log.note);
    line("");
  }
  line("Income");
  if (!income.length) line("No income recorded.");
  for (const item of income) {
    line(`${item.title} - INR ${Number(item.amount).toFixed(2)}`);
    line(`${item.date || "-"} | ${item.source || "Other"} | ${accountNameFor(accounts, item.accountId)}`);
    if (item.description) line(item.description);
    line("");
  }
  line(`Accounts (all-time balances) - Total INR ${totalBalance.toFixed(2)}`);
  if (!accounts.length) line("No accounts created.");
  for (const account of accounts) {
    line(`${account.name} (${account.type || "Cash"}) - Balance INR ${Number(account.balance || 0).toFixed(2)}`);
    line(`Opening: INR ${Number(account.initialBalance || 0).toFixed(2)} | Income: INR ${Number(account.earned || 0).toFixed(2)} | Spent: INR ${Number(account.spent || 0).toFixed(2)}`);
  }
  line("Balances are all-time: opening + income - expenses +/- transfers.");
  line("Fuel logs are not linked to accounts.");
  return pdf;
}

export async function downloadEmailReport(report) {
  const pdf = await createWebReportPDF(report);
  const { monthName, year } = report;
  const fileName = `Expense_Report_${monthName}_${year}.pdf`;
  await pdf.save(fileName, { returnPromise: true });
  return fileName;
}
