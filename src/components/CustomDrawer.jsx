import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getExpensesByMonth, getBudgetByMonth } from "../lib/db/queries";
import { syncAll } from "../lib/sync/syncManager";
import { useThemePersist } from "../lib/utils/useThemePersist";

const MENU_ITEMS = [
  { name: "Dashboard", icon: "wallet-outline", activeIcon: "wallet", route: "/(tabs)" },
  // { name: "Analytics Dashboard", icon: "bar-chart-outline", activeIcon: "bar-chart", route: "/(tabs)/Analytics" },
  // { name: "Budget Planning", icon: "pie-chart-outline", activeIcon: "pie-chart", route: "/(tabs)/budgets" },
  // { name: "Category Management", icon: "grid-outline", activeIcon: "grid", route: "/(tabs)/categories" },
  { name: "App Architecture & Info", icon: "information-circle-outline", activeIcon: "information-circle", route: "/about" },
  { name: "Test", icon: "information-circle-outline", activeIcon: "information-circle", route: "/(tabt)" },
];

export default function CustomDrawerContent(props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colorScheme, toggle } = useThemePersist();
  const isDark = colorScheme === "dark";

  const [totalSpent, setTotalSpent] = useState(0);
  const [budgetLimit, setBudgetLimit] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState("");

  // Calculate current YYYY-MM key
  const today = new Date();
  const currentMonthName = today.toLocaleString("default", { month: "long" });
  const currentYear = today.getFullYear();
  const monthKey = `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const loadFinancialStats = useCallback(async () => {
    try {
      // 1. Fetch budget
      const budgetData = await getBudgetByMonth(monthKey);
      setBudgetLimit(budgetData ? budgetData.amount : 0);

      // 2. Fetch expenses and sum amounts
      const expensesList = await getExpensesByMonth(monthKey);
      const spent = (expensesList || []).reduce((sum, item) => sum + item.amount, 0);
      setTotalSpent(spent);
    } catch (e) {
      console.warn("Failed to fetch drawer budget statistics:", e);
    }
  }, [monthKey]);

  // Run initial fetch and set periodic refresh to remain perfectly up to date
  useEffect(() => {
    loadFinancialStats();

    const interval = setInterval(() => {
      loadFinancialStats();
    }, 3000);

    return () => clearInterval(interval);
  }, [loadFinancialStats]);

  const handleManualSync = async () => {
    if (syncing) return;
    try {
      setSyncing(true);
      await syncAll();
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      Alert.alert("Sync Successful", "Local offline store is fully synchronized with MongoDB Atlas.");
    } catch (error) {
      console.warn("[Sync] Manual sync failed:", error);
      Alert.alert("Sync Offline", "Backend server currently unreachable. Operating offline.");
    } finally {
      setSyncing(false);
    }
  };

  const isActive = (itemRoute) => {
    if (itemRoute === "/(tabs)") {
      return pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/index" || pathname === "";
    }
    return pathname === itemRoute;
  };

  // Calculate progress metrics
  const remaining = Math.max(budgetLimit - totalSpent, 0);
  const progressRatio = budgetLimit > 0 ? Math.min(totalSpent / budgetLimit, 1) : 0;
  const progressPercent = (progressRatio * 100).toFixed(0);

  // Set colors based on budget exhaust
  let progressColor = "bg-blue-600";
  let badgeBg = "bg-blue-50 dark:bg-blue-900/30";
  let badgeText = "text-blue-600 dark:text-blue-400";
  if (progressRatio >= 0.9) {
    progressColor = "bg-red-500";
    badgeBg = "bg-red-50 dark:bg-red-900/30";
    badgeText = "text-red-600 dark:text-red-400";
  } else if (progressRatio >= 0.75) {
    progressColor = "bg-amber-500";
    badgeBg = "bg-amber-50 dark:bg-amber-900/30";
    badgeText = "text-amber-600 dark:text-amber-400";
  }

  return (
    <View className="flex-1 bg-white dark:bg-zinc-900">
      {/* 👤 Profile Banner */}
      <View
        style={{ paddingTop: insets.top + 20 }}
        className="bg-blue-600 p-6 rounded-b-[32px] shadow-lg mb-6"
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 bg-white/20 border border-white/30 rounded-2xl items-center justify-center mr-4">
            <Text className="text-white text-2xl font-black">H</Text>
          </View>
          <View>
            <Text className="text-white/80 text-xs font-semibold uppercase tracking-wider">
              Welcome back
            </Text>
            <Text className="text-white text-xl font-bold">Harsh</Text>
          </View>
        </View>
        <View className="flex-row items-center bg-white/10 px-3 py-1.5 rounded-xl self-start">
          <View className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
          <Text className="text-white/90 text-xs font-semibold">
            Offline-First Active
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1 px-4">
        {/* 📊 Real-Time Spent Progress Widget */}
        <View className="bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 rounded-3xl p-5 mb-6">
          <View className="flex-row justify-between items-center mb-3">
            <View>
              <Text className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider mb-0.5">
                {currentMonthName} Spent
              </Text>
              <Text className="text-gray-900 dark:text-gray-100 text-lg font-black">
                ₹{totalSpent.toFixed(2)}
              </Text>
            </View>
            <View className={`px-2.5 py-1 rounded-full ${badgeBg}`}>
              <Text className={`text-xs font-bold ${badgeText}`}>{progressPercent}%</Text>
            </View>
          </View>

          {/* Progress Bar Container */}
          <View className="h-2 bg-gray-200 dark:bg-zinc-700 rounded-full mb-3 overflow-hidden">
            <View
              style={{ width: `${progressPercent}%` }}
              className={`h-full rounded-full ${progressColor}`}
            />
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="text-gray-400 dark:text-gray-500 text-xs font-semibold">
              Limit: ₹{budgetLimit.toFixed(0)}
            </Text>
            <Text className="text-gray-600 dark:text-gray-400 text-xs font-bold">
              ₹{remaining.toFixed(0)} left
            </Text>
          </View>
        </View>

        {/* 📋 Main Drawer Menu List */}
        <View className="space-y-1 mb-6">
          {MENU_ITEMS.map((item) => {
            const active = isActive(item.route);
            return (
              <TouchableOpacity
                key={item.name}
                onPress={() => {
                  props.navigation.closeDrawer();
                  router.push(item.route);
                }}
                className={`flex-row items-center p-4 rounded-2xl mb-1.5 transition-all ${
                  active ? "bg-blue-50/80 dark:bg-blue-900/30 border border-blue-100/50 dark:border-blue-800/50" : "bg-transparent border border-transparent"
                }`}
              >
                <View className="mr-4">
                  <Ionicons
                    name={active ? item.activeIcon : item.icon}
                    size={22}
                    color={active ? "#2563EB" : isDark ? "#9CA3AF" : "#6B7280"}
                  />
                </View>
                <Text
                  className={`text-sm font-bold flex-1 ${
                    active ? "text-blue-600" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {item.name}
                </Text>
                {active && (
                  <View className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 🔄 Interactive Manual Sync Section */}
        <View className="bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 rounded-3xl p-5 mb-8">
          <View className="flex-row items-center mb-3">
            <Ionicons name="cloud-upload-outline" size={20} color={isDark ? '#9CA3AF' : '#4B5563'} />
            <Text className="text-gray-800 dark:text-gray-200 text-sm font-bold ml-2">
              Cloud Synchronization
            </Text>
          </View>
          <Text className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed mb-4">
            Manually trigger data synchronization to back up all expenses and budgets to MongoDB cloud server.
          </Text>

          <TouchableOpacity
            onPress={handleManualSync}
            disabled={syncing}
            className={`w-full py-3.5 rounded-2xl flex-row items-center justify-center shadow-sm ${
              syncing ? "bg-blue-300" : "bg-blue-600"
            }`}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" className="mr-2" />
            ) : (
              <Ionicons name="refresh" size={18} color="#FFFFFF" className="mr-2" />
            )}
            <Text className="text-white font-bold text-sm">
              {syncing ? "Syncing Store..." : "Sync Database Now"}
            </Text>
          </TouchableOpacity>

          {lastSyncTime ? (
            <Text className="text-gray-400 text-[10px] text-center mt-3 font-semibold">
              Last synced: {lastSyncTime}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Footer */}
      <View
        style={{ paddingBottom: insets.bottom + 20 }}
        className="px-6 pt-4 border-t border-gray-100 dark:border-zinc-800 items-center bg-gray-50/50 dark:bg-zinc-900"
      >
        <TouchableOpacity
          onPress={toggle}
          className="flex-row items-center bg-gray-100 dark:bg-zinc-800 px-4 py-2.5 rounded-full mb-3 border border-gray-200 dark:border-zinc-700"
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={16}
            color={isDark ? "#FBBF24" : "#6B7280"}
          />
          <Text className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-2">
            {isDark ? "Light Mode" : "Dark Mode"}
          </Text>
        </TouchableOpacity>
        <Text className="text-gray-400 dark:text-gray-500 text-[11px] font-bold tracking-widest uppercase">
          Expense Tracker Pro
        </Text>
        <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-semibold mt-0.5">
          v1.0.0 • Production Ready
        </Text>
      </View>
    </View>
  );
}
