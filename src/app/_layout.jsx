import { Stack } from "expo-router";
import "../../global.css";
import { useEffect, useState } from "react";
import { initDatabase } from "../lib/db/queries";
import NetInfo from "@react-native-community/netinfo";
import { syncAll } from "../lib/sync/syncManager";

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

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
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

