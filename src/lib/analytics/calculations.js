export const sum = (arr, key = "amount") =>
  arr.reduce((acc, item) => acc + (Number(item[key]) || 0), 0);

// Every division in the analytics layer goes through this — guarantees no NaN/Infinity.
export const safeDiv = (a, b, fallback = 0) =>
  !b || Number.isNaN(b) ? fallback : a / b;

export const average = (arr, key = "amount") =>
  safeDiv(sum(arr, key), arr.length);

// Returns null (not 0, not NaN) when there is no baseline to compare against —
// callers must render "—" instead of a misleading "0%".
export const pctChange = (current, previous) => {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

export const formatCurrency = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const formatPct = (n) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

// Groups rows by a derived key, returning a sorted [{ name, total, count, items }] list.
export const groupBy = (txns, keyFn, fallbackName = "Uncategorized") => {
  const map = {};
  txns.forEach((t) => {
    const key = keyFn(t) || fallbackName;
    if (!map[key]) map[key] = { name: key, total: 0, count: 0, items: [] };
    map[key].total += Number(t.amount) || 0;
    map[key].count += 1;
    map[key].items.push(t);
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
};

export const withPercentages = (groups) => {
  const total = groups.reduce((acc, g) => acc + g.total, 0);
  return groups.map((g) => ({
    ...g,
    percentage: safeDiv(g.total, total) * 100,
  }));
};
