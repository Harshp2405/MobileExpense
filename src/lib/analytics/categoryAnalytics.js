import { groupBy, withPercentages } from "./calculations";

export const CATEGORY_FALLBACK = "Uncategorized";
export const SUBCATEGORY_FALLBACK = "Unspecified";

export const categoryBreakdown = (expenses) =>
  withPercentages(groupBy(expenses, (e) => e.category, CATEGORY_FALLBACK));

// Scoped to a single parent so subcategories from different parents never mix.
export const subcategoryBreakdown = (expenses, categoryName) => {
  const scoped = expenses.filter(
    (e) => (e.category || CATEGORY_FALLBACK) === categoryName,
  );
  return withPercentages(
    groupBy(scoped, (e) => e.subcategory, SUBCATEGORY_FALLBACK),
  );
};

// Full nested tree — used by the drill-down UI and reports.
export const categoryTree = (expenses) =>
  categoryBreakdown(expenses).map((cat) => ({
    ...cat,
    subcategories: subcategoryBreakdown(expenses, cat.name),
  }));

export const topCategory = (expenses) => categoryBreakdown(expenses)[0] || null;

// Applies the category/subcategory filters. Subcategory only applies within its parent.
export const applyCategoryFilter = (txns, { category, subcategory }) => {
  let out = txns;
  if (category)
    out = out.filter((t) => (t.category || CATEGORY_FALLBACK) === category);
  if (subcategory)
    out = out.filter(
      (t) => (t.subcategory || SUBCATEGORY_FALLBACK) === subcategory,
    );
  return out;
};
