import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

export const downloadSampleExcelTemplate = async () => {
  const rows = [
    {
      title: "Groceries",
      amount: 1200,
      category: "Food",
      subcategory: "Daily Needs",
      method: "Cash",
      date: "15/09/2026",
      description: "Weekly groceries",
      month: "2026-09",
    },
    {
      title: "Fuel",
      amount: 2500,
      category: "Transport",
      subcategory: "Petrol",
      method: "Card",
      date: "20/09/2026",
      description: "Petrol refill",
      month: "2026-09",
    },
    {
      title: "Rent",
      amount: 18000,
      category: "Home",
      subcategory: "Apartment",
      method: "UPI",
      date: "01/09/2026",
      description: "Monthly rent",
      month: "2026-09",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");
  const workbookBase64 = XLSX.write(workbook, {
    type: "base64",
    bookType: "xlsx",
  });

  const fileUri = `${FileSystem.documentDirectory}expense_import_sample.xlsx`;
  await FileSystem.writeAsStringAsync(fileUri, workbookBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(fileUri, {
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dialogTitle: "Download Expense Import Template",
  });

  return fileUri;
};
