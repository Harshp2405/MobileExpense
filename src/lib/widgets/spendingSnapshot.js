import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getExpensesByMonth, getCategories } from "../db/queries";

const STORAGE_KEY = "widget:spending";
const MAX_SLICES = 5;
const FALLBACK_COLORS = {
  Food: "#EF4444",
  Groceries: "#10B981",
  Transport: "#3B82F6",
  Shopping: "#F59E0B",
  Entertainment: "#8B5CF6",
  Bills: "#14B8A6",
  General: "#6B7280",
};
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function safeColor(value, fallback = "#6B7280") {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

export function getCurrentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Same aggregation as Analytics.jsx, reduced to the top slices plus "Other".
export function buildSpendingSnapshot(expenses, categories, now = new Date()) {
  const list = Array.isArray(expenses) ? expenses : [];
  const cats = Array.isArray(categories) ? categories : [];
  const totals = {};

  for (const expense of list) {
    const amount = Number(expense?.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const name = expense.category || "General";
    totals[name] = (totals[name] ?? 0) + amount;
  }

  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const sorted = Object.entries(totals)
    .map(([name, value]) => {
      const dbCategory = cats.find(
        (c) => c?.name?.toLowerCase() === name.toLowerCase(),
      );
      return {
        name,
        value,
        color: safeColor(dbCategory?.color, safeColor(FALLBACK_COLORS[name])),
      };
    })
    .sort((a, b) => b.value - a.value);

  const slices = sorted.slice(0, MAX_SLICES);
  const rest = sorted.slice(MAX_SLICES);
  if (rest.length > 0) {
    slices.push({
      name: "Other",
      value: rest.reduce((sum, item) => sum + item.value, 0),
      color: "#9CA3AF",
    });
  }

  return {
    monthLabel: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    total,
    updatedAt: now.toISOString(),
    slices: slices.map((slice) => ({
      ...slice,
      percentage: total > 0 ? (slice.value / total) * 100 : 0,
    })),
  };
}

export async function saveSpendingSnapshot(snapshot) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export async function loadSpendingSnapshot() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.slices)) return null;
    return parsed;
  } catch (error) {
    console.warn("[spendingSnapshot.load]", { event: "invalid_snapshot" });
    return null;
  }
}

// Call after any expense change; never throws so it cannot break the caller.
export async function refreshSpendingWidget() {
  if (Platform.OS === "web") return;

  try {
    const [expenses, categories] = await Promise.all([
      getExpensesByMonth(getCurrentMonthKey()),
      getCategories(),
    ]);
    const snapshot = buildSpendingSnapshot(expenses, categories);
    await saveSpendingSnapshot(snapshot);

    if (Platform.OS === "android") {
      const {
        updateAndroidSpendingWidget,
      } = require("../../widgets/android/widgetTaskHandler");
      await updateAndroidSpendingWidget(snapshot);
    } else if (Platform.OS === "ios") {
      const SpendingWidget =
        require("../../widgets/ios/SpendingWidget").default;
      SpendingWidget.updateSnapshot(snapshot);
    }
  } catch (error) {
    console.warn("[spendingSnapshot.refresh]", {
      event: "widget_refresh_failed",
    });
  }
}
