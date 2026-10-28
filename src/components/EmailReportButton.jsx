import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as MailComposer from "expo-mail-composer";
import * as FileSystem from "expo-file-system/legacy";
import { getExpensesByMonth, getFuelLogsByMonth } from "../lib/db/queries";
import { createReportPDF } from "../lib/utils/pdfExporter";

export default function EmailReportButton({ monthKey, monthName, year }) {
  const [visible, setVisible] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [webDraft, setWebDraft] = useState(null);
  const [formError, setFormError] = useState("");
  const sendingRef = useRef(false);

  const close = () => {
    if (sendingRef.current) return;
    setVisible(false);
    setRecipient("");
    setWebDraft(null);
    setFormError("");
  };

  const open = () => {
    setRecipient("");
    setWebDraft(null);
    setFormError("");
    setVisible(true);
  };

  const showError = (title, message) => {
    setFormError(message);
    if (Platform.OS !== "web") Alert.alert(title, message);
  };

  const compose = async () => {
    if (sendingRef.current) return;
    const address = recipient.trim();
    if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(address)) {
      showError("Invalid Email", "Enter one valid recipient email address.");
      return;
    }
    sendingRef.current = true;
    setBusy(true);
    setFormError("");
    setWebDraft(null);
    let temporaryUri;
    try {
      if (Platform.OS !== "web" && !(await MailComposer.isAvailableAsync())) {
        Alert.alert(
          "Email Unavailable",
          "Install and configure an email app on this device, then try again.",
        );
        return;
      }
      const [expenses, fuelLogs] = await Promise.all([
        getExpensesByMonth(monthKey),
        getFuelLogsByMonth(monthKey),
      ]);
      if (expenses.length === 0 && fuelLogs.length === 0) {
        showError("Nothing to Email", "No expenses or fuel logs were found for this month.");
        return;
      }
      const totalSpent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
      const fuelTotal = fuelLogs.reduce((sum, item) => sum + Number(item.totalCost), 0);
      if (!Number.isFinite(totalSpent) || !Number.isFinite(fuelTotal)) {
        throw new Error("Report contains an invalid amount");
      }
      const report = {
        expenses,
        fuelLogs,
        monthName,
        year,
        totalSpent,
        fuelTotal,
        combinedTotal: totalSpent + fuelTotal,
      };
      const subject = `Expense and Fuel Report - ${monthName} ${year}`;
      const body = [
        `Expense and fuel report for ${monthName} ${year}.`,
        `Expenses: INR ${totalSpent.toFixed(2)}`,
        `Fuel: INR ${fuelTotal.toFixed(2)}`,
        `Combined total: INR ${(totalSpent + fuelTotal).toFixed(2)}`,
        "",
        Platform.OS === "web"
          ? "Please manually attach the downloaded PDF before sending."
          : "The attached PDF was generated from this device's local data.",
        "Income is not included. Please review before sending.",
      ].join("\n");
      if (Platform.OS === "web") {
        const { downloadEmailReport } = await import("../lib/utils/downloadEmailReport");
        const fileName = await downloadEmailReport(report);
        setWebDraft({
          fileName,
          url: `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        });
        return;
      }
      const { uri } = await createReportPDF(report);
      temporaryUri = uri;
      await MailComposer.composeAsync({
        recipients: [address],
        subject,
        body,
        attachments: [uri],
      });
      // Composer results do not prove delivery, especially on Android.
      setVisible(false);
      setRecipient("");
    } catch (error) {
      console.error("Failed to prepare report email", error);
      showError("Email Report Failed", "Could not prepare the email report. Please try again.");
    } finally {
      if (temporaryUri) {
        try {
          await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
        } catch (error) {
          console.error("Failed to remove temporary email report", error);
        }
      }
      sendingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={open}
        accessibilityLabel={`Email report for ${monthName} ${year}`}
        className="flex-row items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900 rounded-xl py-3 mb-5"
      >
        <Ionicons name="mail-outline" size={20} color="#2563EB" />
        <Text className="text-sm font-bold text-blue-600 dark:text-blue-400">
          Email Report
        </Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View className="flex-1 justify-center bg-black/50 px-5">
            <View className="bg-white dark:bg-zinc-800 rounded-2xl p-5">
              <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Email Report
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {monthName} {year}: local expenses and fuel logs. Review the PDF
                attachment in your email app and tap Send. Income is not included.
                {Platform.OS === "web"
                  ? " On web, download the PDF, then open a draft and attach the downloaded file manually."
                  : ""}
              </Text>
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Recipient email
              </Text>
              <TextInput
                value={recipient}
                onChangeText={(value) => {
                  setRecipient(value);
                  setWebDraft(null);
                }}
                editable={!busy}
                accessibilityLabel="Recipient email address"
                placeholder="recipient@example.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 mb-4"
              />
              {formError ? (
                <Text accessibilityRole="alert" className="text-red-600 mb-3">
                  {formError}
                </Text>
              ) : null}
              {webDraft ? (
                <View className="mb-4">
                  <Text className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    Download requested: {webDraft.fileName}. Attach it manually in
                    your email app. If no draft opens, configure a default email
                    handler or compose an email in your webmail.
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await Linking.openURL(webDraft.url);
                      } catch (error) {
                        console.error("Could not open email handler", error);
                        showError("Email Unavailable", "Could not open an email app. Open your webmail and attach the downloaded PDF manually.");
                      }
                    }}
                    className="bg-blue-600 rounded-xl py-3 items-center"
                  >
                    <Text className="text-white font-bold">Open Email Draft</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity
                onPress={compose}
                disabled={busy}
                className={`rounded-xl py-3 items-center ${busy ? "bg-blue-300" : "bg-blue-600"}`}
              >
                <Text className="font-bold text-white">
                  {busy ? "Preparing..." : Platform.OS === "web" ? "Download PDF" : "Open Email Draft"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={close} disabled={busy} className="py-3 items-center">
                <Text className="text-gray-500 dark:text-gray-400">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
