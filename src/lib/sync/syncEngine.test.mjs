import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createSyncEngine, removeWithCascade } from "./syncEngine.js";
import { createSqliteStore, createWebStore } from "./syncStores.js";
import { migrateDatabase } from "../db/syncMigrations.js";

const sqliteDriver = (db) => ({
  all: (sql, params = []) => db.prepare(sql).all(...params),
  run: (sql, params = []) => Number(db.prepare(sql).run(...params).lastInsertRowid),
  transaction: (fn) => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
});

const nativeDevice = () => {
  const db = new DatabaseSync(":memory:");
  const driver = sqliteDriver(db);
  migrateDatabase(driver);
  return { db, store: createSqliteStore(driver) };
};

class MemoryStorage {
  map = new Map();
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const ROUTES = {
  "/accounts": "accounts", "/categories": "categories", "/subcategories": "subcategories",
  "/expenses": "expenses", "/income": "income", "/transfers": "transfers", "/budget": "budgets",
  "/fuel": "fuelLogs",
};
const NOT_FOUND_ON_MISSING = new Set(["income", "transfers", "accounts", "categories", "subcategories"]);

// In-memory implementation of the backend sync contract (POST /sync, GET /delta, DELETE /:id).
const createFakeServer = () => {
  let clock = 1000;
  let seq = 0;
  const data = Object.fromEntries(Object.values(ROUTES).map((name) => [name, new Map()]));
  const server = { data, offline: false, dropNextAck: false, beforeRespond: null, reject: null };

  const touch = (doc) => { doc.updatedAt = ++clock; return doc; };
  const active = (name) => [...data[name].values()];
  const exists = (name, field, value) => active(name).some((doc) => doc[field] === value);
  const naturalMatch = (name, item) => {
    if (name === "accounts" || name === "categories") return active(name).find((d) => d.name === item.name);
    if (name === "subcategories") {
      return active(name).find((d) => d.categoryName === item.categoryName &&
        d.name.toLowerCase() === String(item.name).toLowerCase());
    }
    if (name === "budgets") return active(name).find((d) => d.month === item.month);
    return null;
  };
  const validate = (name, item) => {
    if (server.reject?.(name, item)) return "Rejected by test";
    for (const field of ["accountName", "fromAccountName", "toAccountName"]) {
      if (item[field] != null && !exists("accounts", "name", item[field])) return `Unknown account ${item[field]}`;
    }
    if (name === "subcategories" && !exists("categories", "name", item.categoryName)) return "Unknown category";
    return null;
  };

  const upsert = (name, item) => {
    const { id, remoteId, ...fields } = item;
    let doc = name === "budgets" ? naturalMatch(name, item)
      : (remoteId && data[name].get(remoteId)) || (!remoteId && naturalMatch(name, item));
    if (!doc) {
      doc = { _id: remoteId || `srv${String(++seq).padStart(21, "0")}` };
      data[name].set(doc._id, doc);
    }
    Object.assign(doc, fields);
    touch(doc);
    return { localId: id, remoteId: doc._id };
  };

  const removeDoc = (name, doc) => {
    data[name].delete(doc._id);
    if (name === "categories") {
      for (const sub of active("subcategories")) if (sub.categoryName === doc.name) data.subcategories.delete(sub._id);
      for (const e of active("expenses")) {
        if (e.category === doc.name) touch(Object.assign(e, { category: "General", subcategory: null }));
      }
    }
    if (name === "accounts") {
      for (const child of ["expenses", "income"]) {
        for (const r of active(child)) if (r.accountName === doc.name) touch(Object.assign(r, { accountName: null }));
      }
      for (const t of active("transfers")) {
        if (t.fromAccountName === doc.name || t.toAccountName === doc.name) data.transfers.delete(t._id);
      }
    }
  };

  const handle = (method, url, body) => {
    const { pathname, searchParams } = new URL(url);
    const [, route, action] = pathname.match(/^(\/[a-z]+)(?:\/(.+))?$/) || [];
    const name = ROUTES[route];
    if (!name) return [404, { message: "Not found" }];
    if (method === "POST" && action === "sync") {
      const syncedIds = [];
      const failed = [];
      for (const item of body[Object.keys(body)[0]]) {
        const error = validate(name, item);
        if (error) failed.push({ localId: item.id, error });
        else syncedIds.push(upsert(name, item));
      }
      return [200, { success: true, syncedIds, failed }];
    }
    if (method === "GET" && action === "delta") {
      const since = Number(searchParams.get("since") || 0);
      const items = name === "budgets" ? active(name) : active(name).filter((d) => d.updatedAt > since);
      return [200, { items: structuredClone(items), timestamp: clock, activeIds: active(name).map((d) => d._id) }];
    }
    if (method === "DELETE" && action) {
      const doc = data[name].get(decodeURIComponent(action));
      if (!doc) return NOT_FOUND_ON_MISSING.has(name) ? [404, { message: "Not found" }] : [200, { success: true }];
      removeDoc(name, doc);
      return [200, { success: true }];
    }
    return [404, { message: "Not found" }];
  };

  server.fetch = async (url, { method, body }) => {
    if (server.offline) throw new TypeError("Network request failed");
    const [status, payload] = handle(method, url, body ? JSON.parse(body) : null);
    await server.beforeRespond?.(method, url);
    if (server.dropNextAck && method === "POST") {
      server.dropNextAck = false;
      throw new TypeError("Connection reset");
    }
    return { status, ok: status >= 200 && status < 300, json: async () => structuredClone(payload) };
  };
  return server;
};

let idCounter = 0;
const engineFor = (store, server) => createSyncEngine({
  store,
  fetchImpl: server.fetch,
  apiUrl: "https://api.test",
  createRemoteId: () => `cli${String(++idCounter).padStart(21, "0")}`,
});

const seedAllTables = (store) => {
  const cash = store.insert("accounts", { name: "Cash", type: "Cash", initialBalance: 0 });
  const bank = store.insert("accounts", { name: "Bank", type: "Bank", color: "#111", initialBalance: 500 });
  const food = store.insert("categories", { name: "Food", color: "#f00" });
  store.insert("subcategories", { categoryId: food, name: "Lunch" });
  store.insert("expenses", {
    title: "Thali", amount: 120, category: "Food", subcategory: "Lunch", accountId: bank,
    date: "01/05/2025", description: "office", month: "2025-05", method: "UPI", imageUri: "file:///x.jpg",
  });
  store.insert("income", { title: "Salary", amount: 9000, accountId: bank, source: "Salary", month: "2025-05" });
  store.insert("transfers", { fromAccountId: bank, toAccountId: cash, amount: 200, date: "02/05/2025", month: "2025-05" });
  store.insert("budgets", { amount: 5000, month: "2025-05" });
  store.insert("fuelLogs", {
    startKm: 100, odometerKm: 400, litres: 10, pricePerLitre: 100, totalCost: 1000, date: "03/05/2025", month: "2025-05",
  });
  return { cash, bank, food };
};

const ENTITY_NAMES = ["accounts", "categories", "subcategories", "expenses", "income", "transfers", "budgets", "fuelLogs"];

test("migrates legacy tables, recovers stranded fuel logs, and is idempotent", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, amount REAL NOT NULL,
      category TEXT, date TEXT, description TEXT, month TEXT NOT NULL, method TEXT, created_at TEXT);
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT, created_at TEXT);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'Cash', color TEXT, initial_balance REAL NOT NULL DEFAULT 0, created_at TEXT);
    CREATE TABLE fuel_logs_old (id INTEGER PRIMARY KEY AUTOINCREMENT, odometer_km REAL NOT NULL, litres REAL NOT NULL,
      price_per_litre REAL NOT NULL, total_cost REAL NOT NULL, date TEXT NOT NULL, month TEXT NOT NULL, note TEXT, created_at TEXT);
    INSERT INTO fuel_logs_old (odometer_km, litres, price_per_litre, total_cost, date, month)
      VALUES (1500, 5, 100, 500, '01/01/2025', '2025-01');
    INSERT INTO expenses (title, amount, month) VALUES ('Old', 10, '2025-01');
  `);
  const driver = sqliteDriver(db);
  migrateDatabase(driver);
  migrateDatabase(driver);

  const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const table of ["expenses", "income", "budgets", "fuel_logs", "accounts", "categories", "subcategories", "transfers"]) {
    assert.ok(columns(table).includes("remote_id"), `${table}.remote_id`);
    assert.ok(columns(table).includes("sync_status"), `${table}.sync_status`);
  }
  assert.ok(columns("expenses").includes("account_id") && columns("expenses").includes("image_uri"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'fuel_logs_old'").get().n, 0);
  const fuel = db.prepare("SELECT * FROM fuel_logs").all();
  assert.equal(fuel.length, 1);
  assert.equal(fuel[0].start_km, 1500);
  assert.equal(fuel[0].sync_status, "pending");
  assert.equal(db.prepare("SELECT sync_status FROM expenses").get().sync_status, "pending");
});

test("round-trips all eight tables between a native and a web device", async () => {
  const server = createFakeServer();
  const a = nativeDevice();
  seedAllTables(a.store);
  const first = await engineFor(a.store, server).syncAll();
  assert.equal(first.ok, true, JSON.stringify(first.errors));
  for (const name of ENTITY_NAMES) assert.equal(server.data[name].size, 1 + (name === "accounts"), name);
  for (const name of ENTITY_NAMES) {
    assert.ok(a.store.rows(name).every((r) => r.syncStatus === "synced" && r.remoteId), name);
  }

  const storage = new MemoryStorage();
  storage.setItem("categories", JSON.stringify([{ id: 1, name: "Food", color: "#f00", subcategories: ["Lunch"] }]));
  const b = createWebStore(storage);
  const second = await engineFor(b, server).syncAll();
  assert.equal(second.ok, true, JSON.stringify(second.errors));

  const bank = b.rows("accounts").find((r) => r.name === "Bank");
  const cash = b.rows("accounts").find((r) => r.name === "Cash");
  const [expense] = b.rows("expenses");
  assert.equal(expense.accountId, bank.id);
  assert.equal(expense.subcategory, "Lunch");
  assert.equal(expense.imageUri, "file:///x.jpg");
  assert.equal(b.rows("income")[0].accountId, bank.id);
  assert.deepEqual([b.rows("transfers")[0].fromAccountId, b.rows("transfers")[0].toAccountId], [bank.id, cash.id]);
  assert.equal(b.rows("budgets")[0].amount, 5000);
  assert.equal(b.rows("fuelLogs")[0].odometerKm, 400);
  // The legacy seeded "Food"/"Lunch" rows were adopted, not duplicated.
  const categories = JSON.parse(storage.getItem("categories"));
  assert.equal(categories.length, 1);
  assert.equal(categories[0].subcategories.length, 1);
  assert.ok(categories[0].subcategories[0].remoteId);

  const again = await engineFor(a.store, server).syncAll();
  assert.equal(again.ok, true);
  for (const name of ENTITY_NAMES) assert.equal(a.store.rows(name).length, 1 + (name === "accounts"), name);
  for (const name of ENTITY_NAMES) assert.equal(server.data[name].size, 1 + (name === "accounts"), name);
});

test("a lost acknowledgement is retried without creating duplicates", async () => {
  const server = createFakeServer();
  const a = nativeDevice();
  a.store.insert("expenses", { title: "Tea", amount: 20, month: "2025-05" });
  server.dropNextAck = true;
  const failed = await engineFor(a.store, server).syncAll();
  assert.equal(failed.offline, true);
  assert.equal(a.store.rows("expenses")[0].syncStatus, "pending");
  assert.equal(server.data.expenses.size, 1);

  const retried = await engineFor(a.store, server).syncAll();
  assert.equal(retried.ok, true);
  assert.equal(server.data.expenses.size, 1);
  assert.equal(a.store.rows("expenses").length, 1);
  assert.equal(a.store.rows("expenses")[0].syncStatus, "synced");
});

test("an edit made while its upload is in flight stays pending and is not overwritten", async () => {
  const server = createFakeServer();
  const a = nativeDevice();
  const id = a.store.insert("expenses", { title: "Tea", amount: 20, month: "2025-05" });
  server.beforeRespond = (method, url) => {
    if (method === "POST" && url.includes("/expenses/")) {
      server.beforeRespond = null;
      a.store.update("expenses", id, { amount: 25, syncStatus: "pending" });
    }
  };
  await engineFor(a.store, server).syncAll();
  const row = a.store.rows("expenses")[0];
  assert.equal(row.amount, 25);
  assert.equal(row.syncStatus, "pending");

  await engineFor(a.store, server).syncAll();
  assert.equal([...server.data.expenses.values()][0].amount, 25);
  assert.equal(a.store.rows("expenses")[0].syncStatus, "synced");
});

test("offline deletes are queued, cascade, and propagate to other devices", async () => {
  const server = createFakeServer();
  const a = nativeDevice();
  seedAllTables(a.store);
  await engineFor(a.store, server).syncAll();
  const b = nativeDevice();
  await engineFor(b.store, server).syncAll();

  server.offline = true;
  const food = a.store.rows("categories")[0];
  a.store.transaction(() => removeWithCascade(a.store, "categories", food, { queue: true }));
  const bankA = a.store.rows("accounts").find((r) => r.name === "Bank");
  a.store.transaction(() => removeWithCascade(a.store, "accounts", bankA, { queue: true }));
  a.store.queueDelete("income", "does-not-exist");
  const offline = await engineFor(a.store, server).syncAll();
  assert.equal(offline.offline, true);
  assert.equal(a.store.pendingDeletes().length, 5); // category, subcategory, account, transfer, bogus income
  assert.equal(server.data.categories.size, 1);

  server.offline = false;
  const online = await engineFor(a.store, server).syncAll();
  assert.equal(online.ok, true, JSON.stringify(online.errors));
  assert.equal(a.store.pendingDeletes().length, 0);
  assert.equal(server.data.categories.size, 0);
  assert.equal(server.data.subcategories.size, 0);
  assert.equal(server.data.transfers.size, 0);
  assert.deepEqual([...server.data.accounts.values()].map((d) => d.name), ["Cash"]);

  const synced = await engineFor(b.store, server).syncAll();
  assert.equal(synced.ok, true, JSON.stringify(synced.errors));
  assert.equal(b.store.rows("categories").length, 0);
  assert.equal(b.store.rows("subcategories").length, 0);
  assert.equal(b.store.rows("transfers").length, 0);
  assert.deepEqual(b.store.rows("accounts").map((r) => r.name), ["Cash"]);
  const [expense] = b.store.rows("expenses");
  assert.deepEqual([expense.category, expense.subcategory, expense.accountId], ["General", null, null]);
});

test("a remotely deleted parent is recreated when local pending rows still use it", async () => {
  const server = createFakeServer();
  const a = nativeDevice();
  a.store.insert("accounts", { name: "Bank", type: "Bank", initialBalance: 0 });
  await engineFor(a.store, server).syncAll();
  const b = nativeDevice();
  await engineFor(b.store, server).syncAll();

  const bankB = b.store.rows("accounts")[0];
  b.store.insert("expenses", { title: "Offline", amount: 5, month: "2025-05", accountId: bankB.id });
  a.store.transaction(() => removeWithCascade(a.store, "accounts", a.store.rows("accounts")[0], { queue: true }));
  await engineFor(a.store, server).syncAll();
  assert.equal(server.data.accounts.size, 0);

  const result = await engineFor(b.store, server).syncAll();
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual([...server.data.accounts.values()].map((d) => d.name), ["Bank"]);
  assert.equal([...server.data.expenses.values()][0].accountName, "Bank");
});

test("offline sync keeps cursors and queues, and partial failures leave rows pending", async () => {
  const server = createFakeServer();
  const a = nativeDevice();
  a.store.insert("income", { title: "Gift", amount: 100, month: "2025-05" });
  a.store.insert("income", { title: "Bad", amount: 1, month: "2025-05" });
  server.offline = true;
  const offline = await engineFor(a.store, server).syncAll();
  assert.equal(offline.offline, true);
  assert.equal(a.store.getMeta("cursor:income"), null);

  server.offline = false;
  server.reject = (name, item) => name === "income" && item.title === "Bad";
  const partial = await engineFor(a.store, server).syncAll();
  assert.equal(partial.ok, false);
  assert.equal(partial.errors.length, 1);
  assert.equal(partial.errors[0].message, "Rejected by test");
  const byTitle = Object.fromEntries(a.store.rows("income").map((r) => [r.title, r.syncStatus]));
  assert.deepEqual(byTitle, { Gift: "synced", Bad: "pending" });
});
