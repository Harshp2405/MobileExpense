import * as XLSX from "xlsx";
import { saveExportFile, MIME_TYPES } from "../utils/publicStorage";
import { accountNameFor } from "../reports/monthlyReportData";

// export const exportExpensesToExcel = async ({ expenses, monthName, year }) => {
//   const rows = expenses.map((item) => ({
//     title: item.title || "",
//     amount: Number(item.amount || 0),
//     category: item.category || "Other",
//     subcategory: item.subcategory || "",
//     method: item.method || "Cash",
//     date: item.date || "",
//     description: item.description || "",
//     month:
//       item.month ||
//       `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
//   }));

//   const worksheet = XLSX.utils.json_to_sheet(rows);
//   const workbook = XLSX.utils.book_new();
//   XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");

//   const wbout = XLSX.write(workbook, {
//     type: "base64",
//     bookType: "xlsx",
//   });

//   const fileName = `Expense_Report_${monthName}_${year}.xlsx`;
//   const fileUri = `${FileSystem.documentDirectory}${fileName}`;

//   await FileSystem.writeAsStringAsync(fileUri, wbout, {
//     encoding: FileSystem.EncodingType.Base64,
//   });

//   await Sharing.shareAsync(fileUri, {
//     mimeType:
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//     dialogTitle: `Export ${monthName} ${year}`,
//   });

//   return fileUri;
// };

export const exportExpensesToExcel = async ({
  expenses,
  income = [],
  accounts = [],
  monthName,
  year,
}) => {
  const rows = expenses.map((item) => ({
    title: item.title || "",
    amount: Number(item.amount || 0),
    category: item.category || "Other",
    subcategory: item.subcategory || "",
    method: item.method || "Cash",
    date: item.date || "",
    description: item.description || "",
    month:
      item.month ||
      `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  // Keep "Expenses" first: the Excel importer reads only the first sheet.
  XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");

  const incomeRows = income.map((item) => ({
    title: item.title || "",
    amount: Number(item.amount || 0),
    source: item.source || "Other",
    account: accountNameFor(accounts, item.accountId),
    date: item.date || "",
    description: item.description || "",
    month: item.month || "",
  }));
  XLSX.utils.book_append_sheet(
    workbook,
    incomeRows.length
      ? XLSX.utils.json_to_sheet(incomeRows)
      : XLSX.utils.json_to_sheet([], {
          header: ["title", "amount", "source", "account", "date", "description", "month"],
        }),
    "Income",
  );

  const accountRows = accounts.map((account) => ({
    name: account.name || "",
    type: account.type || "Cash",
    openingBalance: Number(account.initialBalance || 0),
    income: Number(account.earned || 0),
    spent: Number(account.spent || 0),
    balance: Number(account.balance || 0),
  }));
  XLSX.utils.book_append_sheet(
    workbook,
    accountRows.length
      ? XLSX.utils.json_to_sheet(accountRows)
      : XLSX.utils.json_to_sheet([], {
          header: ["name", "type", "openingBalance", "income", "spent", "balance"],
        }),
    "Accounts",
  );

  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

  return saveExportFile({
    fileName: `Expense_Report_${monthName}_${year}.xlsx`,
    base64,
    mimeType: MIME_TYPES.xlsx,
  });
};
