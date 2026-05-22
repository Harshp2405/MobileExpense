import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";

import { Platform } from "react-native";

let expoDb;
try {
  // Open the SQLite database synchronously
  expoDb = SQLite.openDatabaseSync("expense_v2.db");
} catch (e) {
  if (Platform.OS === "web") {
    console.warn("SQLite on Web requires SharedArrayBuffer which is missing in this context. Database is disabled for this web session.");
  } else {
    throw e;
  }
}

// Initialize Drizzle ORM only if db opened successfully
export const db = expoDb ? drizzle(expoDb) : null;
export { expoDb };
