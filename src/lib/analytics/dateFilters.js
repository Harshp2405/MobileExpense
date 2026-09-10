// The app stores expense.date as "DD/MM/YYYY" (see (tabs)/index.jsx handleSave) but
// falls back to ISO "yyyy-MM-dd" in some code paths. createdAt is always ISO.
export const toDate = (txn) => {
  const raw = txn?.date;
  if (typeof raw === "string") {
    if (raw.includes("/")) {
      const [dd, mm, yyyy] = raw.split("/");
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (!Number.isNaN(d.getTime())) return d;
    } else if (raw.includes("-")) {
      const d = new Date(`${raw}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  // Fallbacks: createdAt, then month key, then epoch-safe null
  if (txn?.createdAt) {
    const d = new Date(txn.createdAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (txn?.month) {
    const [y, m] = txn.month.split("-");
    return new Date(Number(y), Number(m) - 1, 1);
  }
  return null;
};

export const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const dayKey = (d) =>
  `${monthKey(d)}-${String(d.getDate()).padStart(2, "0")}`;

// Local-midnight boundaries — avoids UTC/timezone drift entirely.
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const PERIODS = ["today", "week", "month", "year", "custom"];

// Returns { start, end, label } for a period. `now` is injectable for testability.
export const resolvePeriod = (period, now = new Date(), custom = {}) => {
  switch (period) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now), label: "Today" };
    case "week": {
      // Week starts Monday
      const day = (now.getDay() + 6) % 7;
      const start = startOfDay(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - day),
      );
      const end = endOfDay(
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6),
      );
      return { start, end, label: "This Week" };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)); // day 0 = last day, leap-year safe
      return { start, end, label: "This Month" };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = endOfDay(new Date(now.getFullYear(), 11, 31));
      return { start, end, label: String(now.getFullYear()) };
    }
    case "custom": {
      const start = custom.start
        ? startOfDay(new Date(custom.start))
        : startOfDay(now);
      const end = custom.end ? endOfDay(new Date(custom.end)) : endOfDay(now);
      return { start, end, label: "Custom" };
    }
    default:
      return resolvePeriod("month", now);
  }
};

export const inRange = (txn, start, end) => {
  const d = toDate(txn);
  return !!d && d >= start && d <= end;
};

export const filterByPeriod = (txns, period, now = new Date(), custom = {}) => {
  const { start, end } = resolvePeriod(period, now, custom);
  return txns.filter((t) => inRange(t, start, end));
};

// Inclusive day count, minimum 1 — prevents divide-by-zero in "average per day".
export const daysBetween = (start, end) =>
  Math.max(1, Math.round((endOfDay(end) - startOfDay(start)) / 86400000) + 1);

export const previousMonthKey = (key) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return monthKey(d);
};

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
