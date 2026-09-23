import { Platform } from "react-native";

export async function extractReceiptFields(imageUri) {
  if (!imageUri) {
    return { success: false, error: "Receipt image is missing" };
  }
  if (Platform.OS === "web") {
    return { success: false, error: "Receipt OCR is available in the mobile app" };
  }

  try {
    const { default: TextRecognition } = await import(
      "@react-native-ml-kit/text-recognition"
    );
    const result = await TextRecognition.recognize(imageUri);
    const text = String(result?.text || "").trim();
    if (!text) return { success: false, error: "No text found in receipt" };

    const amountMatch = text.match(
      /(?:total|amount|net|grand total|Net Amount|Net Total)[^\d]{0,20}([\d,]+(?:\.\d{1,2})?)/i,
    );
    const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      success: true,
      data: {
        title: lines[0]?.slice(0, 80) || "Receipt expense",
        amount: amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null,
        date: dateMatch?.[1] || null,
        rawText: text.slice(0, 5000),
      },
    };
  } catch (error) {
    console.error("[receiptOcr.extractReceiptFields] OCR failed", error);
    return { success: false, error: "Unable to read this receipt" };
  }
}
