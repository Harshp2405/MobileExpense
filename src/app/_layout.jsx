import { Drawer } from "expo-router/drawer";
import "../../global.css";
import { useEffect, useState } from "react";
import { initDatabase } from "../lib/db/queries";
import NetInfo from "@react-native-community/netinfo";
import { syncAll } from "../lib/sync/syncManager";
import CustomDrawerContent from "../components/CustomDrawer";
import { useThemePersist } from "../lib/utils/useThemePersist";

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const { colorScheme } = useThemePersist();
  const isDark = colorScheme === "dark";

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((e) => {
        console.error(e);
        setDbReady(true);
      });
  }, []);
  // Auto-sync when device comes online
  useEffect(() => {
    if (!dbReady) return;

    // Trigger sync immediately on mount if online
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

  if (!dbReady) {
    return null; // Waits for db to create tables and seed
  }

  return (
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
          drawerLabel: "Test",
          title: "User Setting",
        }}
      />
      <Drawer.Screen
        name="index"
        options={{
          drawerItemStyle: { display: "none" },
        }}
      />
    </Drawer>
  );
}

