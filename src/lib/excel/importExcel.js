import * as XLSX from "xlsx";
import { validateExpenseRow } from "./validators";
import { addExpense } from "../db/queries";

export const importExpensesFromFile = async (fileContent, fileType = "csv") => {
  let workbook;

  if (fileType === "xlsx") {
    workbook = XLSX.read(fileContent, { type: "array" });
  } else {
    workbook = XLSX.read(fileContent, { type: "string" });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rawRows.length) {
    throw new Error("No data found in the file");
  }

  const normalizedHeaders = Object.keys(rawRows[0]).map((key) =>
    key.trim().toLowerCase().replace(/\s+/g, "_"),
  );

  const expected = [
    "title",
    "amount",
    "category",
    "subcategory",
    "method",
    "date",
    "description",
    "month",
  ];

  const missing = expected.filter((key) => !normalizedHeaders.includes(key));
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  const validRows = [];
  const invalidRows = [];

  rawRows.forEach((row, index) => {
    const normalizedRow = {
      title: row.title || row.Title || "",
      amount: row.amount || row.Amount || "",
      category: row.category || row.Category || "",
      subcategory: row.subcategory || row.Subcategory || "",
      method: row.method || row.Method || "Cash",
      date: row.date || row.Date || "",
      description: row.description || row.Description || "",
      month: row.month || row.Month || "",
    };

    const errors = validateExpenseRow(normalizedRow);
    if (errors.length) {
      invalidRows.push({ row: index + 2, errors });
      return;
    }

    validRows.push({
      title: normalizedRow.title.trim(),
      amount: Number(normalizedRow.amount),
      category: normalizedRow.category.trim(),
      subcategory: normalizedRow.subcategory?.trim() || null,
      method: normalizedRow.method || "Cash",
      date: normalizedRow.date,
      description: normalizedRow.description?.trim() || "",
      month: normalizedRow.month,
    });
  });

  if (invalidRows.length) {
    throw new Error(
      `Invalid rows found: ${invalidRows
        .map((item) => `Row ${item.row}: ${item.errors.join(", ")}`)
        .join(" | ")}`,
    );
  }

  for (const row of validRows) {
    await addExpense(row);
  }

  return validRows.length;
};
