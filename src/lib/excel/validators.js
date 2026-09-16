export const normalizeHeader = (header) =>
  header.trim().toLowerCase().replace(/\s+/g, "_");

export const validMethods = ["Cash", "Card", "UPI", "Other"];

export const validateExpenseRow = (row) => {
  const errors = [];

  if (!row.title || !String(row.title).trim()) {
    errors.push("Title is required");
  }

  const amount = Number(row.amount);
  if (!row.amount || Number.isNaN(amount) || amount <= 0) {
    errors.push("Amount must be a valid positive number");
  }

  if (!row.category || !String(row.category).trim()) {
    errors.push("Category is required");
  }

  if (row.method && !validMethods.includes(row.method)) {
    errors.push("Method must be Cash, Card, UPI, or Other");
  }

  if (row.date && !/^\d{2}\/\d{2}\/\d{4}$/.test(row.date)) {
    errors.push("Date must be in DD/MM/YYYY format");
  }

  if (row.month && !/^\d{4}-\d{2}$/.test(row.month)) {
    errors.push("Month must be in yyyy-MM format");
  }

  return errors;
};
