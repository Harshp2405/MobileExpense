import { useRef, useState } from "react";
import { Alert, Platform, Text, TouchableOpacity, View } from "react-native";
import {
  exportPortableFile, importPortableBackup, pickPortableBackup,
} from "../lib/backup/portableService";
import { ExportCancelledError } from "../lib/utils/publicStorage";

export default function DatabaseTransfer() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(null);
  const running = useRef(false);

  const run = async (action) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
    } catch (error) {
      if (error instanceof ExportCancelledError) setMessage("Export canceled.");
      else {
        console.error("Database transfer failed", error);
        setFailed(true);
        setMessage(error.message || "Database transfer failed");
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const merge = (backup) => run(async () => {
    const counts = importPortableBackup(backup);
    setPending(null);
    setMessage(`Import complete. ${Object.entries(counts).map(
      ([table, count]) => `${table}: ${count.added} added, ${count.skipped} skipped`,
    ).join("; ")}. Reopen other screens to refresh their data.`);
  });

  const pick = () => run(async () => {
    const backup = await pickPortableBackup();
    if (!backup) return;
    setPending(backup);
  });

  const confirm = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Merge this backup? Existing records win conflicts. Receipt files are not included.")) {
        merge(pending);
      }
    } else {
      Alert.alert("Import Database", "Merge this backup? Existing records win conflicts. Receipt files are not included.", [
        { text: "Cancel", style: "cancel" },
        { text: "Merge", onPress: () => merge(pending) },
      ]);
    }
  };

  return (
    <View className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-gray-100 dark:border-zinc-700 mb-5">
      <Text className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
        Import / Export Database
      </Text>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Portable JSON: expenses, categories, subcategories, fuel, income, accounts,
        transfers and budgets. Merge keeps existing records. Export a safety copy
        first. Receipt image files, app settings and login credentials are not included.
        Backups contain unencrypted financial data; store them privately.
      </Text>
      <View className="flex-row gap-3">
        <TouchableOpacity disabled={busy} onPress={() => run(async () => {
          setMessage(await exportPortableFile());
        })} className="flex-1 bg-blue-600 rounded-xl py-3 items-center">
          <Text className="font-bold text-white">{busy ? "Working..." : "Export Database"}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={pick} className="flex-1 bg-emerald-600 rounded-xl py-3 items-center">
          <Text className="font-bold text-white">Import Database</Text>
        </TouchableOpacity>
      </View>
      {pending ? (
        <View className="mt-4">
          <Text className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            Selected backup: {Object.entries(pending.tables).map(
              ([table, rows]) => `${table}: ${rows.length}`,
            ).join(", ")}.
          </Text>
          <TouchableOpacity disabled={busy} onPress={confirm} className="bg-blue-600 rounded-xl py-3 items-center">
            <Text className="text-white font-bold">Confirm Merge</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => setPending(null)} className="py-3 items-center">
            <Text className="text-gray-500 dark:text-gray-400">Cancel import</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {message ? (
        <Text accessibilityRole={failed ? "alert" : undefined} className={`mt-3 text-sm ${failed ? "text-red-600" : "text-gray-700 dark:text-gray-300"}`}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
