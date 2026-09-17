import { db } from "./client";
import {
  expenses,
  budgets,
  categories,
  fuelLogs,
  subcategories,
  income,
} from "./schema";
import { eq, desc, sum, asc, sql } from "drizzle-orm";
import { Platform } from "react-native";
import { deleteLocalImage } from "../utils/imageManager";

/** ==============================
 *  EXPENSE BUSINESS LOGIC
 *  ============================= */

// Get expenses by month
export const getExpensesByMonth = async (month) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("expenses") || "[]");
      return list
        .filter((e) => e.month === month)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return [];
  }
  return await db
    .select()
    .from(expenses)
    .where(eq(expenses.month, month))
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
        createdAt: new Date().toISOString(),
      };
      list.push(newExpense);
      localStorage.setItem("expenses", JSON.stringify(list));
      return newExpense;
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
    })
    .returning();
  return result[0];
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
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("expenses") || "[]");
      const deleted = list.find((e) => e.id === id);
      if (deleted?.imageUri) {
        deleteLocalImage(deleted.imageUri);
      }
      const nextList = list.filter((e) => e.id !== id);
      localStorage.setItem("expenses", JSON.stringify(nextList));
      return { success: true };
    }
    return { success: false };
  }
  try {
    const existing = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id));

    if (existing[0]?.imageUri) {
      await deleteLocalImage(existing[0].imageUri);
    }

    await db.delete(expenses).where(eq(expenses.id, id));
    return { success: true };
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
      return newCategory;
    }
    throw new Error("Database not initialized");
  }
  const result = await db
    .insert(categories)
    .values({ name, color })
    .returning();
  return result[0];
};

export const deleteCategory = async (id, name) => {
  if (!db) {
    if (Platform.OS === "web") {
      // 1. Update any expenses belonging to this category to "General" (and clear subcategory)
      let expensesList = JSON.parse(localStorage.getItem("expenses") || "[]");
      expensesList = expensesList.map((e) =>
        e.category === name
          ? { ...e, category: "General", subcategory: null }
          : e,
      );
      localStorage.setItem("expenses", JSON.stringify(expensesList));

      // 2. Delete the category itself (subcategories array is removed along with it)
      let categoriesList = JSON.parse(
        localStorage.getItem("categories") || "[]",
      );
      categoriesList = categoriesList.filter((c) => c.id !== id);
      localStorage.setItem("categories", JSON.stringify(categoriesList));

      return { success: true };
    }
    throw new Error("Database not initialized");
  }
  // 1. Update any expenses belonging to this category to "General" (and clear subcategory)
  await db
    .update(expenses)
    .set({ category: "General", subcategory: null })
    .where(eq(expenses.category, name));

  // 2. Delete the category itself — subcategories cascade-delete via FK
  await db.delete(categories).where(eq(categories.id, id));

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
      return newSub;
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
  return result[0];
};

// Rename a subcategory (also updates matching expenses' subcategory string)
export const updateSubcategory = async (id, { name }) => {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Subcategory name is required");

  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("categories") || "[]");
      let oldName = null;
      for (const cat of list) {
        const sub = (cat.subcategories || []).find((s) => s.id === id);
        if (sub) {
          oldName = sub.name;
          sub.name = trimmed;
          break;
        }
      }
      localStorage.setItem("categories", JSON.stringify(list));

      if (oldName) {
        const expensesList = JSON.parse(
          localStorage.getItem("expenses") || "[]",
        );
        const updated = expensesList.map((e) =>
          e.subcategory === oldName ? { ...e, subcategory: trimmed } : e,
        );
        localStorage.setItem("expenses", JSON.stringify(updated));
      }
      return { success: true };
    }
    throw new Error("Database not initialized");
  }

  const [existingSub] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, id))
    .limit(1);
  if (!existingSub) throw new Error("Subcategory not found");

  await db
    .update(subcategories)
    .set({ name: trimmed })
    .where(eq(subcategories.id, id));

  // Keep denormalized expense.subcategory strings in sync
  await db
    .update(expenses)
    .set({ subcategory: trimmed })
    .where(eq(expenses.subcategory, existingSub.name));

  return { success: true };
};

// Delete a subcategory — reassign matching expenses' subcategory to NULL
export const deleteSubcategory = async (id) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("categories") || "[]");
      let removedName = null;
      for (const cat of list) {
        const idx = (cat.subcategories || []).findIndex((s) => s.id === id);
        if (idx > -1) {
          removedName = cat.subcategories[idx].name;
          cat.subcategories.splice(idx, 1);
          break;
        }
      }
      localStorage.setItem("categories", JSON.stringify(list));

      if (removedName) {
        const expensesList = JSON.parse(
          localStorage.getItem("expenses") || "[]",
        );
        const updated = expensesList.map((e) =>
          e.subcategory === removedName ? { ...e, subcategory: null } : e,
        );
        localStorage.setItem("expenses", JSON.stringify(updated));
      }
      return { success: true };
    }
    throw new Error("Database not initialized");
  }

  const [existingSub] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, id))
    .limit(1);
  if (!existingSub) return { success: true };

  await db
    .update(expenses)
    .set({ subcategory: null })
    .where(eq(expenses.subcategory, existingSub.name));

  await db.delete(subcategories).where(eq(subcategories.id, id));

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
      const newBudget = {
        id: Date.now(),
        month,
        amount: Number(amount),
        createdAt: new Date().toISOString(),
      };
      if (idx > -1) {
        list[idx] = newBudget;
      } else {
        list.push(newBudget);
      }
      localStorage.setItem("budgets", JSON.stringify(list));
      return newBudget;
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

  return result[0];
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
            subcategories: [],
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
            subcategories: [],
            createdAt: new Date().toISOString(),
          },
        ];
        localStorage.setItem("categories", JSON.stringify(defaultCats));
      }
    }
    return;
  }

  try {
    // Create Tables
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category_id, name)
      );
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_id TEXT,
        amount REAL NOT NULL,
        month TEXT NOT NULL UNIQUE,
        sync_status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_id TEXT,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT,
        subcategory TEXT,
        date TEXT,
        description TEXT,
        month TEXT NOT NULL,
        method TEXT,
        image_uri TEXT,
        sync_status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS fuel_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_id TEXT,
        start_km REAL NOT NULL,
        odometer_km REAL,
        litres REAL NOT NULL,
        price_per_litre REAL NOT NULL,
        total_cost REAL NOT NULL,
        date TEXT NOT NULL,
        month TEXT NOT NULL,
        note TEXT,
        sync_status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS income (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_id TEXT,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        source TEXT,
        date TEXT,
        description TEXT,
        month TEXT NOT NULL,
        method TEXT,
        sync_status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // NEW: migrate `expenses` — add nullable `subcategory` column if missing
    try {
      const expenseCols = await db.run(sql`PRAGMA table_info(expenses)`);
      const cols = expenseCols.rows || [];
      const hasSubcategory = cols.some((r) => r.name === "subcategory");
      if (!hasSubcategory) {
        await db.run(sql`ALTER TABLE expenses ADD COLUMN subcategory TEXT`);
        console.log("Migrated expenses: added nullable subcategory column");
      }
      // NEW: migrate `image_uri` column if missing (was omitted from the original CREATE TABLE)
      const hasImageUri = cols.some((r) => r.name === "image_uri");
      if (!hasImageUri) {
        await db.run(sql`ALTER TABLE expenses ADD COLUMN image_uri TEXT`);
        console.log("Migrated expenses: added nullable image_uri column");
      }
    } catch (migErr) {
      console.warn("Expense migration check skipped", migErr);
    }

    // Migration: add remote_id + sync_status columns if missing
    try {
      const tableInfo = await db.run(sql`PRAGMA table_info(fuel_logs)`);
      const cols = tableInfo.rows || [];
      const hasRemoteId = cols.some((r) => r.name === "remote_id");
      const hasSyncStatus = cols.some((r) => r.name === "sync_status");
      const odoCol = cols.find((r) => r.name === "odometer_km");
      const needsRecreate = odoCol && odoCol.notnull === 1;

      if (needsRecreate || !hasRemoteId || !hasSyncStatus) {
        await db.run(sql`ALTER TABLE fuel_logs RENAME TO fuel_logs_old`);
        await db.run(sql`
          CREATE TABLE fuel_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            remote_id TEXT,
            start_km REAL NOT NULL,
            odometer_km REAL,
            litres REAL NOT NULL,
            price_per_litre REAL NOT NULL,
            total_cost REAL NOT NULL,
            date TEXT NOT NULL,
            month TEXT NOT NULL,
            note TEXT,
            sync_status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);
        // Copy old data — pad missing columns with defaults
        const oldCols = cols.map((c) => c.name).join(", ");
        const selectCols = cols.map((c) => c.name).join(", ");
        const extraCols = [];
        if (!hasRemoteId) extraCols.push("NULL as remote_id");
        if (!hasSyncStatus) extraCols.push("'pending' as sync_status");
        const selectExpr =
          extraCols.length > 0
            ? `${selectCols}, ${extraCols.join(", ")}`
            : selectCols;
        await db.run(
          sql.raw(
            `INSERT INTO fuel_logs (${oldCols}${!hasRemoteId ? ", remote_id" : ""}${!hasSyncStatus ? ", sync_status" : ""}) SELECT ${selectExpr} FROM fuel_logs_old`,
          ),
        );
        await db.run(sql`DROP TABLE fuel_logs_old`);
        console.log(
          "Migrated fuel_logs: added remote_id, sync_status, nullable odometer_km",
        );
      }
    } catch (migErr) {
      console.warn("Fuel migration check skipped", migErr);
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
  }
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
      return newLog;
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
  return result[0];
};

export const updateFuelLogEndReading = async (id, endKm) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("fuel_logs") || "[]");
      const log = list.find((f) => f.id === id);
      if (log) log.odometerKm = endKm;
      localStorage.setItem("fuel_logs", JSON.stringify(list));
      return { success: true };
    }
    return { success: false };
  }
  await db
    .update(fuelLogs)
    .set({ odometerKm: endKm })
    .where(eq(fuelLogs.id, id));
  return { success: true };
};

export const deleteFuelLog = async (id) => {
  if (!db) {
    if (Platform.OS === "web") {
      let list = JSON.parse(localStorage.getItem("fuel_logs") || "[]");
      list = list.filter((f) => f.id !== id);
      localStorage.setItem("fuel_logs", JSON.stringify(list));
      return { success: true };
    }
    return { success: false };
  }
  await db.delete(fuelLogs).where(eq(fuelLogs.id, id));
  return { success: true };
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
      };
      list.push(newIncome);
      localStorage.setItem("income", JSON.stringify(list));
      return newIncome;
    }
    throw new Error("Database not initialized");
  }
  const result = await db
    .insert(income)
    .values({ title, amount, source, date, description, month, method })
    .returning();
  return result[0];
};

export const deleteIncome = async (id) => {
  if (!db) {
    if (Platform.OS === "web") {
      let list = JSON.parse(localStorage.getItem("income") || "[]");
      list = list.filter((i) => i.id !== id);
      localStorage.setItem("income", JSON.stringify(list));
      return { success: true };
    }
    return { success: false };
  }
  await db.delete(income).where(eq(income.id, id));
  return { success: true };
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