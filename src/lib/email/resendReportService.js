// C:\Harsh\Expense\Mobile\src\lib\email\resendReportService.js
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";

/**
 * Configuration & Keys
 * Reads from environment variables.
 */
const RESEND_API_KEY =
  process.env.RESEND_API_KEY ||
  process.env.EXPO_PUBLIC_RESEND_API_KEY ||
  "";

const REPORT_FROM_EMAIL =
  process.env.REPORT_FROM_EMAIL ||
  process.env.EXPO_PUBLIC_REPORT_FROM_EMAIL ||
  "Expense Tracker <onboarding@resend.dev>";

/**
 * Currency formatter (INR)
 */
export const formatINR = (val) =>
  `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Resolves the server-side API Route URL for Expo Router.
 * Implements the server architecture shown in "How to send emails with Resend from your Expo app".
 * - On Web: relative "/api/send-email" (same origin)
 * - On Native: resolves dev host IP or EXPO_PUBLIC_API_URL in production
 */
export const getSendEmailApiUrl = () => {
  if (Platform.OS === "web") {
    return "/api/send-email";
  }

  if (__DEV__) {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const ip = hostUri.split(":")[0];
      return `http://${ip}:8081/api/send-email`;
    }
    return Platform.OS === "android"
      ? "http://10.0.2.2:8081/api/send-email"
      : "http://localhost:8081/api/send-email";
  }

  const base = process.env.EXPO_PUBLIC_API_URL || "";
  return base ? `${base}/api/send-email` : "/api/send-email";
};

/**
 * Builds a clean, responsive HTML email body with stats cards and payment breakdown.
 */
export function buildReportHtml({
  monthName,
  year,
  totalSpent,
  fuelTotal,
  combinedTotal,
  expensesCount,
  fuelCount,
  methodTotals = {},
}) {
  const methodRows = Object.entries(methodTotals)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([method, amt]) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; color: #374151; font-size: 14px;">${method}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; color: #111827; font-weight: 600; text-align: right; font-size: 14px;">${formatINR(amt)}</td>
      </tr>
    `
    )
    .join("");

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Expense & Fuel Report - ${monthName} ${year}</title>
  </head>
  <body style="margin: 0; padding: 24px; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%); padding: 32px 24px; color: #FFFFFF; text-align: center;">
        <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">Monthly Summary</h1>
        <p style="margin: 0; font-size: 16px; opacity: 0.9;">${monthName} ${year}</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 24px;">
        
        <!-- Summary Cards Grid -->
        <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 24px;">
          <tr>
            <td style="background-color: #EFF6FF; border: 1px solid #DBEAFE; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1D4ED8; margin-bottom: 4px;">Expenses</div>
              <div style="font-size: 16px; font-weight: 800; color: #1E3A8A;">${formatINR(totalSpent)}</div>
              <div style="font-size: 11px; color: #60A5FA; margin-top: 2px;">${expensesCount} items</div>
            </td>
            <td style="background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #B45309; margin-bottom: 4px;">Fuel</div>
              <div style="font-size: 16px; font-weight: 800; color: #78350F;">${formatINR(fuelTotal)}</div>
              <div style="font-size: 11px; color: #F59E0B; margin-top: 2px;">${fuelCount} logs</div>
            </td>
            <td style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #047857; margin-bottom: 4px;">Total</div>
              <div style="font-size: 16px; font-weight: 800; color: #064E3B;">${formatINR(combinedTotal)}</div>
              <div style="font-size: 11px; color: #34D399; margin-top: 2px;">Combined</div>
            </td>
          </tr>
        </table>

        ${
          methodRows
            ? `
          <!-- Payment Methods Breakdown -->
          <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #111827;">Spending by Payment Method</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            ${methodRows}
          </table>
        `
            : ""
        }

        <!-- Attachment Notice Box -->
        <div style="background-color: #F9FAFB; border: 1px dashed #D1D5DB; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #374151;">
            📎 Detailed PDF Report Attached
          </p>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #6B7280;">
            The attached document includes full category breakdowns, notes, and individual fuel fill-up efficiency stats.
          </p>
        </div>

        <p style="margin: 0; font-size: 12px; color: #9CA3AF; text-align: center;">
          Sent securely via Personal Expense Tracker &bull; Powered by Resend
        </p>
      </div>
    </div>
  </body>
  </html>
  `;
}

/**
 * Converts a generated PDF URI (Native) or Blob/ArrayBuffer (Web) into a Base64 string.
 */
export async function getPdfBase64(pdfResult) {
  if (Platform.OS === "web") {
    if (typeof pdfResult === "string") {
      return pdfResult.includes(",") ? pdfResult.split(",")[1] : pdfResult;
    }
    if (pdfResult && typeof pdfResult.output === "function") {
      const dataUri = pdfResult.output("datauristring");
      return dataUri.split(",")[1];
    }
    throw new Error("Invalid Web PDF result format");
  }

  // Native: expo-print returns { uri }
  const fileUri = pdfResult?.uri || pdfResult;
  if (!fileUri || typeof fileUri !== "string") {
    throw new Error("No PDF file URI provided for native platform");
  }

  const base64Data = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64Data;
}

/**
 * Dispatches an email with an attached PDF via Resend.
 * Uses the secure Expo Router API Route pattern from "How to send emails with Resend from your Expo app".
 */
export async function sendReportViaResend({
  recipient,
  monthName,
  year,
  reportData,
  pdfResult,
  customApiKey = null,
}) {
  const cleanRecipient = recipient?.trim().toLowerCase();
  if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(cleanRecipient)) {
    throw new Error("Please enter a valid recipient email address.");
  }

  // 1. Calculate payment method breakdown
  const methodTotals = {};
  for (const exp of reportData.expenses || []) {
    const m = exp.method || "Cash";
    methodTotals[m] = (methodTotals[m] || 0) + Number(exp.amount || 0);
  }

  // 2. Generate Base64 from PDF
  const base64Content = await getPdfBase64(pdfResult);
  if (!base64Content) {
    throw new Error("Failed to encode PDF report as Base64.");
  }

  // 3. Build HTML Body
  const html = buildReportHtml({
    monthName,
    year,
    totalSpent: reportData.totalSpent,
    fuelTotal: reportData.fuelTotal,
    combinedTotal: reportData.combinedTotal,
    expensesCount: (reportData.expenses || []).length,
    fuelCount: (reportData.fuelLogs || []).length,
    methodTotals,
  });

  const filename = `Expense_and_Fuel_Report_${monthName}_${year}.pdf`;
  const subject = `Monthly Expense & Fuel Report - ${monthName} ${year}`;

  const payload = {
    to: cleanRecipient,
    subject,
    html,
    attachments: [
      {
        filename,
        content: base64Content,
      },
    ],
  };

  // 4. Primary: Dispatch via Expo Router Server API Route (/api/send-email)
  const apiUrl = getSendEmailApiUrl();
  let useFallback = false;

  try {
    console.log(`[resendReportService] Calling server API route: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok && (data.success || data.id || data.data?.id)) {
      return {
        success: true,
        emailId: data.id || data.data?.id || "accepted",
        recipient: cleanRecipient,
      };
    } else {
      if (response.status === 400 || response.status === 422) {
        throw new Error(data?.error || data?.message || "Email rejected by server");
      }
      useFallback = true;
    }
  } catch (err) {
    if (
      err.message &&
      !err.message.includes("Network request failed") &&
      !err.message.includes("Failed to fetch")
    ) {
      throw err;
    }
    console.warn(`[resendReportService] API route call failed (${err.message}). Checking direct fallback...`);
    useFallback = true;
  }

  // 5. Fallback: Direct Resend API if API route is unreachable and client key is present
  const apiKey = customApiKey || RESEND_API_KEY;
  if (useFallback && apiKey && apiKey.startsWith("re_")) {
    console.log("[resendReportService] Using direct Resend API fallback...");
    const directRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: REPORT_FROM_EMAIL,
        to: [cleanRecipient],
        subject,
        html,
        attachments: [
          {
            filename,
            content: base64Content,
          },
        ],
      }),
    });

    const directData = await directRes.json();
    if (!directRes.ok) {
      const errorMsg =
        directData?.message ||
        directData?.error?.message ||
        directRes.statusText;
      throw new Error(`Resend Error: ${errorMsg}`);
    }

    return {
      success: true,
      emailId: directData.id,
      recipient: cleanRecipient,
    };
  }

  throw new Error("Unable to deliver email. Please check your network and Resend credentials.");
}
