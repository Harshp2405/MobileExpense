import * as XLSX from "xlsx";
import { saveExcelWorkbook } from "./exportExcel";

export const downloadSampleExcelTemplate = async () => {
  const workbook = XLSX.utils.book_new();
  const sheets = {
    Expenses: [{
      title: "Groceries", amount: 1200, category: "Food", subcategory: "Daily Needs",
      method: "Cash", date: "15/09/2026", description: "Weekly groceries",
      month: "2026-09", account: "Cash",
    }],
    Fuel: [{
      startKm: 1000, odometerKm: 1200, litres: 5, pricePerLitre: 100,
      totalCost: 500, date: "20/09/2026", month: "2026-09", note: "Petrol",
    }],
    Income: [{
      title: "Salary", amount: 50000, source: "Salary", account: "Cash",
      date: "01/09/2026", description: "", month: "2026-09", method: "Cash",
    }],
    Accounts: [{ name: "Cash", type: "Cash", openingBalance: 0 }],
  };
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return saveExcelWorkbook(workbook, "expense_import_sample.xlsx");
};
