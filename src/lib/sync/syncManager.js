import { db } from "../db/client";
import { expenses, budgets, fuelLogs } from "../db/schema";
import { eq } from "drizzle-orm";
import * as storage from "../utils/storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

// ==========================================
// 🌐 API URL RESOLVER
// ==========================================

const getApiUrl = () => {
  if (__DEV__) {
    if (Platform.OS === "web") {
      return "http://localhost:5000";
    }
    // Expo hostUri format: "192.168.X.X:8081"
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const ip = hostUri.split(":")[0];
      return `http://${ip}:5000`;
    }
    // Fallback for emulators
    return Platform.OS === "android"
      ? "http://10.0.2.2:5000"
      : "http://localhost:5000";
  }
  return process.env.EXPO_PUBLIC_API_URL || "https://candelback-production.up.railway.app";
};

export const API_URL = getApiUrl();

// ==========================================
// 💸 SYNC EXPENSES
// Pushes pending local expenses → MongoDB
// Pulls remote updates → SQLite
//
// MongoDB Expense fields: title, amount, month, method
// Mobile-only fields (category, date, description) stay local
// ==========================================

export const syncExpenses = async () => {
  console.log("[Sync] Syncing expenses...");

  if (!db) {
    if (Platform.OS === "web") {
      try {
        // ---- A. PUSH: Local pending → Server ----
        const list = JSON.parse(localStorage.getItem("expenses") || "[]");
        const pending = list.filter(
          (e) => !e.syncStatus || e.syncStatus === "pending"
        );

        if (pending.length > 0) {
          const payload = pending.map(
            ({ id, remoteId, title, amount, month, method }) => ({
              id,
              remoteId,
              title,
              amount,
              month,
              method,
            })
          );

          const res = await fetch(`${API_URL}/expenses/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expenses: payload }),
          });

          if (res.ok) {
            const { syncedIds } = await res.json();
            const updatedList = list.map((item) => {
              const match = syncedIds.find((s) => s.localId === item.id);
              if (match) {
                return {
                  ...item,
                  syncStatus: "synced",
                  remoteId: String(match.remoteId),
                };
              }
              return item;
            });
            localStorage.setItem("expenses", JSON.stringify(updatedList));
            console.log(`[Sync Web] Pushed ${syncedIds.length} expenses`);
          }
        }

        // ---- B. PULL: Server delta → Local ----
        const lastSync = localStorage.getItem("last_sync_expense_time") || "0";
        const pullRes = await fetch(
          `${API_URL}/expenses/delta?since=${lastSync}`
        );

        if (pullRes.ok) {
          const { items, timestamp, activeIds } = await pullRes.json();
          let currentList = JSON.parse(localStorage.getItem("expenses") || "[]");

          for (const item of items) {
            const idx = currentList.findIndex(
              (e) => e.remoteId === String(item._id)
            );

            if (idx > -1) {
              currentList[idx] = {
                ...currentList[idx],
                title: item.title,
                amount: item.amount,
                month: item.month,
                method: item.method,
                syncStatus: "synced",
              };
            } else {
              currentList.push({
                id: Date.now() + Math.random(),
                remoteId: String(item._id),
                title: item.title,
                amount: item.amount,
                category: "General",
                date: new Date().toISOString().split("T")[0],
                description: "",
                month: item.month,
                method: item.method,
                syncStatus: "synced",
                createdAt: new Date().toISOString(),
              });
            }
          }

          // Deletion reconciliation: Filter out any items that have a remoteId but are not active on the server
          if (activeIds && Array.isArray(activeIds)) {
            currentList = currentList.filter(item => {
              if (!item.remoteId || item.syncStatus === "pending") return true;
              return activeIds.includes(item.remoteId);
            });
          }

          localStorage.setItem("expenses", JSON.stringify(currentList));
          localStorage.setItem("last_sync_expense_time", String(timestamp));
          console.log(`[Sync Web] Pulled ${items.length} expenses from server`);
        }
      } catch (error) {
        console.warn("[Sync Web] Expense sync failed:", error);
      }
    }
    return;
  }

  try {
    // ---- A. PUSH: Local pending → Server ----
    const pending = await db
      .select()
      .from(expenses)
      .where(eq(expenses.syncStatus, "pending"));

    if (pending.length > 0) {
      // Only send fields that MongoDB knows about
      const payload = pending.map(
        ({ id, remoteId, title, amount, month, method }) => ({
          id,
          remoteId,
          title,
          amount,
          month,
          method,
        })
      );

      const res = await fetch(`${API_URL}/expenses/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses: payload }),
      });

      if (res.ok) {
        const { syncedIds } = await res.json();
        for (const { localId, remoteId } of syncedIds) {
          await db
            .update(expenses)
            .set({ syncStatus: "synced", remoteId: String(remoteId) })
            .where(eq(expenses.id, localId));
        }
        console.log(`[Sync] Pushed ${syncedIds.length} expenses`);
      }
    }

    // ---- B. PULL: Server delta → Local ----
    const lastSync =
      (await storage.getItem("last_sync_expense_time")) || "0";
    const pullRes = await fetch(
      `${API_URL}/expenses/delta?since=${lastSync}`
    );

    if (pullRes.ok) {
      const { items, timestamp, activeIds } = await pullRes.json();

      for (const item of items) {
        // Check if this remote expense already exists locally
        const existing = await db
          .select()
          .from(expenses)
          .where(eq(expenses.remoteId, String(item._id)))
          .limit(1);

        if (existing.length > 0) {
          // Update existing local record (only MongoDB fields)
          await db
            .update(expenses)
            .set({
              title: item.title,
              amount: item.amount,
              month: item.month,
              method: item.method,
              syncStatus: "synced",
            })
            .where(eq(expenses.remoteId, String(item._id)));
        } else {
          // Insert new record from server
          await db.insert(expenses).values({
            remoteId: String(item._id),
            title: item.title,
            amount: item.amount,
            month: item.month,
            method: item.method,
            syncStatus: "synced",
          });
        }
      }

      // Deletion reconciliation: Delete local SQLite records that are synced but no longer exist on MongoDB
      if (activeIds && Array.isArray(activeIds)) {
        const localExpenses = await db.select().from(expenses);
        for (const local of localExpenses) {
          if (local.remoteId && local.syncStatus !== "pending" && !activeIds.includes(local.remoteId)) {
            await db.delete(expenses).where(eq(expenses.id, local.id));
            console.log(`[Sync] Deleted local expense (ID: ${local.id}) since it was deleted on the server`);
          }
        }
      }

      await storage.setItem(
        "last_sync_expense_time",
        String(timestamp)
      );
      console.log(`[Sync] Pulled ${items.length} expenses from server`);
    }
  } catch (error) {
    console.warn("[Sync] Expense sync failed:", error);
  }
};

// ==========================================
// 📊 SYNC BUDGETS
// Pushes pending local budgets → MongoDB
// Pulls ALL budgets from server (no timestamps on Budget model)
// MongoDB Budget fields: month, amount
// ==========================================

export const syncBudgets = async () => {
  console.log("[Sync] Syncing budgets...");

  if (!db) {
    if (Platform.OS === "web") {
      try {
        // ---- A. PUSH: Local pending → Server ----
        const list = JSON.parse(localStorage.getItem("budgets") || "[]");
        const pending = list.filter(
          (b) => !b.syncStatus || b.syncStatus === "pending"
        );

        if (pending.length > 0) {
          const payload = pending.map(({ id, remoteId, amount, month }) => ({
            id,
            remoteId,
            amount,
            month,
          }));

          const res = await fetch(`${API_URL}/budget/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ budgets: payload }),
          });

          if (res.ok) {
            const { syncedIds } = await res.json();
            const updatedList = list.map((item) => {
              const match = syncedIds.find((s) => s.localId === item.id);
              if (match) {
                return {
                  ...item,
                  syncStatus: "synced",
                  remoteId: String(match.remoteId),
                };
              }
              return item;
            });
            localStorage.setItem("budgets", JSON.stringify(updatedList));
            console.log(`[Sync Web] Pushed ${syncedIds.length} budgets`);
          }
        }

        // ---- B. PULL: All budgets from server ----
        const pullRes = await fetch(`${API_URL}/budget/delta`);

        if (pullRes.ok) {
          const { items } = await pullRes.json();
          let currentList = JSON.parse(localStorage.getItem("budgets") || "[]");

          for (const item of items) {
            const idx = currentList.findIndex((b) => b.month === item.month);

            if (idx > -1) {
              currentList[idx] = {
                ...currentList[idx],
                amount: item.amount,
                remoteId: String(item._id),
                syncStatus: "synced",
              };
            } else {
              currentList.push({
                id: Date.now() + Math.random(),
                remoteId: String(item._id),
                amount: item.amount,
                month: item.month,
                syncStatus: "synced",
                createdAt: new Date().toISOString(),
              });
            }
          }

          // Deletion reconciliation for Budgets
          const serverMonths = items.map(b => b.month);
          currentList = currentList.filter(local => {
            if (!local.remoteId || local.syncStatus === "pending") return true;
            return serverMonths.includes(local.month);
          });

          localStorage.setItem("budgets", JSON.stringify(currentList));
          console.log(`[Sync Web] Pulled ${items.length} budgets from server`);
        }
      } catch (error) {
        console.warn("[Sync Web] Budget sync failed:", error);
      }
    }
    return;
  }

  try {
    // ---- A. PUSH: Local pending → Server ----
    const pending = await db
      .select()
      .from(budgets)
      .where(eq(budgets.syncStatus, "pending"));

    if (pending.length > 0) {
      const payload = pending.map(({ id, remoteId, amount, month }) => ({
        id,
        remoteId,
        amount,
        month,
      }));

      const res = await fetch(`${API_URL}/budget/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgets: payload }),
      });

      if (res.ok) {
        const { syncedIds } = await res.json();
        for (const { localId, remoteId } of syncedIds) {
          await db
            .update(budgets)
            .set({ syncStatus: "synced", remoteId: String(remoteId) })
            .where(eq(budgets.id, localId));
        }
        console.log(`[Sync] Pushed ${syncedIds.length} budgets`);
      }
    }

    // ---- B. PULL: All budgets from server (no timestamps, full pull) ----
    const pullRes = await fetch(`${API_URL}/budget/delta`);

    if (pullRes.ok) {
      const { items } = await pullRes.json();

      for (const item of items) {
        // Check if budget for this month already exists locally
        const existing = await db
          .select()
          .from(budgets)
          .where(eq(budgets.month, item.month))
          .limit(1);

        if (existing.length > 0) {
          // Update existing local budget
          await db
            .update(budgets)
            .set({
              amount: item.amount,
              remoteId: String(item._id),
              syncStatus: "synced",
            })
            .where(eq(budgets.month, item.month));
        } else {
          // Insert new budget from server
          await db.insert(budgets).values({
            remoteId: String(item._id),
            amount: item.amount,
            month: item.month,
            syncStatus: "synced",
          });
        }
      }

      // Deletion reconciliation for budgets
      const serverMonths = items.map(b => b.month);
      const localBudgets = await db.select().from(budgets);
      for (const local of localBudgets) {
        if (local.remoteId && local.syncStatus !== "pending" && !serverMonths.includes(local.month)) {
          await db.delete(budgets).where(eq(budgets.id, local.id));
          console.log(`[Sync] Deleted local budget for ${local.month} since it was deleted on the server`);
        }
      }

      console.log(`[Sync] Pulled ${items.length} budgets from server`);
    }
  } catch (error) {
    console.warn("[Sync] Budget sync failed:", error);
  }
};

// ==========================================
// ⛽ SYNC FUEL LOGS
// Pushes pending local fuel logs → MongoDB
// Pulls remote updates → SQLite
// All fuel fields sync (unlike expenses where some are local-only)
// ==========================================

export const syncFuelLogs = async () => {
  console.log("[Sync] Syncing fuel logs...");

  if (!db) {
    if (Platform.OS === "web") {
      try {
        // ---- A. PUSH: Local pending → Server ----
        const list = JSON.parse(localStorage.getItem("fuel_logs") || "[]");
        const pending = list.filter(
          (f) => !f.syncStatus || f.syncStatus === "pending"
        );

        if (pending.length > 0) {
          const payload = pending.map(
            ({ id, remoteId, startKm, odometerKm, litres, pricePerLitre, totalCost, date, month, note }) => ({
              id, remoteId, startKm, odometerKm, litres, pricePerLitre, totalCost, date, month, note,
            })
          );

          const res = await fetch(`${API_URL}/fuel/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fuelLogs: payload }),
          });

          if (res.ok) {
            const { syncedIds } = await res.json();
            const updatedList = list.map((item) => {
              const match = syncedIds.find((s) => s.localId === item.id);
              if (match) {
                return { ...item, syncStatus: "synced", remoteId: String(match.remoteId) };
              }
              return item;
            });
            localStorage.setItem("fuel_logs", JSON.stringify(updatedList));
            console.log(`[Sync Web] Pushed ${syncedIds.length} fuel logs`);
          }
        }

        // ---- B. PULL: Server delta → Local ----
        const lastSync = localStorage.getItem("last_sync_fuel_time") || "0";
        const pullRes = await fetch(`${API_URL}/fuel/delta?since=${lastSync}`);

        if (pullRes.ok) {
          const { items, timestamp, activeIds } = await pullRes.json();
          let currentList = JSON.parse(localStorage.getItem("fuel_logs") || "[]");

          for (const item of items) {
            const idx = currentList.findIndex((f) => f.remoteId === String(item._id));
            if (idx > -1) {
              currentList[idx] = {
                ...currentList[idx],
                startKm: item.startKm, odometerKm: item.odometerKm,
                litres: item.litres, pricePerLitre: item.pricePerLitre,
                totalCost: item.totalCost, date: item.date,
                month: item.month, note: item.note, syncStatus: "synced",
              };
            } else {
              currentList.push({
                id: Date.now() + Math.random(),
                remoteId: String(item._id),
                startKm: item.startKm, odometerKm: item.odometerKm,
                litres: item.litres, pricePerLitre: item.pricePerLitre,
                totalCost: item.totalCost, date: item.date,
                month: item.month, note: item.note || "",
                syncStatus: "synced", createdAt: new Date().toISOString(),
              });
            }
          }

          if (activeIds && Array.isArray(activeIds)) {
            currentList = currentList.filter((item) => {
              if (!item.remoteId || item.syncStatus === "pending") return true;
              return activeIds.includes(item.remoteId);
            });
          }

          localStorage.setItem("fuel_logs", JSON.stringify(currentList));
          localStorage.setItem("last_sync_fuel_time", String(timestamp));
          console.log(`[Sync Web] Pulled ${items.length} fuel logs from server`);
        }
      } catch (error) {
        console.warn("[Sync Web] Fuel sync failed:", error);
      }
    }
    return;
  }

  try {
    // ---- A. PUSH: Local pending → Server ----
    const pending = await db
      .select()
      .from(fuelLogs)
      .where(eq(fuelLogs.syncStatus, "pending"));

    if (pending.length > 0) {
      const payload = pending.map(
        ({ id, remoteId, startKm, odometerKm, litres, pricePerLitre, totalCost, date, month, note }) => ({
          id, remoteId, startKm, odometerKm, litres, pricePerLitre, totalCost, date, month, note,
        })
      );

      const res = await fetch(`${API_URL}/fuel/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fuelLogs: payload }),
      });

      if (res.ok) {
        const { syncedIds } = await res.json();
        for (const { localId, remoteId } of syncedIds) {
          await db
            .update(fuelLogs)
            .set({ syncStatus: "synced", remoteId: String(remoteId) })
            .where(eq(fuelLogs.id, localId));
        }
        console.log(`[Sync] Pushed ${syncedIds.length} fuel logs`);
      }
    }

    // ---- B. PULL: Server delta → Local ----
    const lastSync = (await storage.getItem("last_sync_fuel_time")) || "0";
    const pullRes = await fetch(`${API_URL}/fuel/delta?since=${lastSync}`);

    if (pullRes.ok) {
      const { items, timestamp, activeIds } = await pullRes.json();

      for (const item of items) {
        const existing = await db
          .select()
          .from(fuelLogs)
          .where(eq(fuelLogs.remoteId, String(item._id)))
          .limit(1);

        const values = {
          startKm: item.startKm,
          odometerKm: item.odometerKm,
          litres: item.litres,
          pricePerLitre: item.pricePerLitre,
          totalCost: item.totalCost,
          date: item.date,
          month: item.month,
          note: item.note,
          syncStatus: "synced",
        };

        if (existing.length > 0) {
          await db
            .update(fuelLogs)
            .set(values)
            .where(eq(fuelLogs.remoteId, String(item._id)));
        } else {
          await db.insert(fuelLogs).values({
            remoteId: String(item._id),
            ...values,
          });
        }
      }

      // Deletion reconciliation
      if (activeIds && Array.isArray(activeIds)) {
        const localLogs = await db.select().from(fuelLogs);
        for (const local of localLogs) {
          if (local.remoteId && local.syncStatus !== "pending" && !activeIds.includes(local.remoteId)) {
            await db.delete(fuelLogs).where(eq(fuelLogs.id, local.id));
            console.log(`[Sync] Deleted local fuel log (ID: ${local.id}) since it was deleted on the server`);
          }
        }
      }

      await storage.setItem("last_sync_fuel_time", String(timestamp));
      console.log(`[Sync] Pulled ${items.length} fuel logs from server`);
    }
  } catch (error) {
    console.warn("[Sync] Fuel sync failed:", error);
  }
};

// ==========================================
// 🔄 SYNC ALL
// Runs all syncs sequentially
// ==========================================

export const syncAll = async () => {
  console.log("=== STARTING FULL SYNC ===");
  await syncExpenses();
  await syncBudgets();
  await syncFuelLogs();
  console.log("=== FULL SYNC COMPLETE ===");
};
