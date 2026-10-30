import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const source = await readFile(new URL("./portableData.js", import.meta.url), "utf8");
const { TABLES, normalizeTables, parsePortableBackup, mergePortableTables } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const empty = () => Object.fromEntries(Object.keys(TABLES).map((table) => [table, []]));
const data = () => ({
  ...empty(),
  categories: [{ id: 1, name: "Food" }],
  subcategories: [{ id: 1, categoryId: 1, name: "Lunch" }],
  accounts: [
    { id: 1, name: "Cash", type: "Cash", initialBalance: 100 },
    { id: 2, name: "Bank", type: "Bank", initialBalance: 500 },
  ],
  expenses: [{ id: 1, title: "Meal", amount: 25, month: "2026-10", accountId: 1, category: "Food", subcategory: "Lunch" }],
  income: [{ id: 1, title: "Salary", amount: 200, month: "2026-10", accountId: 2 }],
  budgets: [{ id: 1, month: "2026-10", amount: 300 }],
  fuelLogs: [{ id: 1, startKm: 100, litres: 2, pricePerLitre: 100, totalCost: 200, date: "30/10/2026", month: "2026-10" }],
  transfers: [{ id: 1, fromAccountId: 2, toAccountId: 1, amount: 50, month: "2026-10" }],
});

test("all eight tables round-trip, without mutating input", () => {
  const input = data();
  const before = JSON.stringify(input);
  const backup = parsePortableBackup(JSON.stringify({
    format: "expense-tracker-portable", version: 2, tables: input,
  }));
  const merged = mergePortableTables(empty(), backup.tables);
  for (const table of Object.keys(TABLES)) {
    assert.equal(merged.counts[table].added, input[table].length);
  }
  assert.equal(merged.tables.expenses[0].accountId, merged.tables.accounts[0].id);
  assert.equal(merged.tables.transfers[0].fromAccountId, merged.tables.accounts[1].id);
  assert.equal(JSON.stringify(input), before);
});

test("colliding local IDs remap relationships; existing natural-key conflicts win", () => {
  const current = empty();
  current.accounts = [{ id: 1, name: "Other", type: "Cash", initialBalance: 10 }];
  current.categories = [{ id: 5, name: "food" }];
  current.subcategories = [{ id: 8, name: "lunch", categoryId: 5 }];
  current.budgets = [{ id: 1, month: "2026-10", amount: 999 }];
  const result = mergePortableTables(current, data());
  assert.equal(result.tables.expenses[0].accountId, 2);
  assert.equal(result.tables.subcategories.length, 1);
  assert.equal(result.tables.expenses[0].category, "food");
  assert.equal(result.tables.expenses[0].subcategory, "lunch");
  assert.equal(result.tables.budgets[0].amount, 999);
});

test("repeated imports skip all entries and keep balances unchanged", () => {
  const first = mergePortableTables(empty(), data());
  const second = mergePortableTables(first.tables, data());
  for (const table of Object.keys(TABLES)) assert.equal(second.counts[table].added, 0, table);
  assert.deepEqual(second.tables, first.tables);
});

test("legitimate identical transactions retain their multiplicity", () => {
  const incoming = data();
  incoming.expenses.push({ ...incoming.expenses[0], id: 2 });
  const first = mergePortableTables(empty(), incoming);
  assert.equal(first.tables.expenses.length, 2);
  const second = mergePortableTables(first.tables, incoming);
  assert.equal(second.tables.expenses.length, 2);
});

test("matching remote IDs keep current edits", () => {
  const current = data();
  current.expenses[0].remoteId = "remote-1";
  current.expenses[0].amount = 999;
  const incoming = data();
  incoming.expenses[0].remoteId = "remote-1";
  const result = mergePortableTables(current, incoming);
  assert.equal(result.tables.expenses.length, 1);
  assert.equal(result.tables.expenses[0].amount, 999);
});

test("pending edits and receipt paths remain data, without embedding image files", () => {
  const incoming = data();
  incoming.expenses[0].syncStatus = "pending";
  incoming.expenses[0].remoteId = "remote";
  incoming.expenses[0].imageUri = "file:///old-device/receipt.jpg";
  const result = mergePortableTables(empty(), incoming);
  assert.equal(result.tables.expenses[0].syncStatus, "pending");
  assert.equal(result.tables.expenses[0].imageUri, incoming.expenses[0].imageUri);
});

test("malformed files, missing tables, bad months and duplicate IDs fail validation", () => {
  assert.throws(() => parsePortableBackup("{"), /valid JSON/);
  assert.throws(() => parsePortableBackup('{"version":1}'), /version 2/);
  assert.throws(() => normalizeTables({}), /table/);
  const invalid = data();
  invalid.expenses[0].month = "2026-13";
  assert.throws(() => normalizeTables(invalid), /month/);
  const duplicate = data();
  duplicate.income.push({ ...duplicate.income[0] });
  assert.throws(() => normalizeTables(duplicate), /Duplicate ID/);
  const badNumber = data();
  badNumber.expenses[0].amount = NaN;
  assert.throws(() => normalizeTables(badNumber), /amount/);
});

test("broken references and same-account transfers fail before writing", () => {
  const broken = data();
  broken.expenses[0].accountId = 99;
  assert.throws(() => normalizeTables(broken), /missing account/);
  const sub = data();
  sub.subcategories[0].categoryId = 99;
  assert.throws(() => normalizeTables(sub), /missing category/);
  const transfer = data();
  transfer.transfers[0].toAccountId = 2;
  assert.throws(() => normalizeTables(transfer), /identical accounts/);
});

test("fractional browser IDs remap to integer SQLite IDs", () => {
  const input = data();
  input.expenses[0].id = 123.456;
  const result = mergePortableTables(empty(), input);
  assert.equal(result.tables.expenses[0].id, 1);
});

const serviceSource = (await readFile(new URL("./portableService.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/export (async )?function /g, "$1function ");
function loadService(expoDb, storage) {
  return new Function(
    "Platform", "expoDb", "localStorage", "TABLES", "normalizeTables",
    "mergePortableTables", "parsePortableBackup",
    `${serviceSource}
    return { collectPortableBackup, importPortableBackup, recoverPortableImport };`,
  )({ OS: storage ? "web" : "android" }, expoDb, storage, TABLES,
    normalizeTables, mergePortableTables, parsePortableBackup);
}

function sqliteAdapter() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const column = (key) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  for (const [table, fields] of Object.entries(TABLES)) {
    const definitions = Object.entries(fields).map(([key, type]) => {
      if (key === "id") return '"id" INTEGER PRIMARY KEY';
      let suffix = "";
      if (key === "categoryId") suffix = " REFERENCES categories(id)";
      if (["accountId", "fromAccountId", "toAccountId"].includes(key)) suffix = " REFERENCES accounts(id)";
      return `"${column(key)}" ${["id", "optionalId", "number", "optionalNumber"].includes(type) ? "REAL" : "TEXT"}${suffix}`;
    });
    if (["categories", "accounts"].includes(table)) definitions.push("UNIQUE(name)");
    if (table === "budgets") definitions.push("UNIQUE(month)");
    const sqlTable = table === "fuelLogs" ? "fuel_logs" : table;
    db.exec(`CREATE TABLE "${sqlTable}" (${definitions.join(", ")})`);
  }
  const adapter = {
    getAllSync: (sql) => db.prepare(sql).all(),
    runSync: (sql, values) => db.prepare(sql).run(...values),
    withTransactionSync: (callback) => {
      db.exec("BEGIN");
      try { callback(); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  return { db, adapter };
}

test("service writes real SQLite tables with remapped foreign keys and exports every table", () => {
  const { db, adapter } = sqliteAdapter();
  try {
    const service = loadService(adapter);
    service.importPortableBackup({ tables: data() });
    const exported = service.collectPortableBackup();
    assert.equal(exported.version, 2);
    assert.equal(exported.tables.fuelLogs.length, 1);
    assert.equal(exported.tables.subcategories.length, 1);
    assert.equal(exported.tables.accounts.length, 2);
    assert.equal(exported.tables.transfers.length, 1);
    const second = service.importPortableBackup(exported);
    for (const count of Object.values(second)) assert.equal(count.added, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM expenses").get().n, 1);
  } finally { db.close(); }
});

test("SQLite insert failure rolls back every table", () => {
  const { db, adapter } = sqliteAdapter();
  let writes = 0;
  const run = adapter.runSync;
  adapter.runSync = (...args) => {
    if (++writes === 5) throw new Error("Injected disk failure");
    return run(...args);
  };
  try {
    assert.throws(() => loadService(adapter).importPortableBackup({ tables: data() }), /disk failure/);
    for (const table of Object.keys(TABLES)) {
      const name = table === "fuelLogs" ? "fuel_logs" : table;
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n, 0);
    }
  } finally { db.close(); }
});

function browserStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

test("browser merges nested subcategories and re-imports without duplication", () => {
  const storage = browserStorage();
  storage.setItem("categories", JSON.stringify([
    { id: 8, name: "Food", subcategories: [{ id: 77, name: "Lunch" }, "Dinner"] },
  ]));
  const service = loadService(null, storage);
  const before = service.collectPortableBackup();
  assert.equal(before.tables.subcategories[0].id, 77);
  assert.equal(before.tables.subcategories[1].name, "Dinner");
  service.importPortableBackup({ tables: data() });
  assert.equal(JSON.parse(storage.getItem("categories"))[0].subcategories[0].id, 77);
  const counts = service.importPortableBackup({ tables: data() });
  for (const count of Object.values(counts)) assert.equal(count.added, 0);
  assert.equal(service.collectPortableBackup().tables.expenses.length, 1);
});

test("browser quota failure restores original values and clears journal", () => {
  const storage = browserStorage();
  storage.setItem("expenses", "[]");
  const set = storage.setItem;
  let writes = 0;
  storage.setItem = (key, value) => {
    if (++writes === 4) throw new Error("Quota exceeded");
    set(key, value);
  };
  const service = loadService(null, storage);
  assert.throws(() => service.importPortableBackup({ tables: data() }), /Quota exceeded/);
  assert.equal(storage.getItem("expenses"), "[]");
  assert.equal(storage.getItem("accounts"), null);
  assert.equal(storage.getItem("portable_import_rollback"), null);
});

test("browser recovery restores an interrupted import before normal startup", () => {
  const storage = browserStorage();
  const previous = {
    categories: "[]", accounts: null, budgets: null, expenses: "[]",
    fuel_logs: null, income: null, transfers: null,
  };
  storage.setItem("portable_import_rollback", JSON.stringify(previous));
  storage.setItem("accounts", '[{"id":999}]');
  loadService(null, storage).recoverPortableImport();
  assert.equal(storage.getItem("accounts"), null);
  assert.equal(storage.getItem("expenses"), "[]");
  assert.equal(storage.getItem("portable_import_rollback"), null);
});
