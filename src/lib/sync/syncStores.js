// Synchronous local stores used by the sync engine. Every method is synchronous so a read-check-write
// sequence can't interleave with app writes (JS is single-threaded). Pure module: no React Native imports.
import { ENTITIES } from "./syncEngine.js";

const snake = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (name) => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const BOOKKEEPING = ["remoteId", "syncStatus", "createdAt"];
const columnsFor = (entity) => new Set([...ENTITIES[entity].fields, ...BOOKKEEPING]);

const entityConfig = (entity) => {
  if (!ENTITIES[entity]) throw new Error(`Unknown sync entity: ${entity}`);
  return ENTITIES[entity];
};

const writable = (entity, values) => {
  const allowed = columnsFor(entity);
  return Object.entries(values).filter(([key, value]) => allowed.has(key) && value !== undefined);
};

/** SQLite store over a driver { all, run, transaction } (see syncMigrations.js). */
export const createSqliteStore = (driver) => ({
  rows(entity) {
    const { table } = entityConfig(entity);
    return driver.all(`SELECT * FROM ${table}`).map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value])));
  },
  insert(entity, values) {
    const { table } = entityConfig(entity);
    const entries = writable(entity, values);
    return driver.run(
      `INSERT INTO ${table} (${entries.map(([key]) => snake(key)).join(", ")}) VALUES (${entries.map(() => "?").join(", ")})`,
      entries.map(([, value]) => value),
    );
  },
  update(entity, id, patch) {
    const { table } = entityConfig(entity);
    const entries = writable(entity, patch);
    if (entries.length === 0) return;
    driver.run(
      `UPDATE ${table} SET ${entries.map(([key]) => `${snake(key)} = ?`).join(", ")} WHERE id = ?`,
      [...entries.map(([, value]) => value), id],
    );
  },
  remove(entity, id) {
    driver.run(`DELETE FROM ${entityConfig(entity).table} WHERE id = ?`, [id]);
  },
  transaction: (fn) => driver.transaction(fn),
  getMeta(key) {
    return driver.all("SELECT value FROM sync_meta WHERE key = ?", [key])[0]?.value ?? null;
  },
  setMeta(key, value) {
    driver.run(
      "INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, String(value)],
    );
  },
  pendingDeletes() {
    return driver.all("SELECT entity, remote_id AS remoteId FROM sync_deletes ORDER BY rowid");
  },
  queueDelete(entity, remoteId) {
    entityConfig(entity);
    driver.run("INSERT OR IGNORE INTO sync_deletes (entity, remote_id) VALUES (?, ?)", [entity, String(remoteId)]);
  },
  clearDelete(entity, remoteId) {
    driver.run("DELETE FROM sync_deletes WHERE entity = ? AND remote_id = ?", [entity, String(remoteId)]);
  },
});

const META_KEY = "sync_meta";
const DELETES_KEY = "sync_deletes";

/**
 * localStorage store. Keeps the app's existing web format: subcategories live in a nested
 * `subcategories` array on each category in the "categories" key.
 */
export const createWebStore = (storage) => {
  const read = (key, fallback) => {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback) !== Array.isArray(parsed)) throw new Error(`Invalid local data: ${key}`);
    return parsed;
  };
  const write = (key, value) => storage.setItem(key, JSON.stringify(value));
  const nextId = (rows) => {
    const max = rows.reduce((top, row) => Math.max(top, Number(row.id) || 0), 0);
    return Math.max(Date.now(), Math.floor(max) + 1);
  };

  // Older web seeds stored subcategories as bare strings; give them stable object rows once.
  const categories = () => {
    const list = read("categories", []);
    if (!list.some((cat) => (cat.subcategories || []).some((sub) => typeof sub !== "object" || !sub))) {
      return list;
    }
    let id = Math.floor(Math.max(0, ...list.flatMap((cat) =>
      (cat.subcategories || []).map((sub) => (Number.isFinite(sub?.id) ? sub.id : 0))))) + 1;
    for (const cat of list) {
      cat.subcategories = (cat.subcategories || []).filter((sub) => sub !== null && sub !== "").map((sub) =>
        (typeof sub === "object" ? sub : { id: id++, categoryId: cat.id, name: String(sub), createdAt: null }));
    }
    write("categories", list);
    return list;
  };
  const allSubcategories = (list) =>
    list.flatMap((cat) => (cat.subcategories || []).map((sub) => ({ ...sub, categoryId: cat.id })));

  const findSub = (list, id) => {
    for (const cat of list) {
      const index = (cat.subcategories || []).findIndex((sub) => sub.id === id);
      if (index > -1) return { cat, index };
    }
    return null;
  };

  return {
    rows(entity) {
      if (entity === "subcategories") return allSubcategories(categories());
      if (entity === "categories") return categories();
      return read(entityConfig(entity).storageKey, []);
    },
    insert(entity, values) {
      const row = Object.fromEntries(writable(entity, values));
      row.createdAt = row.createdAt ?? new Date().toISOString();
      if (entity === "subcategories") {
        const list = categories();
        const parent = list.find((cat) => cat.id === row.categoryId);
        if (!parent) throw new Error("Parent category not found");
        row.id = nextId(allSubcategories(list));
        parent.subcategories = [...(parent.subcategories || []), row];
        write("categories", list);
        return row.id;
      }
      const key = entityConfig(entity).storageKey;
      const list = entity === "categories" ? categories() : read(key, []);
      row.id = nextId(list);
      if (entity === "categories") row.subcategories = [];
      list.push(row);
      write(key, list);
      return row.id;
    },
    update(entity, id, patch) {
      const changes = Object.fromEntries(writable(entity, patch));
      if (entity === "subcategories") {
        const list = categories();
        const found = findSub(list, id);
        if (!found) return;
        delete changes.categoryId; // a subcategory never moves between parents
        found.cat.subcategories[found.index] = { ...found.cat.subcategories[found.index], ...changes };
        write("categories", list);
        return;
      }
      const key = entityConfig(entity).storageKey;
      const list = entity === "categories" ? categories() : read(key, []);
      const index = list.findIndex((row) => row.id === id);
      if (index === -1) return;
      list[index] = { ...list[index], ...changes };
      write(key, list);
    },
    remove(entity, id) {
      if (entity === "subcategories") {
        const list = categories();
        const found = findSub(list, id);
        if (!found) return;
        found.cat.subcategories.splice(found.index, 1);
        write("categories", list);
        return;
      }
      const key = entityConfig(entity).storageKey;
      write(key, read(key, []).filter((row) => row.id !== id));
    },
    // localStorage has no transactions; snapshot touched keys and restore them if fn throws.
    transaction(fn) {
      const keys = [...new Set(Object.values(ENTITIES).map((config) => config.storageKey)), META_KEY, DELETES_KEY];
      const before = keys.map((key) => [key, storage.getItem(key)]);
      try {
        return fn();
      } catch (error) {
        for (const [key, value] of before) {
          if (value === null) storage.removeItem(key);
          else storage.setItem(key, value);
        }
        throw error;
      }
    },
    getMeta(key) {
      return read(META_KEY, {})[key] ?? null;
    },
    setMeta(key, value) {
      write(META_KEY, { ...read(META_KEY, {}), [key]: String(value) });
    },
    pendingDeletes() {
      return read(DELETES_KEY, []);
    },
    queueDelete(entity, remoteId) {
      entityConfig(entity);
      const list = read(DELETES_KEY, []);
      if (!list.some((item) => item.entity === entity && item.remoteId === String(remoteId))) {
        list.push({ entity, remoteId: String(remoteId) });
        write(DELETES_KEY, list);
      }
    },
    clearDelete(entity, remoteId) {
      write(DELETES_KEY, read(DELETES_KEY, []).filter(
        (item) => !(item.entity === entity && item.remoteId === String(remoteId))));
    },
  };
};
