import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  remoteId: text("remote_id"),
  title: text("title").notNull(),
  amount: real("amount").notNull(),
  category: text("category"),
  accountId: integer("account_id"),
  subcategory: text("subcategory"), // denormalized name, mirrors existing `category` string pattern; NULL = no subcategory (backward compatible)
  date: text("date"),
  description: text("description"),
  month: text("month").notNull(),
  method: text("method"),
  imageUri: text("image_uri"), // <-- NEW: Stores local file URI or Cloud Storage URL
  syncStatus: text("sync_status").default("pending"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const subcategories = sqliteTable("subcategories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id").notNull()
  .references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  remoteId: text("remote_id"),
  amount: real("amount").notNull(),
  month: text("month").notNull().unique(),
  syncStatus: text("sync_status").default("pending"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const fuelLogs = sqliteTable("fuel_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  remoteId: text("remote_id"),
  startKm: real("start_km").notNull(),
  odometerKm: real("odometer_km"),
  litres: real("litres").notNull(),
  pricePerLitre: real("price_per_litre").notNull(),
  totalCost: real("total_cost").notNull(),
  date: text("date").notNull(),
  month: text("month").notNull(),
  note: text("note"),
  syncStatus: text("sync_status").default("pending"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const income = sqliteTable("income", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  remoteId: text("remote_id"),
  title: text("title").notNull(),
  amount: real("amount").notNull(),
  accountId: integer("account_id"),
  source: text("source"), // e.g. Salary, Freelance, Interest
  date: text("date"), // "DD/MM/YYYY" — same convention as expenses
  description: text("description"),
  month: text("month").notNull(), // "yyyy-MM"
  method: text("method"), // Cash / Card / UPI / Other — mirrors expenses
  syncStatus: text("sync_status").default("pending"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  type: text("type").notNull().default("Cash"), // Cash | Bank | Card | UPI | Wallet
  color: text("color"),
  initialBalance: real("initial_balance").notNull().default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const transfers = sqliteTable("transfers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromAccountId: integer("from_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  toAccountId: integer("to_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  date: text("date"),
  month: text("month").notNull(),
  note: text("note"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
