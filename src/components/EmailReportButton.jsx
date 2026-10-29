import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { sendReportViaResend } from "../lib/email/resendReportService";
import * as storage from "../lib/utils/storage";

const STORAGE_KEY_RECIPIENT = "user_report_recipient_email";

export default function EmailReportButton({ monthKey, monthName, year }) {
  const [visible, setVisible] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [successInfo, setSuccessInfo] = useState(null);
  const sendingRef = useRef(false);

  // Load remembered recipient address on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.getItem(STORAGE_KEY_RECIPIENT);
        if (saved && typeof saved === "string") {
          setRecipient(saved.trim());
        }
      } catch (e) {
        console.warn("Could not load saved recipient email", e);
      }
    })();
  }, []);

  const openModal = () => {
    setFormError("");
    setSuccessInfo(null);
    setStatusMessage("");
    setVisible(true);
  };

  const closeModal = () => {
    if (sendingRef.current) return;
    setVisible(false);
    setFormError("");
    setSuccessInfo(null);
  };

  /**
   * Helper: Gather expense and fuel records for the month from local SQLite
   */
  const gatherReportData = async () => {
    const [expenses, fuelLogs] = await Promise.all([
      getExpensesByMonth(monthKey),
      getFuelLogsByMonth(monthKey),
    ]);

    if (expenses.length === 0 && fuelLogs.length === 0) {
      throw new Error(
        `No expenses or fuel records found for ${monthName} ${year}.`
      );
    }

    const totalSpent = expenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );
    const fuelTotal = fuelLogs.reduce(
      (sum, item) => sum + Number(item.totalCost || 0),
      0
    );

    return {
      expenses,
      fuelLogs,
      monthName,
      year,
      totalSpent,
      fuelTotal,
      combinedTotal: totalSpent + fuelTotal,
    };
  };

  /**
   * 📱 Method B (PRIMARY): Open in Device Mail App (Draft / Offline Queue)
   * Generates the PDF from local SQLite and hands it to the native mail client.
   * If offline, Gmail/Outlook queues it in Outbox and auto-sends once online.
   */
  const handleOpenNativeDraft = async () => {
    if (sendingRef.current) return;
    const address = recipient.trim();
    if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(address)) {
      setFormError("Enter a valid recipient email address.");
      return;
    }

    sendingRef.current = true;
    setLoading(true);
    setFormError("");
    setSuccessInfo(null);

    let tempUri = null;
    try {
      await storage.setItem(STORAGE_KEY_RECIPIENT, address);
      setStatusMessage("Reading local records...");
      const report = await gatherReportData();

      const subject = `Expense and Fuel Report - ${monthName} ${year}`;
      const body = [
        `Expense and fuel report for ${monthName} ${year}.`,
        `Expenses: INR ${report.totalSpent.toFixed(2)} (${report.expenses.length} records)`,
        `Fuel Total: INR ${report.fuelTotal.toFixed(2)} (${report.fuelLogs.length} logs)`,
        `Combined Total: INR ${report.combinedTotal.toFixed(2)}`,
        "",
        "Attached PDF contains complete breakdown, categories, and fuel efficiency stats.",
        "Generated directly from local device storage.",
      ].join("\n");

      if (Platform.OS === "web") {
        setStatusMessage("Downloading PDF report...");
        const { downloadEmailReport } = await import(
          "../lib/utils/downloadEmailReport"
        );
        const fileName = await downloadEmailReport(report);
        const mailtoUrl = `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(
          subject
        )}&body=${encodeURIComponent(body)}`;

        try {
          await Linking.openURL(mailtoUrl);
        } catch (_) {
          // If mailto handler not found, user has the downloaded PDF
        }

        setSuccessInfo({
          type: "web",
          message: `PDF "${fileName}" downloaded. Draft opened in mail client.`,
        });
        return;
      }

      if (!(await MailComposer.isAvailableAsync())) {
        Alert.alert(
          "Email App Unavailable",
          "No configured email app (like Gmail or Outlook) was detected on this device. Please install or set up an email app, or use Resend direct delivery."
        );
        return;
      }

      setStatusMessage("Generating PDF report...");
      const { uri } = await createReportPDF(report);
      tempUri = uri;

      setStatusMessage("Opening email composer...");
      await MailComposer.composeAsync({
        recipients: [address],
        subject,
        body,
        attachments: [uri],
      });

      closeModal();
    } catch (err) {
      console.error("Failed to open mail draft", err);
      setFormError(err.message || "Could not prepare the email draft.");
    } finally {
      if (tempUri) {
        try {
          await FileSystem.deleteAsync(tempUri, { idempotent: true });
        } catch (_) {}
      }
      sendingRef.current = false;
      setLoading(false);
      setStatusMessage("");
    }
  };

  /**
   * 🚀 Secondary Option: Direct Send via Resend (Requires Internet)
   */
  const handleSendViaResend = async () => {
    if (sendingRef.current) return;
    const address = recipient.trim();
    if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(address)) {
      setFormError("Enter a valid recipient email address.");
      return;
    }

    sendingRef.current = true;
    setLoading(true);
    setFormError("");
    setSuccessInfo(null);

    let tempPdfUri = null;
    try {
      await storage.setItem(STORAGE_KEY_RECIPIENT, address);
      setStatusMessage("Reading local records...");
      const report = await gatherReportData();

      setStatusMessage("Generating PDF report...");
      let pdfResult;
      if (Platform.OS === "web") {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(
          `Monthly Expense & Fuel Report - ${monthName} ${year}`,
          15,
          20
        );
        doc.setFontSize(11);
        doc.text(`Expenses: INR ${report.totalSpent.toFixed(2)}`, 15, 30);
        doc.text(`Fuel: INR ${report.fuelTotal.toFixed(2)}`, 15, 38);
        doc.text(
          `Combined Total: INR ${report.combinedTotal.toFixed(2)}`,
          15,
          46
        );
        pdfResult = doc;
      } else {
        const { uri } = await createReportPDF(report);
        tempPdfUri = uri;
        pdfResult = uri;
      }

      setStatusMessage("Sending email via Resend...");
      const sendRes = await sendReportViaResend({
        recipient: address,
        monthName,
        year,
        reportData: report,
        pdfResult,
      });

      setSuccessInfo({
        type: "resend",
        emailId: sendRes.emailId,
        recipient: sendRes.recipient,
        message: `Delivered to ${sendRes.recipient} via Resend!`,
      });
    } catch (err) {
      console.error("Resend send failed", err);
      setFormError(
        err.message ||
          "Failed to deliver email. Check your internet connection or use Draft mode."
      );
    } finally {
      if (tempPdfUri) {
        try {
          await FileSystem.deleteAsync(tempPdfUri, { idempotent: true });
        } catch (_) {}
      }
      sendingRef.current = false;
      setLoading(false);
      setStatusMessage("");
    }
  };

  return (
    <>
      {/* Trigger Button on Screen */}
      <TouchableOpacity
        onPress={openModal}
        accessibilityLabel={`Email report for ${monthName} ${year}`}
        className="flex-row items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900 rounded-xl py-3 mb-5"
      >
        <Ionicons name="mail-outline" size={20} color="#2563EB" />
        <Text className="text-sm font-bold text-blue-600 dark:text-blue-400">
          Email Report
        </Text>
      </TouchableOpacity>

      {/* Modal Dialog */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View className="flex-1 justify-center bg-black/60 px-5">
            <View className="bg-white dark:bg-zinc-800 rounded-2xl p-6 shadow-xl border border-gray-100 dark:border-zinc-700">
              {/* Modal Header */}
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Email Report
                </Text>
                <TouchableOpacity
                  onPress={closeModal}
                  disabled={loading}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={22} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <Text className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Period:{" "}
                <Text className="font-semibold text-gray-700 dark:text-gray-300">
                  {monthName} {year}
                </Text>
                . Generated from local SQLite data.
              </Text>

              {/* Recipient Input */}
              <Text className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                Recipient Email
              </Text>
              <TextInput
                value={recipient}
                onChangeText={(val) => {
                  setRecipient(val);
                  setFormError("");
                }}
                editable={!loading}
                accessibilityLabel="Recipient email"
                placeholder="your-email@example.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-gray-900 dark:text-gray-100 mb-4 text-sm bg-gray-50 dark:bg-zinc-900/50"
              />

              {/* Offline notice badge */}
              <View className="flex-row items-center gap-1.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl p-3 mb-4">
                <Ionicons name="cloud-offline-outline" size={16} color="#2563EB" />
                <Text className="text-xs text-blue-700 dark:text-blue-300 flex-1">
                  Draft mode works offline. Your email app (Gmail/Outlook) will queue
                  the email and send it as soon as your device is online.
                </Text>
              </View>

              {/* Error Alert */}
              {formError ? (
                <View className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-3 mb-4">
                  <Text className="text-xs text-red-600 dark:text-red-400 font-medium">
                    {formError}
                  </Text>
                </View>
              ) : null}

              {/* Success Alert */}
              {successInfo ? (
                <View className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl p-3 mb-4">
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#16A34A"
                    />
                    <Text className="text-xs font-bold text-green-700 dark:text-green-300">
                      Success!
                    </Text>
                  </View>
                  <Text className="text-xs text-green-600 dark:text-green-400">
                    {successInfo.message}
                  </Text>
                </View>
              ) : null}

              {/* Progress Indicator */}
              {loading ? (
                <View className="flex-row items-center justify-center gap-2 py-3 mb-2">
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {statusMessage || "Preparing report..."}
                  </Text>
                </View>
              ) : null}

              {/* PRIMARY ACTION: Method B - Open in Device Mail App (Draft / Queue) */}
              <TouchableOpacity
                onPress={handleOpenNativeDraft}
                disabled={loading}
                className={`rounded-xl py-3.5 items-center mb-2.5 flex-row justify-center gap-2 ${
                  loading
                    ? "bg-blue-400"
                    : "bg-blue-600 active:bg-blue-700"
                }`}
              >
                <Ionicons name="mail-open-outline" size={18} color="#FFFFFF" />
                <Text className="font-bold text-white text-sm">
                  {loading
                    ? "Preparing Draft..."
                    : Platform.OS === "web"
                    ? "Download PDF & Open Draft"
                    : "Open in Mail App (Draft)"}
                </Text>
              </TouchableOpacity>

              {/* OPTIONAL SECONDARY ACTION: Direct Send via Resend (Mobile Native Only) */}
              {Platform.OS !== "web" ? (
                <TouchableOpacity
                  onPress={handleSendViaResend}
                  disabled={loading}
                  className="rounded-xl py-2.5 items-center mb-2 border border-gray-200 dark:border-zinc-700 active:bg-gray-50 dark:active:bg-zinc-700 flex-row justify-center gap-1.5"
                >
                  <Ionicons name="paper-plane-outline" size={14} color="#6B7280" />
                  <Text className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Or Send Directly via Resend (Requires Internet)
                  </Text>
                </TouchableOpacity>
              ) : null}

              {/* Close Button */}
              <TouchableOpacity
                onPress={closeModal}
                disabled={loading}
                className="py-2 items-center"
              >
                <Text className="text-xs text-gray-400">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
