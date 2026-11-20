// Offline-first two-way sync for all eight local tables. Pure module (no React Native imports) so it can
// be tested in Node; platform wiring lives in syncManager.js / localStore.js.
//
// Policy:
// - Every local create/update is "pending" until the server acknowledges that exact version.
// - Downloads never overwrite a pending row; the local edit is pushed instead (last accepted write wins).
// - Local deletions of synced rows are queued and sent before upserts; 404 means already deleted.
// - Local rows reference parents by integer id; the server uses names. Parents sync first.

export const ENTITIES = {
  accounts: {
    table: "accounts", storageKey: "accounts", route: "/accounts", bodyKey: "accounts",
    fields: ["name", "type", "color", "initialBalance"],
    required: ["name", "type", "initialBalance"],
    defaults: { type: "Cash", initialBalance: 0 },
    naturalKey: (row) => row.name,
  },
  categories: {
    table: "categories", storageKey: "categories", route: "/categories", bodyKey: "categories",
    fields: ["name", "color"], required: ["name"],
    naturalKey: (row) => row.name,
  },
  subcategories: {
    table: "subcategories", storageKey: "categories", route: "/subcategories", bodyKey: "subcategories",
    fields: ["categoryId", "name"], required: ["categoryId", "name"],
    naturalKey: (row) => `${row.categoryId}\u0000${String(row.name).toLowerCase()}`,
  },
  expenses: {
    table: "expenses", storageKey: "expenses", route: "/expenses", bodyKey: "expenses",
    fields: ["title", "amount", "category", "subcategory", "accountId", "date", "description", "month", "method", "imageUri"],
    required: ["title", "amount", "month"],
  },
  income: {
    table: "income", storageKey: "income", route: "/income", bodyKey: "income",
    fields: ["title", "amount", "accountId", "source", "date", "description", "month", "method"],
    required: ["title", "amount", "month"],
  },
  transfers: {
    table: "transfers", storageKey: "transfers", route: "/transfers", bodyKey: "transfers",
    fields: ["fromAccountId", "toAccountId", "amount", "date", "month", "note"],
    required: ["fromAccountId", "toAccountId", "amount", "month"],
  },
  budgets: {
    table: "budgets", storageKey: "budgets", route: "/budget", bodyKey: "budgets",
    fields: ["amount", "month"], required: ["amount", "month"],
    naturalKey: (row) => row.month,
    noRemoteDelete: true, // the app has no budget delete; the server matches budgets by month
  },
  fuelLogs: {
    table: "fuel_logs", storageKey: "fuel_logs", route: "/fuel", bodyKey: "fuelLogs",
    fields: ["startKm", "odometerKm", "litres", "pricePerLitre", "totalCost", "date", "month", "note"],
    required: ["startKm", "litres", "pricePerLitre", "totalCost", "date", "month"],
  },
};

// Parents before children, so name references resolve on both sides.
export const SYNC_ORDER = [
  "accounts", "categories", "subcategories", "expenses", "income", "transfers", "budgets", "fuelLogs",
];

// Local id field -> server name field, and the parent entity it points at.
const REFERENCES = {
  accountId: ["accountName", "accounts"],
  fromAccountId: ["fromAccountName", "accounts"],
  toAccountId: ["toAccountName", "accounts"],
  categoryId: ["categoryName", "categories"],
};
const NULLABLE_REFS = new Set(["accountId"]);

const BATCH_SIZE = 100;
const UPGRADE_FLAG = "upgrade:all_tables_v1";

export const isPending = (row) => row.syncStatus !== "synced";
const fingerprint = (entity, row) =>
  JSON.stringify(ENTITIES[entity].fields.map((field) => row[field] ?? null));

export class SyncNetworkError extends Error {}

const byId = (rows) => new Map(rows.map((row) => [row.id, row]));
const byName = (rows) => new Map(rows.map((row) => [row.name, row]));

const toRemote = (entity, row, parents) => {
  const config = ENTITIES[entity];
  const payload = { id: row.id, remoteId: row.remoteId || undefined };
  for (const field of config.fields) {
    const ref = REFERENCES[field];
    if (!ref) {
      payload[field] = row[field] ?? null;
      continue;
    }
    const [remoteField, parentEntity] = ref;
    const parent = row[field] == null ? null : parents[parentEntity].get(row[field]);
    if (!parent && !NULLABLE_REFS.has(field)) {
      throw new Error(`${entity} #${row.id} references a missing ${parentEntity} row`);
    }
    payload[remoteField] = parent ? parent.name : null; // a dangling optional account means "no account"
  }
  return payload;
};

const fromRemote = (entity, item, parentsByName, existing) => {
  const config = ENTITIES[entity];
  const values = {};
  for (const field of config.fields) {
    const ref = REFERENCES[field];
    if (ref) {
      const [remoteField, parentEntity] = ref;
      const name = item[remoteField];
      if (name === undefined) values[field] = existing?.[field] ?? null;
      else if (name === null) values[field] = null;
      else {
        const parent = parentsByName[parentEntity].get(name);
        if (!parent) throw new Error(`Unknown ${parentEntity} name "${name}" in ${entity}`);
        values[field] = parent.id;
      }
    } else {
      values[field] = item[field] !== undefined ? item[field] : existing?.[field] ?? config.defaults?.[field] ?? null;
    }
  }
  for (const field of config.required) {
    if (values[field] === null || values[field] === "") throw new Error(`${entity} item is missing ${field}`);
  }
  if (entity === "transfers" && values.fromAccountId === values.toAccountId) {
    throw new Error("Transfer source and destination accounts are the same");
  }
  return values;
};

// Rows that would lose a pending local change if `row` were deleted by a remote deletion.
const hasPendingDependents = (store, entity, row) => {
  if (entity === "accounts") {
    return ["expenses", "income"].some((child) =>
      store.rows(child).some((r) => isPending(r) && r.accountId === row.id)) ||
      store.rows("transfers").some((t) => isPending(t) && (t.fromAccountId === row.id || t.toAccountId === row.id));
  }
  if (entity === "categories") {
    return store.rows("subcategories").some((s) => isPending(s) && s.categoryId === row.id) ||
      store.rows("expenses").some((e) => isPending(e) && e.category === row.name);
  }
  if (entity === "subcategories") {
    const parent = store.rows("categories").find((c) => c.id === row.categoryId);
    return store.rows("expenses").some((e) =>
      isPending(e) && e.category === parent?.name && e.subcategory === row.name);
  }
  return false;
};

/**
 * Deletes a row and applies the same cascade the app and the server use. With `queue`, synced rows
 * are queued for server deletion and affected children become pending (a local user delete).
 * Without it, this mirrors a deletion that already happened on the server.
 */
export const removeWithCascade = (store, entity, row, { queue = false } = {}) => {
  const touch = (child, r, patch) => store.update(child, r.id, queue ? { ...patch, syncStatus: "pending" } : patch);
  const drop = (child, r) => {
    if (queue && r.remoteId && !ENTITIES[child].noRemoteDelete) store.queueDelete(child, r.remoteId);
    store.remove(child, r.id);
  };

  if (entity === "accounts") {
    for (const child of ["expenses", "income"]) {
      for (const r of store.rows(child)) if (r.accountId === row.id) touch(child, r, { accountId: null });
    }
    for (const t of store.rows("transfers")) {
      if (t.fromAccountId === row.id || t.toAccountId === row.id) drop("transfers", t);
    }
  } else if (entity === "categories") {
    for (const e of store.rows("expenses")) {
      if (e.category === row.name) touch("expenses", e, { category: "General", subcategory: null });
    }
    for (const s of store.rows("subcategories")) if (s.categoryId === row.id) drop("subcategories", s);
  } else if (entity === "subcategories") {
    const parent = store.rows("categories").find((c) => c.id === row.categoryId);
    for (const e of store.rows("expenses")) {
      if (parent && e.category === parent.name && e.subcategory === row.name) {
        touch("expenses", e, { subcategory: null });
      }
    }
  }
  drop(entity, row);
};

// Renames denormalized expense category/subcategory strings when a parent is renamed remotely
// (including pending expenses, so they don't push the old name back). Sync status is unchanged.
const renameExpenseRefs = (store, entity, before, after) => {
  if (entity === "categories" && before.name !== after.name) {
    for (const e of store.rows("expenses")) {
      if (e.category === before.name) store.update("expenses", e.id, { category: after.name });
    }
  }
  if (entity === "subcategories" && before.name !== after.name) {
    const parent = store.rows("categories").find((c) => c.id === before.categoryId);
    for (const e of store.rows("expenses")) {
      if (parent && e.category === parent.name && e.subcategory === before.name) {
        store.update("expenses", e.id, { subcategory: after.name });
      }
    }
  }
};

/**
 * One-time upgrade: expenses were previously pushed with only title/amount/month/method, so re-push
 * them all once to backfill category, subcategory, account, date, description and image fields.
 */
export const upgradeLocalSyncState = (store) => {
  if (store.getMeta(UPGRADE_FLAG)) return;
  store.transaction(() => {
    for (const row of store.rows("expenses")) {
      if (!isPending(row)) store.update("expenses", row.id, { syncStatus: "pending" });
    }
    store.setMeta(UPGRADE_FLAG, "done");
  });
};

export const createSyncEngine = ({
  store, fetchImpl, apiUrl, createRemoteId, timeoutMs = 60000, wakeTimeoutMs = 120000, log = () => {},
}) => {
  const request = async (method, path, body, limit = timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limit);
    try {
      const response = await fetchImpl(`${apiUrl}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      let data = null;
      try { data = await response.json(); } catch { /* non-JSON error page */ }
      return { status: response.status, ok: response.ok, data };
    } catch (error) {
      throw new SyncNetworkError(error?.name === "AbortError" ? "Request timed out" : error?.message || "Network error");
    } finally {
      clearTimeout(timer);
    }
  };

  const parents = () => ({ accounts: byId(store.rows("accounts")), categories: byId(store.rows("categories")) });
  const parentsByName = () => ({ accounts: byName(store.rows("accounts")), categories: byName(store.rows("categories")) });

  const pushDeletes = async (result) => {
    const order = [...SYNC_ORDER].reverse();
    const queued = [...store.pendingDeletes()].sort((a, b) => order.indexOf(a.entity) - order.indexOf(b.entity));
    for (const { entity, remoteId } of queued) {
      const config = ENTITIES[entity];
      if (!config) { store.clearDelete(entity, remoteId); continue; }
      const response = await request("DELETE", `${config.route}/${encodeURIComponent(remoteId)}`);
      if (response.ok || response.status === 404) {
        store.clearDelete(entity, remoteId);
        result.deleted += 1;
      } else {
        result.errors.push({ entity, message: `Delete failed (HTTP ${response.status})` });
      }
    }
  };

  const push = async (entity, result) => {
    const config = ENTITIES[entity];
    // Stable client-generated ids make retries idempotent even if an acknowledgement is lost.
    const batch = store.transaction(() => {
      const refs = parents();
      const items = [];
      for (const row of store.rows(entity).filter(isPending)) {
        if (!config.naturalKey && !row.remoteId) {
          row.remoteId = createRemoteId();
          store.update(entity, row.id, { remoteId: row.remoteId });
        }
        try {
          items.push({ payload: toRemote(entity, row, refs), version: fingerprint(entity, row) });
        } catch (error) {
          result.errors.push({ entity, localId: row.id, message: error.message });
        }
      }
      return items;
    });

    for (let start = 0; start < batch.length; start += BATCH_SIZE) {
      const chunk = batch.slice(start, start + BATCH_SIZE);
      const response = await request("POST", `${config.route}/sync`, { [config.bodyKey]: chunk.map((item) => item.payload) });
      if (!response.ok || !Array.isArray(response.data?.syncedIds)) {
        result.errors.push({ entity, message: `Upload failed (HTTP ${response.status})` });
        return;
      }
      const versions = new Map(chunk.map((item) => [item.payload.id, item.version]));
      store.transaction(() => {
        const current = byId(store.rows(entity));
        for (const { localId, remoteId } of response.data.syncedIds) {
          if (!versions.has(localId) || !remoteId) continue;
          const row = current.get(localId);
          if (!row) {
            // Deleted locally while the upload was in flight: delete the server copy too.
            if (!config.noRemoteDelete) store.queueDelete(entity, String(remoteId));
            continue;
          }
          const patch = { remoteId: String(remoteId) };
          if (fingerprint(entity, row) === versions.get(localId)) patch.syncStatus = "synced";
          store.update(entity, row.id, patch);
          result.pushed += 1;
        }
      });
      for (const failure of response.data.failed || []) {
        result.errors.push({ entity, localId: failure.localId, message: failure.error || "Rejected by server" });
      }
    }
  };

  const pull = async (entity, result) => {
    const config = ENTITIES[entity];
    const cursorKey = `cursor:${entity}`;
    const since = store.getMeta(cursorKey) || "0";
    const response = await request("GET", `${config.route}/delta?since=${encodeURIComponent(since)}`);
    const { items, timestamp, activeIds } = response.data || {};
    if (!response.ok || !Array.isArray(items) || !Array.isArray(activeIds)) {
      result.errors.push({ entity, message: `Download failed (HTTP ${response.status})` });
      return;
    }

    let resurrected = 0;
    store.transaction(() => {
      const active = new Set(activeIds.map(String));
      const deleting = new Set(store.pendingDeletes().filter((d) => d.entity === entity).map((d) => d.remoteId));
      const refsByName = parentsByName();
      const byRemote = new Map();
      const byNatural = new Map();
      const index = (row) => {
        if (row.remoteId) byRemote.set(row.remoteId, row);
        if (config.naturalKey) byNatural.set(config.naturalKey(row), row);
      };
      const unindex = (row) => {
        if (byRemote.get(row.remoteId) === row) byRemote.delete(row.remoteId);
        if (config.naturalKey && byNatural.get(config.naturalKey(row)) === row) byNatural.delete(config.naturalKey(row));
      };
      store.rows(entity).forEach(index);
      let unresolved = 0;

      for (const item of items) {
        const remoteId = String(item?._id ?? "");
        if (!remoteId || deleting.has(remoteId)) continue;
        try {
          let local = byRemote.get(remoteId);
          const values = fromRemote(entity, item, refsByName, local);
          if (!local && config.naturalKey) {
            // Adopt an existing local row with the same name/month instead of creating a duplicate.
            const candidate = byNatural.get(config.naturalKey(values));
            if (candidate && (!candidate.remoteId || !active.has(candidate.remoteId))) local = candidate;
          }
          if (local && isPending(local)) {
            if (local.remoteId !== remoteId) {
              store.update(entity, local.id, { remoteId });
              unindex(local);
              index(Object.assign(local, { remoteId }));
            }
            continue; // keep the local edit; it is uploaded on the next push
          }
          const next = { ...values, remoteId, syncStatus: "synced" };
          if (local) {
            renameExpenseRefs(store, entity, local, values);
            store.update(entity, local.id, next);
            unindex(local);
            index(Object.assign(local, next));
          } else {
            index({ ...next, id: store.insert(entity, next) });
          }
          result.pulled += 1;
        } catch (error) {
          unresolved += 1;
          result.errors.push({ entity, message: error.message });
        }
        if (entity === "accounts" || entity === "categories") Object.assign(refsByName, parentsByName());
      }

      // Rows deleted on the server (or by another device).
      for (const row of store.rows(entity)) {
        if (!row.remoteId || active.has(row.remoteId) || isPending(row)) continue;
        if (hasPendingDependents(store, entity, row)) {
          store.update(entity, row.id, { syncStatus: "pending" }); // re-create it so pending children stay valid
          resurrected += 1;
        } else {
          removeWithCascade(store, entity, row);
          result.removed += 1;
        }
      }

      // Only advance once every downloaded item was applied, so nothing is skipped permanently.
      if (unresolved === 0 && Number.isFinite(Number(timestamp))) store.setMeta(cursorKey, String(timestamp));
    });
    return resurrected;
  };

  const syncAll = async () => {
    const result = { ok: false, offline: false, pushed: 0, pulled: 0, removed: 0, deleted: 0, errors: [] };
    if (!apiUrl) {
      result.offline = true;
      result.errors.push({
        message: "Sync server URL is not configured (BACKEND_URL)",
      });
      return result;
    }
    try {
      upgradeLocalSyncState(store);
      // Free hosts sleep when idle; give the first request time to wake the server (any HTTP status means it's up).
      await request("GET", "/health", undefined, wakeTimeoutMs);
      await pushDeletes(result);
      for (const entity of SYNC_ORDER) {
        await push(entity, result);
        // Re-create parents that were deleted remotely but still have pending children, before the children upload.
        if (await pull(entity, result)) await push(entity, result);
      }
    } catch (error) {
      if (!(error instanceof SyncNetworkError)) throw error;
      result.offline = true;
      result.errors.push({ message: error.message });
    }
    result.ok = result.errors.length === 0;
    log(result);
    return result;
  };

  return { syncAll };
};
