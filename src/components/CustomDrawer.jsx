import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getExpensesByMonth, getBudgetByMonth } from "../lib/db/queries";
import { syncAll } from "../lib/sync/syncManager";
import { useThemePersist } from "../lib/utils/useThemePersist";
import { getItem, setItem } from "../lib/utils/storage";
import { toastMessage } from "../lib/utils/helperFunctions";

const USER_NAME_KEY = "user_profile_name";
const DEFAULT_USER_NAME = "Buddy";

const MENU_ITEMS = [
  {
    name: "Dashboard",
    icon: "wallet-outline",
    activeIcon: "wallet",
    route: "/(tabs)",
  },
  // { name: "Analytics Dashboard", icon: "bar-chart-outline", activeIcon: "bar-chart", route: "/(tabs)/Analytics" },
  // { name: "Budget Planning", icon: "pie-chart-outline", activeIcon: "pie-chart", route: "/(tabs)/budgets" },
  // { name: "Category Management", icon: "grid-outline", activeIcon: "grid", route: "/(tabs)/categories" },
  {
    name: "App Architecture & Info",
    icon: "information-circle-outline",
    activeIcon: "information-circle",
    route: "/about",
  },
  {
    name: "Analytics",
    icon: "stats-chart",
    activeIcon: "stats-chart-outline",
    route: "/(tabt)",
  },
  {
    name: "Categories",
    icon: "grid-outline",
    activeIcon: "grid",
    route: "/categories",
  },
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

  // User Profile Name state
  const [userName, setUserName] = useState(DEFAULT_USER_NAME);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(DEFAULT_USER_NAME);
  const [isSavingName, setIsSavingName] = useState(false);

  // Calculate current YYYY-MM key
  const today = new Date();
  const currentMonthName = today.toLocaleString("default", { month: "long" });
  const currentYear = today.getFullYear();
  const monthKey = `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const loadFinancialStats = useCallback(async () => {
    const [budgetData, expensesList] = await Promise.all([
      getBudgetByMonth(monthKey),
      getExpensesByMonth(monthKey),
    ]);
    if (!Array.isArray(expensesList)) {
      throw new Error("Invalid expense list");
    }
    const budget = Number(budgetData?.amount ?? 0);
    const spent = expensesList.reduce((total, item) => total + Number(item.amount), 0);
    if (!Number.isFinite(budget) || !Number.isFinite(spent)) {
      throw new Error("Invalid financial totals");
    }
    return { budget, spent };
  }, [monthKey]);

  // Run initial fetch and set periodic refresh to remain perfectly up to date
  useEffect(() => {
    let active = true;
    let refreshing = false;

    const refresh = () => {
      if (!active || refreshing) return;
      refreshing = true;
      loadFinancialStats()
        .then(({ budget, spent }) => {
          if (!active) return;
          setBudgetLimit(budget);
          setTotalSpent(spent);
        })
        .catch(() => {
          if (active) {
            console.warn("[CustomDrawer]", { event: "financial_stats_failed" });
          }
        })
        .finally(() => {
          refreshing = false;
        });
    };

    refresh();
    const interval = setInterval(refresh, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [loadFinancialStats]);

  // Load saved user profile name from storage on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await getItem(USER_NAME_KEY);
        if (isMounted && typeof saved === "string" && saved.trim().length > 0) {
          setUserName(saved.trim());
        }
      } catch (error) {
        console.error("[CustomDrawer] Failed to load saved user name:", error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenEditModal = useCallback(() => {
    setTempName(userName);
    setIsEditingName(true);
  }, [userName]);

  const handleCloseEditModal = useCallback(() => {
    if (isSavingName) return;
    setIsEditingName(false);
    setTempName(userName);
  }, [isSavingName, userName]);

  const handleSaveName = useCallback(async () => {
    if (isSavingName) return; // Debounce guard against multiple submissions
    try {
      setIsSavingName(true);
      const sanitized = (tempName ?? "")
        .replace(/[\r\n\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const finalName = sanitized.length > 0 ? sanitized : DEFAULT_USER_NAME;
      await setItem(USER_NAME_KEY, finalName);
      setUserName(finalName);
      setIsEditingName(false);
      toastMessage("Name updated", 1, 1, 0, 80);
    } catch (error) {
      console.error("[CustomDrawer] Failed to save user name:", error);
      Alert.alert("Error", "Could not save your name. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  }, [tempName, isSavingName]);

  const handleResetDefaultName = useCallback(async () => {
    if (isSavingName) return;
    try {
      setIsSavingName(true);
      await setItem(USER_NAME_KEY, DEFAULT_USER_NAME);
      setUserName(DEFAULT_USER_NAME);
      setTempName(DEFAULT_USER_NAME);
      setIsEditingName(false);
      toastMessage("Reset to Buddy", 1, 1, 0, 80);
    } catch (error) {
      console.error("[CustomDrawer] Failed to reset user name:", error);
      Alert.alert("Error", "Could not reset name. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  }, [isSavingName]);

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

  const avatarInitial = (userName?.trim()?.charAt(0) || "B").toUpperCase();

  return (
    <View className="flex-1 bg-white dark:bg-zinc-900">
      {/* 👤 Profile Banner */}
      <View
        style={{ paddingTop: insets.top + 20 }}
        className="bg-blue-600 p-6 rounded-b-[32px] shadow-lg mb-6"
      >
        <View className="flex-row items-center mb-4">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenEditModal}
            className="w-14 h-14 bg-white/20 border border-white/30 rounded-2xl items-center justify-center mr-4"
          >
            <Text className="text-white text-2xl font-black">{avatarInitial}</Text>
          </TouchableOpacity>
          <View className="flex-1 justify-center mr-2">
            <Text className="text-white/80 text-xs font-semibold uppercase tracking-wider">
              Welcome back
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleOpenEditModal}
              className="flex-row items-center gap-1.5 mt-0.5"
            >
              <Text className="text-white text-xl font-bold flex-shrink" numberOfLines={1}>
                {userName}
              </Text>
              <View className="bg-white/20 p-1 rounded-full">
                <Ionicons name="pencil-outline" size={12} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
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

      {/* ✏️ Edit Name Modal */}
      <Modal
        visible={isEditingName}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseEditModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-center items-center bg-black/60 px-5"
        >
          <Pressable
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={handleCloseEditModal}
          />
          <View className="w-full max-w-sm bg-white dark:bg-zinc-800 rounded-3xl p-6 border border-gray-100 dark:border-zinc-700 shadow-2xl">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/30 items-center justify-center">
                  <Ionicons name="person-outline" size={20} color="#2563EB" />
                </View>
                <View>
                  <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    Edit Name
                  </Text>
                  <Text className="text-xs text-gray-400 dark:text-gray-500">
                    Personalize your greeting
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleCloseEditModal}
                disabled={isSavingName}
                className="p-1 rounded-full bg-gray-100 dark:bg-zinc-700"
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={isDark ? "#D1D5DB" : "#6B7280"}
                />
              </TouchableOpacity>
            </View>

            <Text className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
              Display Name
            </Text>

            <TextInput
              value={tempName}
              onChangeText={setTempName}
              placeholder="e.g. Buddy"
              placeholderTextColor={isDark ? "#71717A" : "#9CA3AF"}
              maxLength={25}
              autoFocus={true}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
              className="w-full bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl px-4 py-3.5 text-base text-gray-900 dark:text-gray-100 font-semibold mb-2"
            />

            <View className="flex-row justify-between items-center mb-6 px-1">
              <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                Leave blank for default (Buddy)
              </Text>
              {userName !== DEFAULT_USER_NAME && (
                <TouchableOpacity
                  onPress={handleResetDefaultName}
                  disabled={isSavingName}
                >
                  <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Reset to Buddy
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleCloseEditModal}
                disabled={isSavingName}
                className="flex-1 py-3.5 rounded-2xl border border-gray-200 dark:border-zinc-700 items-center justify-center bg-gray-100 dark:bg-zinc-700/60"
              >
                <Text className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveName}
                disabled={isSavingName}
                className={`flex-1 py-3.5 rounded-2xl items-center justify-center ${
                  isSavingName ? "bg-blue-400" : "bg-blue-600"
                }`}
              >
                {isSavingName ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-sm font-bold text-white">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
