// src/lib/backup/backupService.js
import { db } from '../db/client';
import { expenses, budgets, categories, subcategories, fuelLogs, income } from '../db/schema';
import { getValidAccessToken } from './googleAuth';
import { uploadBackupToDrive, pruneOldBackups } from './googleDrive';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_BACKUP_TS_KEY   = 'last_backup_timestamp';
const LAST_BACKUP_NAME_KEY = 'last_backup_filename';

export async function exportDatabaseToJSON() {
  if (!db) throw new Error('Database not ready');
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

export async function performBackup() {
  const token = await getValidAccessToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const data = await exportDatabaseToJSON();
  const jsonString = JSON.stringify(data, null, 2);

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `expense_backup_${dateStr}.json`;

  const uploaded = await uploadBackupToDrive(token, jsonString, fileName);
  await pruneOldBackups(token, 10);

  await AsyncStorage.setItem(LAST_BACKUP_TS_KEY,   now.toISOString());
  await AsyncStorage.setItem(LAST_BACKUP_NAME_KEY, fileName);

  return { fileName, fileId: uploaded.id };
}

export async function getLastBackupInfo() {
  const timestamp = await AsyncStorage.getItem(LAST_BACKUP_TS_KEY);
  const fileName  = await AsyncStorage.getItem(LAST_BACKUP_NAME_KEY);
  return { timestamp, fileName };
}
