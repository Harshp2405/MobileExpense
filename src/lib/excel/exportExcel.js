import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export const exportExpensesToExcel = async ({ expenses, monthName, year }) => {
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
  XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");

  const wbout = XLSX.write(workbook, {
    type: "base64",
    bookType: "xlsx",
  });

  const fileName = `Expense_Report_${monthName}_${year}.xlsx`;
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(fileUri, {
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dialogTitle: `Export ${monthName} ${year}`,
  });

  return fileUri;
};
