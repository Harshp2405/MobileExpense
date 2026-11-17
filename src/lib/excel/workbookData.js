import * as XLSX from "xlsx";
import { TABLES, normalizeTables } from "../backup/portableData";

const sheetNames = {
  categories: "Categories", accounts: "Accounts", subcategories: "Subcategories",
  budgets: "Budgets", expenses: "Expenses", fuelLogs: "Fuel Logs",
  income: "Income", transfers: "Transfers",
};
const metadataName = "Database Format";
const format = "expense-tracker-excel";
const maxBytes = 20 * 1024 * 1024;
const headerKey = (value) => String(value).trim().toLowerCase().replace(/[\s_-]+/g, "");
const emptyTables = () => Object.fromEntries(Object.keys(TABLES).map((table) => [table, []]));

export function createDatabaseWorkbook(tables) {
  const clean = normalizeTables(tables);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["format", "version"], [format, 1],
  ]), metadataName);
  for (const [table, fields] of Object.entries(TABLES)) {
    XLSX.utils.book_append_sheet(
      workbook, XLSX.utils.json_to_sheet(clean[table], { header: Object.keys(fields) }), sheetNames[table],
    );
  }
  return workbook;
}

function sheetRows(sheet, name) {
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith("!") && cell.f) throw new Error(`${name}: formulas are not supported`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true });
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((value) => value == null ? "" : headerKey(value));
  if (headers.some((value, index) => value && headers.indexOf(value) !== index)) {
    throw new Error(`${name}: duplicate column headers`);
  }
  return {
    headers,
    rows: rows.slice(1).map((values, index) => ({ values, number: index + 2 }))
      .filter(({ values }) => values.some((value) => value !== null && value !== "")),
  };
}

function readTable(sheet, name, fields, { strict = false } = {}) {
  const { headers, rows } = sheetRows(sheet, name);
  if (!headers.length && !rows.length && !strict) return [];
  const known = new Map(Object.entries(fields).map(([field, aliases]) => [field, aliases.map(headerKey)]));
  const columns = new Map();
  for (const [index, header] of headers.entries()) {
    if (!header) continue;
    const match = [...known].find(([, aliases]) => aliases.includes(header));
    if (!match) throw new Error(`${name}: unsupported column "${header}"`);
    if (columns.has(match[0])) throw new Error(`${name}: duplicate column ${match[0]}`);
    columns.set(match[0], index);
  }
  if (strict) {
    for (const field of Object.keys(fields)) {
      if (!columns.has(field)) throw new Error(`${name}: missing column ${field}`);
    }
  }
  return rows.map(({ values, number }) => {
    if (values.some((value, index) => !headers[index] && value !== null && value !== "")) {
      throw new Error(`${name} row ${number}: data without a column header`);
    }
    const row = { _row: number };
    for (const [field, index] of columns) row[field] = values[index] ?? null;
    return row;
  });
}

const aliases = (fields) => Object.fromEntries(fields.map((field) => [field, [field]]));
const legacyFields = {
  Expenses: aliases(["title", "amount", "category", "subcategory", "method", "date", "description", "month", "account", "createdAt"]),
  Fuel: aliases(["startKm", "odometerKm", "litres", "pricePerLitre", "totalCost", "date", "month", "note", "createdAt"]),
  Income: aliases(["title", "amount", "source", "account", "date", "description", "month", "method", "createdAt"]),
  Accounts: aliases(["name", "type", "openingBalance", "income", "spent", "balance"]),
};

function text(value, label, required = false) {
  if (value == null || value === "") {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${label} must be text`);
  const result = value.trim();
  if (required && !result) throw new Error(`${label} is required`);
  return result || null;
}

function number(value, label, { optional = false, positive = false } = {}) {
  if (value == null || value === "") {
    if (optional) return null;
    throw new Error(`${label} is required`);
  }
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) {
    throw new Error(`${label} must be a number`);
  }
  const result = Number(value);
  if (!Number.isFinite(result) || (positive && result <= 0)) throw new Error(`${label} must be ${positive ? "a positive " : "a valid "}number`);
  return result;
}

function dateValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error("Invalid Excel date");
    value = `${String(parsed.d).padStart(2, "0")}/${String(parsed.m).padStart(2, "0")}/${parsed.y}`;
  }
  const date = text(value, "Date", true);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const normalized = iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : date;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  if (!match) throw new Error("Date must use DD/MM/YYYY or YYYY-MM-DD");
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error("Invalid date");
  }
  return iso ? date : normalized;
}

function monthValue(value, date) {
  const derived = date && (/^\d{4}-/.test(date) ? date.slice(0, 7) : `${date.slice(6)}-${date.slice(3, 5)}`);
  const month = text(value, "Month") || derived;
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must use YYYY-MM");
  return month;
}

function parseLegacy(workbook, fileType) {
  const tables = emptyTables();
  const selected = {};
  for (const name of workbook.SheetNames) {
    const key = headerKey(name);
    const canonical = key === "fuellogs" ? "Fuel" : Object.keys(legacyFields).find((field) => headerKey(field) === key);
    const single = workbook.SheetNames.length === 1;
    const headers = !canonical && single ? sheetRows(workbook.Sheets[name], name).headers : [];
    const expenseSheet = ["title", "amount", "category"].every((field) => headers.includes(field));
    const target = canonical || (single && (fileType === "csv" || expenseSheet) ? "Expenses" : null);
    if (!target) {
      if (sheetRows(workbook.Sheets[name], name).rows.length) throw new Error(`Unsupported sheet: ${name}`);
      continue;
    }
    if (selected[target]) throw new Error(`Duplicate sheet: ${target}`);
    selected[target] = readTable(workbook.Sheets[name], name, legacyFields[target]);
  }
  if (!Object.keys(selected).length) throw new Error("No supported worksheets found");
  const accountIds = new Map();
  for (const row of selected.Accounts || []) {
    try {
      const name = text(row.name, "Account name", true);
      const key = name.toLowerCase();
      if (accountIds.has(key)) throw new Error("Duplicate account name");
      const id = tables.accounts.length + 1;
      accountIds.set(key, id);
      tables.accounts.push({ id, name, type: text(row.type, "Account type") || "Cash",
        initialBalance: number(row.openingBalance, "Opening balance") });
    } catch (error) { throw new Error(`Accounts row ${row._row}: ${error.message}`); }
  }
  const fieldLists = {};
  for (const [sheet, table] of [["Expenses", "expenses"], ["Fuel", "fuelLogs"], ["Income", "income"]]) {
    const rows = selected[sheet] || [];
    if (!rows.length) continue;
    const included = Object.keys(rows[0]);
    fieldLists[table] = included.filter((field) => !["_row", "account"].includes(field));
    if (included.includes("account")) fieldLists[table].push("accountId");
    if (!included.includes("month")) fieldLists[table].push("month");
    if (included.includes("createdAt") && rows.some((row) => !row.createdAt)) {
      fieldLists[table] = fieldLists[table].filter((field) => field !== "createdAt");
    }
    if (table === "fuelLogs" && !included.includes("totalCost")) fieldLists[table].push("totalCost");
    for (const row of rows) {
      try {
        const date = dateValue(row.date);
        const month = monthValue(row.month, date);
        const common = { id: tables[table].length + 1, date, month, createdAt: text(row.createdAt, "Created at") };
        let record;
        if (table === "fuelLogs") {
          if (!date) throw new Error("Date is required");
          const litres = number(row.litres, "Litres", { positive: true });
          const pricePerLitre = number(row.pricePerLitre, "Price per litre", { positive: true });
          record = { ...common, startKm: number(row.startKm, "Start km"),
            odometerKm: number(row.odometerKm, "Odometer km", { optional: true }),
            litres, pricePerLitre, totalCost: row.totalCost == null || row.totalCost === ""
              ? litres * pricePerLitre : number(row.totalCost, "Total cost"), note: text(row.note, "Note") };
        } else {
          const account = text(row.account, "Account");
          if (account?.toLowerCase() === "unassigned" && accountIds.has("unassigned")) {
            throw new Error('Account "Unassigned" is ambiguous in a report file');
          }
          const accountId = !account || account.toLowerCase() === "unassigned" ? null : accountIds.get(account.toLowerCase());
          if (account && account.toLowerCase() !== "unassigned" && !accountId) {
            throw new Error(`Account "${account}" is missing from the Accounts sheet`);
          }
          record = { ...common, title: text(row.title, "Title", true),
            amount: number(row.amount, "Amount", { positive: true }), accountId,
            method: text(row.method, "Method"), description: text(row.description, "Description") };
          if (table === "expenses") {
            record.category = text(row.category, "Category");
            record.subcategory = text(row.subcategory, "Subcategory");
          } else record.source = text(row.source, "Source");
        }
        tables[table].push(record);
      } catch (error) { throw new Error(`${sheet} row ${row._row}: ${error.message}`); }
    }
  }
  if (!Object.values(tables).some((rows) => rows.length)) throw new Error("No data found in the file");
  return {
    kind: "report", tables: normalizeTables(tables), options: { legacyFields: fieldLists },
    warning: "Report files lack complete identities and history. Matching uses the available columns; distinct similar records may be skipped. Account income, spending and balance columns are summaries, not transactions; balances can differ from the original.",
  };
}

export function parseExcelFile(content, fileType = "xlsx") {
  const size = content?.byteLength ?? 0;
  if (!size || size > maxBytes) throw new Error("Choose an Excel or CSV file smaller than 20 MiB");
  if (!["xlsx", "csv"].includes(fileType)) throw new Error("Unsupported file type");
  const workbook = XLSX.read(content, { type: "array", codepage: 65001, raw: fileType === "csv" });
  if (!workbook.Sheets[metadataName]) return parseLegacy(workbook, fileType);
  sheetRows(workbook.Sheets[metadataName], metadataName);
  const metadata = XLSX.utils.sheet_to_json(workbook.Sheets[metadataName], { header: 1, defval: null });
  if (metadata.length !== 2 || metadata.some((row) => row.length !== 2) ||
      metadata[0][0] !== "format" || metadata[0][1] !== "version" ||
      metadata[1][0] !== format || metadata[1][1] !== 1) {
    throw new Error("Unsupported Excel database format");
  }
  const allowed = new Set([metadataName, ...Object.values(sheetNames)]);
  for (const name of workbook.SheetNames) {
    if (!allowed.has(name)) throw new Error(`Unsupported sheet: ${name}`);
  }
  const tables = emptyTables();
  for (const [table, fields] of Object.entries(TABLES)) {
    const name = sheetNames[table];
    if (!workbook.Sheets[name]) throw new Error(`Missing sheet: ${name}`);
    tables[table] = readTable(workbook.Sheets[name], name, aliases(Object.keys(fields)), { strict: true })
      .map(({ _row, ...row }) => row);
  }
  return { kind: "database", tables: normalizeTables(tables), options: {}, warning: "" };
}
