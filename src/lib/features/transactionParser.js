const AMOUNT_PATTERN = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;

export function parseTransactionText(input) {
  const text = String(input || "").trim();
  if (!text) return { success: false, error: "Clipboard is empty" };

  const amountMatch = text.match(AMOUNT_PATTERN);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "No valid amount found" };
  }

  const method = /\bupi\b/i.test(text)
    ? "UPI"
    : /credit card|debit card/i.test(text)
      ? "Card"
      : "Other";

  const titleMatch = text.match(
    /(?:^|\n)\s*To\s+([^\r\n]+)|(?:at|paid to|spent on)\s+([A-Za-z0-9 &.'-]{2,80})/i,
  );

  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);

  return {
    success: true,
    data: {
      title: titleMatch?.[1]?.trim() || titleMatch?.[2]?.trim() || "Imported transaction",
      amount,
      method,
      date: dateMatch?.[1] || null,
      description: text.slice(0, 500),
    },
  };
}
