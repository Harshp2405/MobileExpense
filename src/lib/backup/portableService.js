import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { expoDb } from "../db/client";
import { saveExportFile } from "../utils/publicStorage";
import { TABLES, mergePortableTables, normalizeTables, parsePortableBackup } from "./portableData";

const storageKeys = {
  categories: "categories", accounts: "accounts", budgets: "budgets",
  expenses: "expenses", fuelLogs: "fuel_logs", income: "income", transfers: "transfers",
};
const sqlTable = (name) => name === "fuelLogs" ? "fuel_logs" : name;
const sqlColumn = (name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const isWebStorage = () => Platform.OS === "web" && !expoDb;

function readTables() {
  const tables = {};
  if (isWebStorage()) {
    for (const [table, key] of Object.entries(storageKeys)) {
      tables[table] = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(tables[table])) throw new Error(`Invalid local table: ${table}`);
    }
    tables.subcategories = [];
    const usedIds = new Set();
    let nextId = Math.ceil(Math.max(0, ...tables.categories.flatMap(
      (category) => (category.subcategories || []).map((sub) =>
        typeof sub === "object" && Number.isFinite(sub?.id) ? sub.id : 0),
    ))) + 1;
    for (const category of tables.categories) {
      for (const sub of category.subcategories || []) {
        const id = typeof sub === "object" && sub?.id > 0 && !usedIds.has(sub.id)
          ? sub.id : nextId++;
        usedIds.add(id);
        tables.subcategories.push({
          id, categoryId: category.id,
          name: typeof sub === "string" ? sub : sub.name,
          createdAt: typeof sub === "string" ? null : sub.createdAt,
        });
      }
    }
  } else {
    if (!expoDb) throw new Error("Database is not ready");
    for (const [table, fields] of Object.entries(TABLES)) {
      const columns = Object.keys(fields)
        .map((key) => `"${sqlColumn(key)}" AS "${key}"`).join(", ");
      tables[table] = expoDb.getAllSync(`SELECT ${columns} FROM "${sqlTable(table)}"`);
    }
  }
  return normalizeTables(tables);
}

export function collectPortableBackup() {
  let tables;
  if (isWebStorage()) tables = readTables();
  else {
    if (!expoDb) throw new Error("Database is not ready");
    expoDb.withTransactionSync(() => { tables = readTables(); });
  }
  return {
    format: "expense-tracker-portable", version: 2,
    exportedAt: new Date().toISOString(), imagesIncluded: false, tables,
  };
}

export async function exportPortableFile() {
  const backup = collectPortableBackup();
  const text = JSON.stringify(backup, null, 2);
  if (new Blob([text]).size > 20 * 1024 * 1024) {
    throw new Error("Database exceeds the 20 MiB portable backup limit");
  }
  const fileName = `Expense_Database_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    try { link.click(); }
    finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return `Download requested: ${fileName}`;
  }
  if (!FileSystem.cacheDirectory) throw new Error("Temporary storage is unavailable");
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(uri, text);
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const saved = await saveExportFile({ fileName, base64, mimeType: "application/json" });
    return `Saved ${saved.fileName} to ${saved.location}`;
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

export async function pickPortableBackup() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "application/octet-stream"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.size > 20 * 1024 * 1024) throw new Error("Choose a backup smaller than 20 MiB");
  let text;
  if (Platform.OS === "web") {
    if (asset.file) text = await asset.file.text();
    else {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error("Could not read the selected backup");
      text = await response.text();
    }
  } else {
    try { text = await FileSystem.readAsStringAsync(asset.uri); }
    finally { await FileSystem.deleteAsync(asset.uri, { idempotent: true }); }
  }
  return parsePortableBackup(text);
}

export function importPortableBackup(backup) {
  const imported = normalizeTables(backup.tables);
  let merged;
  if (isWebStorage()) {
    merged = mergePortableTables(readTables(), imported);
    const previous = {};
    const next = {};
    for (const [table, key] of Object.entries(storageKeys)) {
      previous[key] = localStorage.getItem(key);
      const rows = table === "categories"
        ? merged.tables.categories.map((row) => ({
          ...row,
          subcategories: merged.tables.subcategories.filter((sub) => sub.categoryId === row.id),
        }))
        : merged.tables[table];
      next[key] = JSON.stringify(rows);
    }
    // Reserve room for all values before touching live keys. Writes and rollback
    // are synchronous so other callbacks in this tab cannot see a partial merge.
    const journalKey = "portable_import_rollback";
    if (localStorage.getItem(journalKey)) {
      throw new Error("An interrupted import needs recovery. Reload the app.");
    }
    localStorage.setItem(journalKey, JSON.stringify(previous));
    try {
      for (const [key, value] of Object.entries(next)) localStorage.setItem(key, value);
      localStorage.removeItem(journalKey);
    } catch (error) {
      try {
        restoreWebJournal(previous);
        localStorage.removeItem(journalKey);
      } catch (rollbackError) {
        console.error("Database import rollback failed", rollbackError);
        throw new Error("Import failed and rollback could not finish. Do not edit data; reload to recover.");
      }
      throw error;
    }
  } else {
    if (!expoDb) throw new Error("Database is not ready");
    expoDb.withTransactionSync(() => {
      merged = mergePortableTables(readTables(), imported);
      for (const [table, rows] of Object.entries(merged.additions)) {
        const fields = Object.keys(TABLES[table]);
        const statement = `INSERT INTO "${sqlTable(table)}" (${fields.map((key) => `"${sqlColumn(key)}"`).join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`;
        for (const row of rows) expoDb.runSync(statement, fields.map((key) => row[key]));
      }
    });
  }
  return merged.counts;
}

function restoreWebJournal(previous) {
  // Remove new values first to free quota before restoring the original data.
  for (const key of Object.keys(storageKeys).map((table) => storageKeys[table])) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(previous)) {
    if (value !== null) localStorage.setItem(key, value);
  }
}

export function recoverPortableImport() {
  if (!isWebStorage()) return;
  const text = localStorage.getItem("portable_import_rollback");
  if (!text) return;
  const previous = JSON.parse(text);
  for (const key of Object.values(storageKeys)) {
    if (!(key in previous) || (previous[key] !== null && typeof previous[key] !== "string")) {
      throw new Error("Invalid database import recovery journal");
    }
  }
  restoreWebJournal(previous);
  localStorage.removeItem("portable_import_rollback");
}
