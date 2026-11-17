import * as XLSX from "xlsx";
import { Platform } from "react-native";
import { saveExportFile, MIME_TYPES } from "../utils/publicStorage";
import { accountNameFor } from "../reports/monthlyReportData";

export async function saveExcelWorkbook(workbook, fileName) {
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  if (base64.length * 3 / 4 > 20 * 1024 * 1024) {
    throw new Error("Excel file exceeds the 20 MiB limit");
  }
  if (Platform.OS !== "web") {
    return saveExportFile({ fileName, base64, mimeType: MIME_TYPES.xlsx });
  }
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME_TYPES.xlsx }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { fileName, location: "browser downloads" };
}

export const exportExpensesToExcel = async ({
  expenses, fuelLogs = [], income = [], accounts = [], monthName, year,
}) => {
  const workbook = XLSX.utils.book_new();
  const addSheet = (name, rows, header) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header }), name);
  };
  addSheet("Expenses", expenses.map((item) => ({
    title: item.title || "", amount: Number(item.amount), category: item.category || "",
    subcategory: item.subcategory || "", method: item.method || "",
    date: item.date || "", description: item.description || "", month: item.month || "",
    account: item.accountId == null ? "" : accountNameFor(accounts, item.accountId), createdAt: item.createdAt || "",
  })), ["title", "amount", "category", "subcategory", "method", "date", "description", "month", "account", "createdAt"]);
  addSheet("Fuel", fuelLogs.map((item) => ({
    startKm: item.startKm, odometerKm: item.odometerKm ?? null, litres: item.litres,
    pricePerLitre: item.pricePerLitre, totalCost: item.totalCost, date: item.date,
    month: item.month, note: item.note || "", createdAt: item.createdAt || "",
  })), ["startKm", "odometerKm", "litres", "pricePerLitre", "totalCost", "date", "month", "note", "createdAt"]);
  addSheet("Income", income.map((item) => ({
    title: item.title || "", amount: Number(item.amount), source: item.source || "",
    account: item.accountId == null ? "" : accountNameFor(accounts, item.accountId), date: item.date || "",
    description: item.description || "", month: item.month || "",
    method: item.method || "", createdAt: item.createdAt || "",
  })), ["title", "amount", "source", "account", "date", "description", "month", "method", "createdAt"]);
  addSheet("Accounts", accounts.map((account) => ({
    name: account.name || "", type: account.type || "Cash",
    openingBalance: Number(account.initialBalance || 0), income: Number(account.earned || 0),
    spent: Number(account.spent || 0), balance: Number(account.balance || 0),
  })), ["name", "type", "openingBalance", "income", "spent", "balance"]);
  return saveExcelWorkbook(workbook, `Expense_Report_${monthName}_${year}.xlsx`);
};
