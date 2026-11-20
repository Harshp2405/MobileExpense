// Platform selection for the sync store, plus a tiny local-change event used to trigger auto-sync.
// Kept free of network code so queries.js can import it without a cycle.
import { Platform } from "react-native";
import { expoDb } from "../db/client";
import { expoSqliteDriver } from "../db/syncMigrations";
import { createSqliteStore, createWebStore } from "./syncStores";

let store = null;
let databaseReady = false;
const listeners = new Set();

export const getLocalSyncStore = () => {
  if (store) return store;
  if (expoDb) store = createSqliteStore(expoSqliteDriver(expoDb));
  else if (Platform.OS === "web" && typeof localStorage !== "undefined") store = createWebStore(localStorage);
  return store;
};

export const markDatabaseReady = () => { databaseReady = true; };
export const isDatabaseReady = () => databaseReady;

export const onLocalChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Call after any user-initiated local write so a pending change is uploaded soon when online.
export const notifyLocalChange = () => {
  for (const listener of listeners) {
    try { listener(); } catch (error) { console.warn("[Sync] change listener failed", error); }
  }
};

// Records a server delete for a row the user removed locally (no-op for never-synced rows).
export const queueRemoteDelete = (entity, row) => {
  if (row?.remoteId) getLocalSyncStore()?.queueDelete(entity, String(row.remoteId));
};
