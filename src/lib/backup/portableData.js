const common = { id: "id", createdAt: "text" };
const synced = { remoteId: "text", syncStatus: "text" };
export const TABLES = {
  categories: { ...common, name: "requiredText", color: "text" },
  accounts: { ...common, name: "requiredText", type: "requiredText", color: "text", initialBalance: "number" },
  subcategories: { ...common, categoryId: "id", name: "requiredText" },
  budgets: { ...common, ...synced, amount: "number", month: "month" },
  expenses: {
    ...common, ...synced, title: "requiredText", amount: "number", category: "text",
    accountId: "optionalId", subcategory: "text", date: "text", description: "text",
    month: "month", method: "text", imageUri: "text",
  },
  fuelLogs: {
    ...common, ...synced, startKm: "number", odometerKm: "optionalNumber",
    litres: "number", pricePerLitre: "number", totalCost: "number",
    date: "requiredText", month: "month", note: "text",
  },
  income: {
    ...common, ...synced, title: "requiredText", amount: "number",
    accountId: "optionalId", source: "text", date: "text", description: "text",
    month: "month", method: "text",
  },
  transfers: {
    ...common, fromAccountId: "id", toAccountId: "id", amount: "number",
    date: "text", month: "month", note: "text",
  },
};

export function normalizeTables(tables) {
  if (!tables || typeof tables !== "object") throw new Error("Missing database tables");
  const result = {};
  let count = 0;
  for (const [table, fields] of Object.entries(TABLES)) {
    if (!Array.isArray(tables[table])) throw new Error(`Missing or invalid table: ${table}`);
    count += tables[table].length;
    if (count > 100000) throw new Error("Backup exceeds 100,000 records");
    const ids = new Set();
    result[table] = tables[table].map((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`Invalid ${table} row ${index + 1}`);
      }
      const clean = {};
      for (const [key, type] of Object.entries(fields)) {
        const value = row[key] ?? null;
        const optional = ["text", "optionalId", "optionalNumber"].includes(type);
        const numeric = ["id", "optionalId", "number", "optionalNumber"].includes(type);
        const valid = value === null ? optional
          : numeric ? typeof value === "number" && Number.isFinite(value) &&
            (!type.toLowerCase().includes("id") || value > 0)
          : typeof value === "string" && value.length <= 100000 &&
            (type !== "requiredText" || value.trim().length > 0) &&
            (type !== "month" || /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
        if (!valid) throw new Error(`Invalid ${table} row ${index + 1}: ${key}`);
        clean[key] = value;
      }
      if (ids.has(clean.id)) throw new Error(`Duplicate ID in ${table}: ${clean.id}`);
      ids.add(clean.id);
      return clean;
    });
  }
  const accounts = new Set(result.accounts.map((row) => row.id));
  const categories = new Set(result.categories.map((row) => row.id));
  for (const row of result.subcategories) {
    if (!categories.has(row.categoryId)) throw new Error("Subcategory references a missing category");
  }
  for (const row of [...result.expenses, ...result.income]) {
    if (row.accountId !== null && !accounts.has(row.accountId)) {
      throw new Error("Transaction references a missing account");
    }
  }
  for (const row of result.transfers) {
    if (!accounts.has(row.fromAccountId) || !accounts.has(row.toAccountId) ||
        row.fromAccountId === row.toAccountId) {
      throw new Error("Transfer has missing or identical accounts");
    }
  }
  return result;
}

export function parsePortableBackup(text) {
  if (typeof text !== "string" || text.length > 20 * 1024 * 1024) {
    throw new Error("Backup must be a JSON file smaller than 20 MiB");
  }
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON");
  }
  if (backup?.format !== "expense-tracker-portable" || backup.version !== 2) {
    throw new Error("Choose a version 2 portable database export from this app");
  }
  return { ...backup, tables: normalizeTables(backup.tables) };
}

const nameKey = (name) => name.trim().toLowerCase();
const signature = (row) => JSON.stringify(
  Object.entries(row).filter(([key]) => !["id", "remoteId", "syncStatus"].includes(key)),
);

export function mergePortableTables(currentTables, importedTables) {
  const current = normalizeTables(currentTables);
  const incoming = normalizeTables(importedTables);
  const tables = {};
  const additions = {};
  const counts = {};
  const mappings = {};
  const categoryNames = new Map();
  const subcategoryNames = new Map();
  const originalCategoryNames = new Map(incoming.categories.map((row) => [row.id, row.name]));
  for (const table of Object.keys(TABLES)) {
    const rows = current[table].map((row) => ({ ...row }));
    tables[table] = rows;
    additions[table] = [];
    counts[table] = { added: 0, skipped: 0 };
    const map = new Map();
    mappings[table] = map;
    let nextId = Math.ceil(Math.max(0, ...rows.map((row) => row.id))) + 1;
    if (!Number.isSafeInteger(nextId)) throw new Error(`IDs exceed safe range in ${table}`);
    const naturalKey = (row) => {
      if (table === "categories" || table === "accounts") return nameKey(row.name);
      if (table === "subcategories") return `${row.categoryId}:${nameKey(row.name)}`;
      if (table === "budgets") return row.month;
      return null;
    };
    const natural = new Map(rows.map((row) => [naturalKey(row), row]));
    const remotes = new Map(rows.filter((row) => row.remoteId).map((row) => [row.remoteId, row]));
    const signatures = new Map();
    // Consume matching existing rows once, preserving legitimate identical entries.
    for (const row of rows) {
      const key = signature(row);
      if (!signatures.has(key)) signatures.set(key, []);
      signatures.get(key).push(row);
    }
    const consumed = new Set();
    for (const original of incoming[table]) {
      const row = { ...original };
      if (table === "subcategories") row.categoryId = mappings.categories.get(row.categoryId);
      if ("accountId" in row && row.accountId !== null) row.accountId = mappings.accounts.get(row.accountId);
      if (table === "transfers") {
        row.fromAccountId = mappings.accounts.get(row.fromAccountId);
        row.toAccountId = mappings.accounts.get(row.toAccountId);
      }
      if (table === "expenses" && row.category) {
        if (row.subcategory) {
          row.subcategory = subcategoryNames.get(`${nameKey(row.category)}:${nameKey(row.subcategory)}`) || row.subcategory;
        }
        row.category = categoryNames.get(nameKey(row.category)) || row.category;
      }
      const key = naturalKey(row);
      const match = key !== null ? natural.get(key)
        : (row.remoteId && remotes.get(row.remoteId)) ||
          signatures.get(signature(row))?.find((item) => !consumed.has(item.id));
      if (match) {
        map.set(original.id, match.id);
        consumed.add(match.id);
        counts[table].skipped++;
        if (table === "categories") categoryNames.set(nameKey(original.name), match.name);
        if (table === "subcategories") {
          subcategoryNames.set(`${nameKey(originalCategoryNames.get(original.categoryId))}:${nameKey(original.name)}`, match.name);
        }
        continue;
      }
      const added = { ...row, id: nextId++ };
      if ("syncStatus" in added) added.syncStatus = "pending";
      rows.push(added);
      additions[table].push(added);
      counts[table].added++;
      map.set(original.id, added.id);
      if (key !== null) natural.set(key, added);
      if (added.remoteId) remotes.set(added.remoteId, added);
      if (table === "categories") categoryNames.set(nameKey(original.name), added.name);
      if (table === "subcategories") {
        subcategoryNames.set(`${nameKey(originalCategoryNames.get(original.categoryId))}:${nameKey(original.name)}`, added.name);
      }
    }
  }
  normalizeTables(tables);
  return { tables, additions, counts };
}
