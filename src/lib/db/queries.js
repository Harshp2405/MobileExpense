import { db } from "./client";
import { expenses, budgets, categories, fuelLogs } from "./schema";
import { eq, desc, sum, asc, sql } from "drizzle-orm";
import { Platform } from "react-native";

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
  date,
  description,
  month,
  method,
}) => {
  if (!db) {
    if (Platform.OS === "web") {
      const list = JSON.parse(localStorage.getItem("expenses") || "[]");
      const newExpense = {
        id: Date.now(),
        title,
        amount: Number(amount),
        category: category || "General",
        date: date || new Date().toISOString().split("T")[0],
        description: description || "",
        month,
        method,
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
    .values({ title, amount, category, date, description, month, method })
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
      let list = JSON.parse(localStorage.getItem("expenses") || "[]");
      list = list.filter((e) => e.id !== id);
      localStorage.setItem("expenses", JSON.stringify(list));
      return { success: true };
    }
    return { success: false };
  }
  try {
    await db.delete(expenses).where(eq(expenses.id, id));
    return { success: true };
  } catch (err) {
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
      // 1. Update any expenses belonging to this category to "General"
      let expensesList = JSON.parse(localStorage.getItem("expenses") || "[]");
      expensesList = expensesList.map((e) =>
        e.category === name ? { ...e, category: "General" } : e,
      );
      localStorage.setItem("expenses", JSON.stringify(expensesList));

      // 2. Delete the category itself
      let categoriesList = JSON.parse(
        localStorage.getItem("categories") || "[]",
      );
      categoriesList = categoriesList.filter((c) => c.id !== id);
      localStorage.setItem("categories", JSON.stringify(categoriesList));

      return { success: true };
    }
    throw new Error("Database not initialized");
  }
  // 1. Update any expenses belonging to this category to "General"
  await db
    .update(expenses)
    .set({ category: "General" })
    .where(eq(expenses.category, name));

  // 2. Delete the category itself
  await db.delete(categories).where(eq(categories.id, id));

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
            createdAt: new Date().toISOString(),
          },
          {
            id: 2,
            name: "Groceries",
            color: "#10B981",
            createdAt: new Date().toISOString(),
          },
          {
            id: 3,
            name: "Transport",
            color: "#3B82F6",
            createdAt: new Date().toISOString(),
          },
          {
            id: 4,
            name: "Shopping",
            color: "#F59E0B",
            createdAt: new Date().toISOString(),
          },
          {
            id: 5,
            name: "Entertainment",
            color: "#8B5CF6",
            createdAt: new Date().toISOString(),
          },
          {
            id: 6,
            name: "Bills",
            color: "#14B8A6",
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
        date TEXT,
        description TEXT,
        month TEXT NOT NULL,
        method TEXT,
        sync_status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS fuel_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_km REAL NOT NULL,
        odometer_km REAL NOT NULL,
        litres REAL NOT NULL,
        price_per_litre REAL NOT NULL,
        total_cost REAL NOT NULL,
        date TEXT NOT NULL,
        month TEXT NOT NULL,
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

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
      return list.sort((a, b) => b.odometerKm - a.odometerKm);
    }
    return [];
  }
  return await db.select().from(fuelLogs).orderBy(desc(fuelLogs.odometerKm));
};

export const addFuelLog = async ({
  odometerKm,
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
        odometerKm,
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
    .values({ startKm, odometerKm, litres, pricePerLitre, totalCost, date, month, note })
    .returning();
  return result[0];
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
    const driven = log.startKm ? log.odometerKm - log.startKm : 0;
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
