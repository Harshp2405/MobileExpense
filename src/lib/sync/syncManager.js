import { Platform } from "react-native";
import Constants from "expo-constants";
import NetInfo from "@react-native-community/netinfo";
import { getRandomBytes } from "expo-crypto";
import { createSyncEngine } from "./syncEngine";
import { getLocalSyncStore, isDatabaseReady, onLocalChange } from "./localStore";

// ==========================================
// 🌐 API URL RESOLVER
// EXPO_PUBLIC_API_URL (e.g. https://<service>.onrender.com) wins; dev builds fall back to the
// local backend on port 5000.
// ==========================================

const getApiUrl = () => {
  const configured = (process.env.EXPO_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (__DEV__) {
    if (Platform.OS === "web") return "http://localhost:5000";
    // Expo hostUri format: "192.168.X.X:8081"
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) return `http://${hostUri.split(":")[0]}:5000`;
    return Platform.OS === "android" ? "http://10.0.2.2:5000" : "http://localhost:5000";
  }
  return "";
};

export const API_URL = getApiUrl();

// MongoDB ObjectId format: 4-byte timestamp + 8 random bytes, as 24 hex characters.
const createRemoteId = () =>
  Math.floor(Date.now() / 1000).toString(16).padStart(8, "0") +
  Array.from(getRandomBytes(8), (byte) => byte.toString(16).padStart(2, "0")).join("");

let engine = null;
const getEngine = () => {
  const store = getLocalSyncStore();
  if (!store) return null;
  engine ??= createSyncEngine({
    store,
    fetchImpl: (...args) => fetch(...args),
    apiUrl: API_URL,
    createRemoteId,
    log: (result) => console.log(
      `[Sync] ok=${result.ok} pushed=${result.pushed} pulled=${result.pulled} ` +
      `removed=${result.removed} deleted=${result.deleted} errors=${result.errors.length}`,
      result.errors.length ? result.errors : "",
    ),
  });
  return engine;
};

// ==========================================
// 🔄 SYNC ALL — all eight tables, parent tables first.
// Resolves to { ok, offline, pushed, pulled, removed, deleted, errors[] }; never rejects.
// Concurrent callers share the running pass; changes made during it trigger one more pass.
// ==========================================

let running = null;
let rerun = false;

export const syncAll = () => {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    let result;
    do {
      rerun = false;
      const current = isDatabaseReady() ? getEngine() : null;
      if (!current) {
        return { ok: false, offline: false, pushed: 0, pulled: 0, removed: 0, deleted: 0,
          errors: [{ message: "Local database is not ready" }] };
      }
      try {
        result = await current.syncAll();
      } catch (error) {
        console.error("[Sync] Unexpected sync failure", error);
        result = { ok: false, offline: false, pushed: 0, pulled: 0, removed: 0, deleted: 0,
          errors: [{ message: error?.message || "Unexpected sync failure" }] };
      }
    } while (rerun && result.ok);
    return result;
  })().finally(() => { running = null; });
  return running;
};

const isOnline = (state) => Boolean(state?.isConnected) && state?.isInternetReachable !== false;

/**
 * Syncs when the device comes online and shortly after local changes while online.
 * Returns a cleanup function.
 */
export const startAutoSync = ({ debounceMs = 2000 } = {}) => {
  let online = false;
  let timer = null;
  const schedule = () => {
    if (!online) return;
    clearTimeout(timer);
    timer = setTimeout(() => { syncAll(); }, debounceMs);
  };
  const handleNetwork = (state) => {
    const wasOnline = online;
    online = isOnline(state);
    if (online && !wasOnline) schedule();
  };

  NetInfo.fetch().then(handleNetwork).catch((error) => console.warn("[Sync] NetInfo failed", error));
  const unsubscribeNetwork = NetInfo.addEventListener(handleNetwork);
  const unsubscribeLocal = onLocalChange(schedule);
  return () => {
    clearTimeout(timer);
    unsubscribeNetwork();
    unsubscribeLocal();
  };
};
