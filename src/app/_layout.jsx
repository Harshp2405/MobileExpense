// src/app/_layout.jsx
import { Drawer } from "expo-router/drawer";
import "../../global.css";
import { useEffect, useState } from "react";
import { initDatabase } from "../lib/db/queries";
import NetInfo from "@react-native-community/netinfo";
import { syncAll } from "../lib/sync/syncManager";
import CustomDrawerContent from "../components/CustomDrawer";
import { useThemePersist } from "../lib/utils/useThemePersist";
import { registerBackupTask } from "../lib/backup/backgroundTask";
import { Platform, Text, View } from "react-native";
import { recoverPortableImport } from "../lib/backup/portableService";

// NEW: Security + Privacy imports
import { PrivacyProvider } from "../lib/privacy/usePrivacyMode";
import { useBiometricAuth } from "../lib/auth/useBiometricAuth";
import LockScreen from "../components/LockScreen";


import * as Notifications from "expo-notifications";
import {
  configureExportNotifications,
  scheduleNextExportReminder,
} from "../lib/notifications/exportReminder";

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState(null);
  const { colorScheme } = useThemePersist();
  const isDark = colorScheme === "dark";

  // Biometric gate — reads persisted user preference on mount
  const { isLocked, isAuthenticating, authError, unlock } = useBiometricAuth();

  useEffect(() => {
    const initialize = async () => {
      try {
        await recoverPortableImport();
      } catch (error) {
        console.error("Could not recover interrupted database import", error);
        setRecoveryError("Database import recovery failed. Do not clear browser storage. Free browser storage space and reload to retry.");
        return;
      }
      await initDatabase()
      .then(async () => {
        if (Platform.OS !== "web") {
          await registerBackupTask();
        }
        setDbReady(true);
      })
      .catch((e) => {
        console.error(e);
        setDbReady(true);
      });
    };
    initialize();
  }, []);

  useEffect(() => {
    if (!dbReady) return;

    NetInfo.fetch().then((state) => {
      if (state.isConnected && state.isInternetReachable) {
        console.log("Device initially online — triggering sync on mount...");
        syncAll();
      }
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        console.log("Device online — triggering sync...");
        syncAll();
      }
    });

    return () => unsubscribe();
  }, [dbReady]);


  useEffect(() => {
    if (!dbReady || Platform.OS === "web") return;

    let responseSubscription;

    const initializeNotifications = async () => {
      await configureExportNotifications();
      await scheduleNextExportReminder();

      responseSubscription =
        Notifications.addNotificationResponseReceivedListener((response) => {
          const action = response.notification.request.content.data?.action;
          if (action !== "export-monthly-expenses") return;

          scheduleNextExportReminder().catch((error) => {
            console.error(
              "[RootLayout.notifications] reschedule failed",
              error,
            );
          });
        });
    };

    initializeNotifications().catch((error) => {
      console.error("[RootLayout.notifications] initialization failed", error);
    });

    return () => responseSubscription?.remove();
  }, [dbReady]);

  // DB not ready yet — block render
  if (recoveryError) {
    return (
      <View className="flex-1 justify-center p-6 bg-white">
        <Text accessibilityRole="alert" className="text-red-600">{recoveryError}</Text>
      </View>
    );
  }
  if (!dbReady) {
    return null;
  }

  // Biometric gate is active — show lock screen instead of app content
  if (isLocked) {
    return (
      <LockScreen
        onUnlock={unlock}
        isAuthenticating={isAuthenticating}
        error={authError}
      />
    );
  }

  return (
    // PrivacyProvider wraps the entire navigation tree
    <PrivacyProvider>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerStyle: {
            backgroundColor: isDark ? "#111827" : "#FFFFFF",
          },
          headerTintColor: isDark ? "#F9FAFB" : "#111827",
          headerTitleStyle: {
            fontWeight: "bold",
            color: isDark ? "#F9FAFB" : "#111827",
          },
          drawerActiveBackgroundColor: "#e28585ff",
          drawerStyle: {
            backgroundColor: isDark ? "#111827" : "#FFFFFF",
          },
          drawerLabelStyle: {
            color: isDark ? "#F9FAFB" : "#111827",
          },
          headerShadowVisible: false,
        }}
      >
        <Drawer.Screen
          name="(tabs)"
          options={{
            drawerLabel: "Dashboard",
            title: "Overview",
          }}
        />
        <Drawer.Screen
          name="about"
          options={{
            drawerLabel: "App Architecture & Info",
            title: "Technical Architecture",
          }}
        />
        <Drawer.Screen
          name="(tabt)"
          options={{
            drawerLabel: "Analytics",
            title: "Analyscies of Budget",
          }}
        />
        <Drawer.Screen
          name="index"
          options={{
            drawerItemStyle: { display: "none" },
          }}
        />
        <Drawer.Screen
          name="categories"
          options={{
            drawerLabel: "Categories",
            title: "Categories",
          }}
        />
      </Drawer>
    </PrivacyProvider>
  );
}
