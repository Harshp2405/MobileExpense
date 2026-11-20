import { db, expoDb } from "./client";
import {
  expenses,
  budgets,
  categories,
  fuelLogs,
  subcategories,
  income,
  accounts,
  transfers,
} from "./schema";
import { eq, desc, sum, asc , and  , count } from "drizzle-orm";
import { Platform } from "react-native";
import { deleteLocalImage } from "../utils/imageManager";
import { expoSqliteDriver, migrateDatabase } from "./syncMigrations";
import { removeWithCascade } from "../sync/syncEngine";
import {
  getLocalSyncStore,
  markDatabaseReady,
  notifyLocalChange,
} from "../sync/localStore";

// Every successful local write nudges auto-sync (rows are "pending" until the server accepts them).
const changed = (value) => {
  notifyLocalChange();
  return value;
};

// Deletes via the sync store so synced rows and cascaded children are queued for server deletion.
const deleteWithSync = (entity, id) => {
  const store = getLocalSyncStore();
  if (!store) return { success: false };
  const removed = store.transaction(() => {
    const row = store.rows(entity).find((r) => r.id === id);
    if (row) removeWithCascade(store, entity, row, { queue: true });
    return row || null;
  });
  return changed({ success: true, removed });
};

/** ==============================
 *  EXPENSE BUSINESS LOGIC
 *  ============================= */

// Get expenses by month
export const getExpensesByMonth = async (month, accountId = null) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("expenses") || "[]");
      return list
        .filter(
          (e) => e.month === month && (!accountId || e.accountId === accountId),
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return [];
  }
  const conditions = accountId
    ? and(eq(expenses.month, month), eq(expenses.accountId, accountId))
    : eq(expenses.month, month);

  return await db
    .select()
    .from(expenses)
    .where(conditions)
    .orderBy(desc(expenses.createdAt));
};


// Add expense
export const addExpense = async ({
  title,
  amount,
  category,
  subcategory, // NEW — optional
  date,
  description,
  month,
  method,
  imageUri,
  accountId, // NEW
}) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("expenses") || "[]");
      const newExpense = {
        id: Date.now(),
        title,
        amount: Number(amount),
        category: category || "General",
        subcategory: subcategory || null,
        date: date || new Date().toISOString().split("T")[0],
        description: description || "",
        month,
        method,
        imageUri: imageUri || null,
        accountId: accountId || null,
        createdAt: new Date().toISOString(),
      };
      list.push(newExpense);
      localStorage.setItem("expenses", JSON.stringify(list));
      return changed(newExpense);
    }
    throw new Error("Database not initialized");
  }
  const result = await db
    .insert(expenses)
    .values({
      title,
      amount,
      category,
      subcategory: subcategory || null,
      date,
      description,
      month,
      method,
      imageUri: imageUri || null,
      accountId: accountId || null, // NEW
    })
    .returning();
  return changed(result[0]);
};

// Monthly history (AGGREGATION)
export const getExpenseHistory = async () => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("expenses") || "[]");
      const groups = {};
      list.forEach((e) => {
        groups[e.month] = (groups[e.month] || 0) + Number(e.amount);
      });
      return Object.entries(groups)
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));
    }
    return [];
  }
  const history = await db
    .select({
      month: expenses.month,
      total: sum(expenses.amount).mapWith(Number),
    })
    .from(expenses)
    .groupBy(expenses.month)
    .orderBy(asc(expenses.month));

  return history;
};

// DELETE expense
export const deleteExpense = async (id) => {
  try {
    const result = deleteWithSync("expenses", id);
    if (result.removed?.imageUri) {
      await deleteLocalImage(result.removed.imageUri);
    }
    return { success: result.success };
  } catch {
    throw new Error("Failed to delete expense");
  }
};

/** ==============================
 *  CATEGORIES BUSINESS LOGIC
 *  ============================== */

export const getCategories = async () => {
  if (!db) {
    if (Platform.OS === "web") {
      return JSON.parse(localStorage.getItem("categories") || "[]");
    }
    return [];
  }
  return await db.select().from(categories);
};

export const addCategory = async ({ name, color }) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("categories") || "[]");
      const newCategory = {
        id: Date.now(),
        name,
        color,
        createdAt: new Date().toISOString(),
      };
      list.push(newCategory);
      localStorage.setItem("categories", JSON.stringify(list));
      return changed(newCategory);
    }
    throw new Error("Database not initialized");
  }
  const result = await db
    .insert(categories)
    .values({ name, color })
    .returning();
  return changed(result[0]);
};

// Moves the category's expenses to "General" (clearing subcategory) and deletes its subcategories.
export const deleteCategory = async (id) => {
  const result = deleteWithSync("categories", id);
  if (!result.success) throw new Error("Database not initialized");
  return { success: true };
};

/** ==============================
 *  SUBCATEGORIES BUSINESS LOGIC
 *  ============================== */

// Get subcategories for a given category id
export const getSubcategories = async (categoryId) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("categories") || "[]");
      const cat = list.find((c) => c.id === categoryId);
      return cat?.subcategories || [];
    }
    return [];
  }
  return await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, categoryId));
};

// Add subcategory under a category
export const addSubcategory = async ({ categoryId, name }) => {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Subcategory name is required");

  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("categories") || "[]");
      const idx = list.findIndex((c) => c.id === categoryId);
      if (idx === -1) throw new Error("Category not found");
      list[idx].subcategories = list[idx].subcategories || [];
      const exists = list[idx].subcategories.some(
        (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (exists) throw new Error("Subcategory already exists");
      const newSub = {
        id: Date.now(),
        categoryId,
        name: trimmed,
        createdAt: new Date().toISOString(),
      };
      list[idx].subcategories.push(newSub);
      localStorage.setItem("categories", JSON.stringify(list));
      return changed(newSub);
    }
    throw new Error("Database not initialized");
  }

  // Case-insensitive duplicate check within the same category
  const existing = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, categoryId));
  if (existing.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("Subcategory already exists");
  }

  const result = await db
    .insert(subcategories)
    .values({ categoryId, name: trimmed })
    .returning();
  return changed(result[0]);
};

// Rename a subcategory (also updates the parent category's expenses that use the old name)
export const updateSubcategory = async (id, { name }) => {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Subcategory name is required");

  const store = getLocalSyncStore();
  if (!store) throw new Error("Database not initialized");
  store.transaction(() => {
    const sub = store.rows("subcategories").find((s) => s.id === id);
    if (!sub) throw new Error("Subcategory not found");
    const parent = store.rows("categories").find((c) => c.id === sub.categoryId);
    store.update("subcategories", id, { name: trimmed, syncStatus: "pending" });
    for (const e of store.rows("expenses")) {
      if (parent && e.category === parent.name && e.subcategory === sub.name) {
        store.update("expenses", e.id, { subcategory: trimmed, syncStatus: "pending" });
      }
    }
  });
  return changed({ success: true });
};

// Delete a subcategory — clears it from the parent category's expenses
export const deleteSubcategory = async (id) => {
  const result = deleteWithSync("subcategories", id);
  if (!result.success) throw new Error("Database not initialized");
  return { success: true };
};

/** ==============================
 *  BUDGET BUSINESS LOGIC
 *  ============================== */

// Get budget for a month
export const getBudgetByMonth = async (month) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("budgets") || "[]");
      return list.find((b) => b.month === month) || null;
    }
    return null;
  }
  const result = await db
    .select()
    .from(budgets)
    .where(eq(budgets.month, month))
    .limit(1);

  return result[0] || null;
};

// Save / update budget (UPSERT) — one budget per month
export const saveBudget = async ({ month, amount }) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("budgets") || "[]");
      const idx = list.findIndex((b) => b.month === month);
      // Keep id/remoteId so the server copy is updated rather than duplicated.
      const newBudget = {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        ...(idx > -1 ? list[idx] : {}),
        month,
        amount: Number(amount),
        syncStatus: "pending",
      };
      if (idx > -1) {
        list[idx] = newBudget;
      } else {
        list.push(newBudget);
      }
      localStorage.setItem("budgets", JSON.stringify(list));
      return changed(newBudget);
    }
    throw new Error("Database not initialized");
  }
  const result = await db
    .insert(budgets)
    .values({ month, amount })
    .onConflictDoUpdate({
      target: budgets.month,
      set: { amount, syncStatus: "pending" },
    })
    .returning();

  return changed(result[0]);
};

/** ==============================
 *  DATABASE INIT
 *  ============================== */

export const initDatabase = async () => {
  // Web Seeding Fallback
  if (!db) {
    if (Platform.OS === "web") {
      const existing = localStorage.getItem("categories");
      if (!existing || JSON.parse(existing).length === 0) {
        const defaultCats = [
          {
            id: 1,
            name: "Food",
            color: "#EF4444",
            subcategories: [],
            createdAt: new Date().toISOString(),
          },
          {
            id: 2,
            name: "Groceries",
            color: "#10B981",
            subcategories: [],
            createdAt: new Date().toISOString(),
          },
          {
            id: 3,
            name: "Transport",
            color: "#3B82F6",
            subcategories: ["Bike" , "Bus"],
            createdAt: new Date().toISOString(),
          },
          {
            id: 4,
            name: "Shopping",
            color: "#F59E0B",
            subcategories: [],
            createdAt: new Date().toISOString(),
          },
          {
            id: 5,
            name: "Entertainment",
            color: "#8B5CF6",
            subcategories: [],
            createdAt: new Date().toISOString(),
          },
          {
            id: 6,
            name: "Bills",
            color: "#14B8A6",
            subcategories: ["Rent" , "SIP"],
            createdAt: new Date().toISOString(),
          },
        ];
        localStorage.setItem("categories", JSON.stringify(defaultCats));
      }
      // Converts legacy string subcategories into objects with stable ids.
      getLocalSyncStore()?.rows("subcategories");
      markDatabaseReady();
    }
    return;
  }

  try {
    // Creates/upgrades all eight tables plus sync bookkeeping in one transaction.
    migrateDatabase(expoSqliteDriver(expoDb));

    // Seed a default "Cash" account so existing users always have one to pick
    const accountCheck = await db.select().from(accounts).limit(1);
    if (accountCheck.length === 0) {
      await db
        .insert(accounts)
        .values({ name: "Cash", type: "Cash", initialBalance: 0 });
    }

    // Seed SQLite categories if empty
    const catCheck = await db.select().from(categories).limit(1);
    if (catCheck.length === 0) {
      const defaultCats = [
        { name: "Food", color: "#EF4444" },
        { name: "Groceries", color: "#10B981" },
        { name: "Transport", color: "#3B82F6" },
        { name: "Shopping", color: "#F59E0B" },
        { name: "Entertainment", color: "#8B5CF6" },
        { name: "Bills", color: "#14B8A6" },
      ];
      for (const cat of defaultCats) {
        await db.insert(categories).values(cat);
      }
    }

    console.log("Database initialized successfully with default categories");
  } catch (error) {
    console.error("Failed to initialize database", error);
    throw error;
  }
  markDatabaseReady();
};

export const getFuelLogs = async () => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("fuel_logs") || "[]");
      // Pending (no end reading) first, then by date descending
      return list.sort((a, b) => {
        const aPending = a.odometerKm == null ? 0 : 1;
        const bPending = b.odometerKm == null ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return (b.odometerKm || b.startKm) - (a.odometerKm || a.startKm);
      });
    }
    return [];
  }
  return await db
    .select()
    .from(fuelLogs)
    .orderBy(fuelLogs.odometerKm, desc(fuelLogs.id));
};

export const addFuelLog = async ({
  odometerKm, // can be null now
  startKm,
  litres,
  pricePerLitre,
  date,
  month,
  note,
}) => {
  const totalCost = litres * pricePerLitre;
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("fuel_logs") || "[]");
      const newLog = {
        id: Date.now(),
        startKm,
        odometerKm: odometerKm || null,
        litres,
        pricePerLitre,
        totalCost,
        date,
        month,
        note: note || "",
        createdAt: new Date().toISOString(),
      };
      list.push(newLog);
      localStorage.setItem("fuel_logs", JSON.stringify(list));
      return changed(newLog);
    }
    throw new Error("Database not initialized");
  }
  const result = await db
    .insert(fuelLogs)
    .values({
      startKm,
      odometerKm: odometerKm || null,
      litres,
      pricePerLitre,
      totalCost,
      date,
      month,
      note,
    })
    .returning();
  return changed(result[0]);
};

export const updateFuelLogEndReading = async (id, endKm) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("fuel_logs") || "[]");
      const log = list.find((f) => f.id === id);
      if (log) Object.assign(log, { odometerKm: endKm, syncStatus: "pending" });
      localStorage.setItem("fuel_logs", JSON.stringify(list));
      return changed({ success: true });
    }
    return { success: false };
  }
  await db
    .update(fuelLogs)
    .set({ odometerKm: endKm, syncStatus: "pending" })
    .where(eq(fuelLogs.id, id));
  return changed({ success: true });
};

export const deleteFuelLog = async (id) => {
  const { success } = deleteWithSync("fuelLogs", id);
  return { success };
};

// Uses startKm from each log — no need to compare consecutive entries
export const calculateFuelAverage = (logs) => {
  if (logs.length < 1) return null;
  let totalKm = 0,
    totalLitres = 0,
    totalCost = 0;
  for (const log of logs) {
    const driven =
      log.startKm && log.odometerKm ? log.odometerKm - log.startKm : 0;
    if (driven > 0) {
      totalKm += driven;
      totalLitres += log.litres;
      totalCost += log.totalCost;
    }
  }
  if (totalLitres === 0 || totalKm === 0) return null;
  return {
    averageKmPerLitre: totalKm / totalLitres,
    totalKm,
    totalLitres,
    totalCost,
    costPerKm: totalCost / totalKm,
  };
};

/** ==============================
 *  ANALYTICS DATA ACCESS
 *  ============================== */

// All expenses, newest first. Used as the single source for every analytics view.
export const getAllExpenses = async () => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("expenses") || "[]");
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return [];
  }
  return await db.select().from(expenses).orderBy(desc(expenses.createdAt));
};

// All income entries, newest first.
export const getAllIncome = async () => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("income") || "[]");
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return [];
  }
  return await db.select().from(income).orderBy(desc(income.createdAt));
};

// Add an income entry (mirrors addExpense)
export const addIncome = async ({
  title,
  amount,
  source,
  date,
  description,
  month,
  method,
  accountId,
}) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("income") || "[]");
      const newIncome = {
        id: Date.now(),
        title,
        amount: Number(amount),
        source: source || "Other",
        date: date || new Date().toISOString().split("T")[0],
        description: description || "",
        month,
        method: method || "Cash",
        createdAt: new Date().toISOString(),
        accountId: accountId || null, // NEW
      };
      list.push(newIncome);
      localStorage.setItem("income", JSON.stringify(list));
      return changed(newIncome);
    }
    throw new Error("Database not initialized");
  }
  const result = await db
    .insert(income)
    .values({
      title,
      amount,
      source,
      date,
      description,
      month,
      method,
      accountId: accountId || null,
    })
    .returning();
  return changed(result[0]);
};

export const updateIncome = async (
  id,
  { title, amount, source, date, description, month, method, accountId },
) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("income") || "[]");
      const index = list.findIndex((item) => item.id === id);
      if (index === -1) throw new Error("Income not found");
      list[index] = {
        ...list[index],
        title,
        amount: Number(amount),
        source: source || "Other",
        date: date || list[index].date,
        description: description || "",
        month: month || list[index].month,
        method: method || "Cash",
        accountId: accountId || null,
        syncStatus: "pending",
      };
      localStorage.setItem("income", JSON.stringify(list));
      return changed(list[index]);
    }
    throw new Error("Database not initialized");
  }

  try {
    const result = await db
      .update(income)
      .set({
        title,
        amount: Number(amount),
        source: source || "Other",
        date,
        ...(month ? { month } : {}),
        description: description || "",
        method: method || "Cash",
        accountId: accountId || null,
        syncStatus: "pending",
      })
      .where(eq(income.id, id))
      .returning();

    if (result.length === 0) throw new Error("Income not found");
    return changed(result[0]);
  } catch (error) {
    console.error("[queries.updateIncome] Failed:", error);
    throw new Error("Failed to update income");
  }
};

export const deleteIncome = async (id) => {
  const { success } = deleteWithSync("income", id);
  return { success };
};

// Distinct years present in the data — powers the year selector without hardcoding.
export const getAvailableYears = async () => {
  const [exp, inc] = await Promise.all([getAllExpenses(), getAllIncome()]);
  const years = new Set();
  [...exp, ...inc].forEach((t) => {
    if (t.month) years.add(t.month.split("-")[0]);
  });
  const list = Array.from(years).sort((a, b) => Number(b) - Number(a));
  return list.length > 0 ? list : [String(new Date().getFullYear())];
};

export const getFuelLogsByMonth = async (month) => {
  if (!month) return [];

  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("fuel_logs") || "[]");

      return list
        .filter((log) => log.month === month)
        .sort((first, second) =>
          String(second.date || "").localeCompare(String(first.date || "")),
        );
    }

    return [];
  }

  return await db
    .select()
    .from(fuelLogs)
    .where(eq(fuelLogs.month, month))
    .orderBy(desc(fuelLogs.id));
};

/** ACCOUNTS **/

export const getAccounts = async () => {
  if (!db) {
    if (Platform.OS === "web") {
      return JSON.parse(localStorage.getItem("accounts") || "[]");
    }
    return [];
  }
  return await db.select().from(accounts).orderBy(asc(accounts.name));
};

export const addAccount = async ({ name, type, color, initialBalance }) => {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Account name is required");

  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("accounts") || "[]");
      if (list.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error("Account already exists");
      }
      const newAccount = {
        id: Date.now(),
        name: trimmed,
        type: type || "Cash",
        color: color || "#2563EB",
        initialBalance: Number(initialBalance) || 0,
        createdAt: new Date().toISOString(),
      };
      list.push(newAccount);
      localStorage.setItem("accounts", JSON.stringify(list));
      return changed(newAccount);
    }
    throw new Error("Database not initialized");
  }

  const result = await db
    .insert(accounts)
    .values({
      name: trimmed,
      type: type || "Cash",
      color: color || "#2563EB",
      initialBalance: Number(initialBalance) || 0,
    })
    .returning();
  return changed(result[0]);
};
// Unassigns the account's expenses/income and deletes its transfers.
export const deleteAccount = async (id) => {
  const { success } = deleteWithSync("accounts", id);
  return { success };
};

/** BALANCES **/

// Combined balance + per-account balance in one pass:
// balance = initialBalance + income - expenses + transfersIn - transfersOut
export const getAccountsWithBalances = async () => {
  const [allAccounts, allExpenses, allIncome, allTransfers] = await Promise.all(
    [getAccounts(), getAllExpenses(), getAllIncome(), getAllTransfers()],
  );

  return allAccounts.map((account) => {
    const spent = allExpenses
      .filter((e) => e.accountId === account.id)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const earned = allIncome
      .filter((i) => i.accountId === account.id)
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);

    const transferredIn = allTransfers
      .filter((t) => t.toAccountId === account.id)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const transferredOut = allTransfers
      .filter((t) => t.fromAccountId === account.id)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const balance =
      Number(account.initialBalance || 0) +
      earned -
      spent +
      transferredIn -
      transferredOut;

    return { ...account, spent, earned, balance };
  });
};

export const getCombinedBalance = async () => {
  const withBalances = await getAccountsWithBalances();
  return withBalances.reduce((sum, a) => sum + a.balance, 0);
};

/** TRANSFERS **/

export const getAllTransfers = async () => {
  if (!db) {
    if (Platform.OS === "web") {
      return JSON.parse(localStorage.getItem("transfers") || "[]");
    }
    return [];
  }
  return await db.select().from(transfers).orderBy(desc(transfers.id));
};

export const addTransfer = async ({
  fromAccountId,
  toAccountId,
  amount,
  date,
  month,
  note,
}) => {
  if (fromAccountId === toAccountId) {
    throw new Error("Source and destination accounts must be different");
  }
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    throw new Error("Transfer amount must be greater than zero");
  }

  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("transfers") || "[]");
      const newTransfer = {
        id: Date.now(),
        fromAccountId,
        toAccountId,
        amount: numericAmount,
        date,
        month,
        note: note || "",
        createdAt: new Date().toISOString(),
      };
      list.push(newTransfer);
      localStorage.setItem("transfers", JSON.stringify(list));
      return changed(newTransfer);
    }
    throw new Error("Database not initialized");
  }

  const result = await db
    .insert(transfers)
    .values({
      fromAccountId,
      toAccountId,
      amount: numericAmount,
      date,
      month,
      note,
    })
    .returning();
  return changed(result[0]);
};

/**
 * Updates an existing expense by ID.
 * Only updates fields that are explicitly provided — does NOT null out omitted fields.
 * Mirrors the addExpense signature for consistency.
 *
 * @param {number} id — The expense ID to update
 * @param {Object} fields — The fields to update (same shape as addExpense input)
 * @returns {Object} The updated expense row
 * @throws {Error} If the DB is unavailable or the update fails
 */
export const updateExpense = async (id, {
  title,
  amount,
  category,
  subcategory,
  date,
  description,
  month,
  method,
  imageUri,
  accountId,
}) => {
  // ── Web fallback (localStorage) ──
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("expenses") || "[]");
      const idx = list.findIndex((e) => e.id === id);
      if (idx === -1) throw new Error("Expense not found");
      list[idx] = {
        ...list[idx],
        title,
        amount: Number(amount),
        category: category || "General",
        subcategory: subcategory || null,
        date: date || list[idx].date,
        month: month || list[idx].month,
        description: description || "",
        method,
        imageUri: imageUri || null,
        accountId: accountId || null,
        syncStatus: "pending",
      };
      localStorage.setItem("expenses", JSON.stringify(list));
      return changed(list[idx]);
    }
    throw new Error("Database not initialized");
  }

  // ── SQLite via Drizzle ──
  try {
    const result = await db
      .update(expenses)
      .set({
        title,
        amount,
        category,
        subcategory: subcategory || null,
        date,
        ...(month ? { month } : {}),
        description,
        method,
        imageUri: imageUri || null,
        accountId: accountId || null,
        syncStatus: "pending", // mark dirty for next sync cycle
      })
      .where(eq(expenses.id, id))
      .returning();

    if (!result || result.length === 0) {
      throw new Error("Expense not found");
    }
    return changed(result[0]);
  } catch (err) {
    console.error("[queries.updateExpense] Failed:", err);
    throw new Error("Failed to update expense");
  }
};
