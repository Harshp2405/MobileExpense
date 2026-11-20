// Synchronous SQLite schema setup/migration. `driver` = { all(sql, params), run(sql, params), transaction(fn) }
// so the same code runs on expo-sqlite (app) and node:sqlite (tests). Pure module: no React Native imports.

const SYNC_COLUMNS = `
  remote_id TEXT,
  sync_status TEXT DEFAULT 'pending',`;

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,${SYNC_COLUMNS}
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS subcategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,${SYNC_COLUMNS}
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,${SYNC_COLUMNS}
    amount REAL NOT NULL,
    month TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,${SYNC_COLUMNS}
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT,
    account_id INTEGER,
    subcategory TEXT,
    date TEXT,
    description TEXT,
    month TEXT NOT NULL,
    method TEXT,
    image_uri TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS fuel_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,${SYNC_COLUMNS}
    start_km REAL NOT NULL,
    odometer_km REAL,
    litres REAL NOT NULL,
    price_per_litre REAL NOT NULL,
    total_cost REAL NOT NULL,
    date TEXT NOT NULL,
    month TEXT NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,${SYNC_COLUMNS}
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    account_id INTEGER,
    source TEXT,
    date TEXT,
    description TEXT,
    month TEXT NOT NULL,
    method TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,${SYNC_COLUMNS}
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'Cash',
    color TEXT,
    initial_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,${SYNC_COLUMNS}
    from_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    date TEXT,
    month TEXT NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  // Internal sync bookkeeping (cursors, one-time upgrade flags, queued server deletes).
  `CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_deletes (
    entity TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    PRIMARY KEY (entity, remote_id)
  )`,
];

// Columns that older app versions created tables without. Only constant defaults are allowed by ALTER TABLE.
const ADDED_COLUMNS = {
  expenses: { account_id: "INTEGER", subcategory: "TEXT", image_uri: "TEXT" },
  income: { account_id: "INTEGER" },
};
const SYNCED_TABLES = [
  "expenses", "income", "budgets", "fuel_logs",
  "accounts", "categories", "subcategories", "transfers",
];

const FUEL_COLUMNS = [
  "id", "remote_id", "sync_status", "start_km", "odometer_km", "litres",
  "price_per_litre", "total_cost", "date", "month", "note", "created_at",
];

const columnsOf = (driver, table) => driver.all(`PRAGMA table_info(${table})`);
const tableExists = (driver, table) =>
  driver.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]).length > 0;

// Copies fuel_logs_old into the current fuel_logs, then drops it. Fills columns older versions lacked.
const restoreFuelRows = (driver) => {
  const oldColumns = new Set(columnsOf(driver, "fuel_logs_old").map((col) => col.name));
  const targetEmpty = driver.all("SELECT COUNT(*) AS n FROM fuel_logs")[0].n === 0;
  const fallback = {
    sync_status: "'pending'",
    start_km: oldColumns.has("odometer_km") ? "COALESCE(odometer_km, 0)" : "0",
  };
  const columns = FUEL_COLUMNS.filter((col) =>
    (col !== "id" || targetEmpty) && (oldColumns.has(col) || fallback[col]));
  const select = columns.map((col) => {
    if (!oldColumns.has(col)) return fallback[col];
    if (col === "start_km") return `COALESCE(start_km, ${fallback.start_km})`;
    if (col === "sync_status") return "COALESCE(sync_status, 'pending')";
    return col;
  });
  // A previous failed migration can leave rows in both tables; skip rows already present by remote id.
  const skipKnown = oldColumns.has("remote_id")
    ? " WHERE remote_id IS NULL OR remote_id NOT IN (SELECT remote_id FROM fuel_logs WHERE remote_id IS NOT NULL)"
    : "";
  driver.run(
    `INSERT INTO fuel_logs (${columns.join(", ")}) SELECT ${select.join(", ")} FROM fuel_logs_old${skipKnown}`,
  );
  driver.run("DROP TABLE fuel_logs_old");
};

export const migrateDatabase = (driver) => {
  driver.transaction(() => {
    // Recover data stranded by the previous migration, which renamed fuel_logs and then failed.
    const strandedFuel = tableExists(driver, "fuel_logs_old");

    for (const statement of CREATE_TABLES) driver.run(statement);

    const fuelColumns = columnsOf(driver, "fuel_logs");
    const odometer = fuelColumns.find((col) => col.name === "odometer_km");
    const needsRebuild = (odometer && odometer.notnull === 1) ||
      !fuelColumns.some((col) => col.name === "start_km");
    if (needsRebuild && !strandedFuel) {
      driver.run("ALTER TABLE fuel_logs RENAME TO fuel_logs_old");
      driver.run(CREATE_TABLES[4]);
      restoreFuelRows(driver);
    } else if (needsRebuild) {
      throw new Error("fuel_logs needs a rebuild but fuel_logs_old already exists");
    }

    for (const table of SYNCED_TABLES) {
      const existing = new Set(columnsOf(driver, table).map((col) => col.name));
      const wanted = {
        ...ADDED_COLUMNS[table],
        remote_id: "TEXT",
        sync_status: "TEXT DEFAULT 'pending'",
      };
      for (const [column, type] of Object.entries(wanted)) {
        if (!existing.has(column)) driver.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }

    if (strandedFuel) restoreFuelRows(driver);
  });
};

// Wraps an expo-sqlite SQLiteDatabase for migrateDatabase and the sync store.
export const expoSqliteDriver = (expoDb) => ({
  all: (sql, params = []) => expoDb.getAllSync(sql, params),
  run: (sql, params = []) => expoDb.runSync(sql, params).lastInsertRowId,
  transaction: (fn) => {
    let result;
    expoDb.withTransactionSync(() => { result = fn(); });
    return result;
  },
});
