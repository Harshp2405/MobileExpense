// src/lib/backup/restoreService.js
import { db, expoDb } from "../db/client";
import {
  expenses,
  budgets,
  categories,
  subcategories,
  fuelLogs,
  income,
} from "../db/schema";
import { getValidAccessToken } from "./googleAuth";
import { downloadBackupFromDrive, listBackupsFromDrive } from "./googleDrive";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const LOCAL_SAFETY_SNAPSHOT_KEY = "pre_restore_safety_snapshot";

const tableNames = [
  "categories",
  "subcategories",
  "budgets",
  "expenses",
  "fuelLogs",
  "income",
];

const validateBackup = (backup) => {
  if (!backup || backup.version !== 1 || !backup.tables) {
    throw new Error("Unsupported or invalid backup format");
  }

  for (const tableName of tableNames) {
    if (backup.tables[tableName] !== undefined && !Array.isArray(backup.tables[tableName])) {
      throw new Error(`Invalid ${tableName} data in backup`);
    }
  }
};

export async function listAvailableBackups() {
  const token = await getValidAccessToken();
  if (!token) return [];
  return await listBackupsFromDrive(token);
}

export async function restoreFromBackup(fileId) {
  if (Platform.OS === "web" || !db || !expoDb) {
    throw new Error("Restore is available only in the native app");
  }

  const token = await getValidAccessToken();
  if (!token) throw new Error("NOT_AUTHENTICATED");

  const jsonString = await downloadBackupFromDrive(token, fileId);
  const backup = JSON.parse(jsonString);
  validateBackup(backup);

  const { tables } = backup;
  const localSafetySnapshot = await exportLocalDatabase();
  await AsyncStorage.setItem(
    LOCAL_SAFETY_SNAPSHOT_KEY,
    JSON.stringify(localSafetySnapshot),
  );

  await expoDb.execAsync("PRAGMA foreign_keys = ON");
  await db.transaction(async (tx) => {
    await tx.delete(subcategories);
    await tx.delete(expenses);
    await tx.delete(income);
    await tx.delete(fuelLogs);
    await tx.delete(budgets);
    await tx.delete(categories);

    if (tables.categories?.length) await tx.insert(categories).values(tables.categories);
    if (tables.subcategories?.length) await tx.insert(subcategories).values(tables.subcategories);
    if (tables.budgets?.length) await tx.insert(budgets).values(tables.budgets);
    if (tables.expenses?.length) await tx.insert(expenses).values(tables.expenses);
    if (tables.fuelLogs?.length) await tx.insert(fuelLogs).values(tables.fuelLogs);
    if (tables.income?.length) await tx.insert(income).values(tables.income);
  });

  return {
    restored: {
      expenses: tables.expenses?.length ?? 0,
      budgets: tables.budgets?.length ?? 0,
      categories: tables.categories?.length ?? 0,
      fuelLogs: tables.fuelLogs?.length ?? 0,
      income: tables.income?.length ?? 0,
    },
  };
}

async function exportLocalDatabase() {
  const [allExpenses, allBudgets, allCategories, allSubs, allFuel, allIncome] =
    await Promise.all([
      db.select().from(expenses),
      db.select().from(budgets),
      db.select().from(categories),
      db.select().from(subcategories),
      db.select().from(fuelLogs),
      db.select().from(income),
    ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      expenses: allExpenses,
      budgets: allBudgets,
      categories: allCategories,
      subcategories: allSubs,
      fuelLogs: allFuel,
      income: allIncome,
    },
  };
}
