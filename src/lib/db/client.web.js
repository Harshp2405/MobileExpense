// Web database client: SQLite is disabled on web; the app uses localStorage fallback.
// This prevents Metro from bundling expo-sqlite web-worker chunks into the web build.
export const db = null;
export const expoDb = null;
