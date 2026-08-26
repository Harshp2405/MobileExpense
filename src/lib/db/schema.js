import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  remoteId: text('remote_id'),
  title: text('title').notNull(),
  amount: real('amount').notNull(),
  category: text('category'),
  date: text('date'),
  description: text('description'),
  month: text('month').notNull(),
  method: text('method'),
  syncStatus: text('sync_status').default('pending'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  remoteId: text('remote_id'),
  amount: real('amount').notNull(),
  month: text('month').notNull().unique(),
  syncStatus: text('sync_status').default('pending'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const fuelLogs = sqliteTable("fuel_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startKm: real("start_km").notNull(),
  odometerKm: real("odometer_km").notNull(),
  litres: real("litres").notNull(),
  pricePerLitre: real("price_per_litre").notNull(),
  totalCost: real("total_cost").notNull(),
  date: text("date").notNull(),
  month: text("month").notNull(),
  note: text("note"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
