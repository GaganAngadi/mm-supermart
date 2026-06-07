const initSqlJs = require("sql.js");
const { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const statusValues = new Set(["pending", "processing", "completed", "failed"]);

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertSalePayload(sale) {
  if (!sale || typeof sale !== "object") throw new Error("Sale payload is required");
  if (!normalizeText(sale.invoiceNo)) throw new Error("Invoice number is required");
  if (!Array.isArray(sale.items) || sale.items.length === 0) throw new Error("Sale must contain at least one item");
  for (const item of sale.items) {
    if (!normalizeText(item.sku)) throw new Error("Sale item SKU is required");
    if (normalizeNumber(item.quantity) <= 0) throw new Error("Sale item quantity must be positive");
  }
}

function escapeLike(value) {
  return normalizeText(value).replace(/[%_]/g, "");
}

function retryDelayMs(retryCount) {
  const schedule = [60_000, 300_000, 900_000, 1_800_000, 3_600_000];
  return schedule[Math.min(Math.max(0, retryCount), schedule.length - 1)];
}

class LocalDatabase {
  constructor({ userDataPath }) {
    this.userDataPath = userDataPath;
    this.preferredDataDir = "C:\\MMSuperMart\\data";
    this.dataDir = this.preferredDataDir;
    this.dbPath = join(this.dataDir, "pos.db");
    this.preferredBackupDir = "C:\\MMSuperMart\\Backups";
    this.backupDir = this.preferredBackupDir;
    this.db = null;
    this.SQL = null;
  }

  async init() {
    if (this.db) return this;
    this.ensureDataDir();
    this.ensureBackupDir();
    this.SQL = await initSqlJs({
      locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
    });
    if (existsSync(this.dbPath)) {
      this.db = new this.SQL.Database(readFileSync(this.dbPath));
    } else {
      this.db = new this.SQL.Database();
    }
    this.migrate();
    this.persist();
    return this;
  }

  ensureDataDir() {
    try {
      mkdirSync(this.preferredDataDir, { recursive: true });
      this.dataDir = this.preferredDataDir;
    } catch {
      this.dataDir = join(this.userDataPath, "local-data");
      mkdirSync(this.dataDir, { recursive: true });
    }
    this.dbPath = join(this.dataDir, "pos.db");
    return this.dataDir;
  }

  ensureBackupDir() {
    try {
      mkdirSync(this.preferredBackupDir, { recursive: true });
      this.backupDir = this.preferredBackupDir;
    } catch {
      this.backupDir = join(this.userDataPath, "Backups");
      mkdirSync(this.backupDir, { recursive: true });
    }
    return this.backupDir;
  }

  requireDb() {
    if (!this.db) throw new Error("Local SQLite database is not ready");
    return this.db;
  }

  migrate() {
    const db = this.requireDb();
    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        category_id TEXT,
        brand TEXT,
        unit TEXT NOT NULL DEFAULT 'pcs',
        mrp REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        purchase_price REAL NOT NULL DEFAULT 0,
        gst_rate REAL NOT NULL DEFAULT 0,
        stock_qty REAL NOT NULL DEFAULT 0,
        min_stock_qty REAL NOT NULL DEFAULT 0,
        image_url TEXT,
        expiry_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mobile TEXT UNIQUE,
        loyalty_points REAL NOT NULL DEFAULT 0,
        credit_balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mobile TEXT,
        gstin TEXT,
        address TEXT,
        balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        invoice_no TEXT NOT NULL UNIQUE,
        customer_id TEXT,
        customer_name TEXT,
        customer_mobile TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        discount REAL NOT NULL DEFAULT 0,
        savings REAL NOT NULL DEFAULT 0,
        profit REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_id TEXT,
        sku TEXT NOT NULL,
        barcode TEXT,
        name TEXT NOT NULL,
        quantity REAL NOT NULL,
        mrp REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        purchase_price REAL NOT NULL DEFAULT 0,
        gst_rate REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        reference TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        gst_rate REAL NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        sku TEXT NOT NULL,
        barcode TEXT,
        movement_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        reference TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        next_retry_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_logs (
        id TEXT PRIMARY KEY,
        queue_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        action TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_sku ON stock_movements(sku, created_at);
    `);
    this.ensureColumn("sync_queue", "last_attempt_at", "TEXT");
    this.ensureColumn("sync_queue", "next_retry_at", "TEXT");
    this.ensureColumn("sync_queue", "last_error", "TEXT");
  }

  ensureColumn(tableName, columnName, definition) {
    const existing = this.query(`PRAGMA table_info(${tableName})`).some((column) => column.name === columnName);
    if (!existing) this.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  persist() {
    const db = this.requireDb();
    writeFileSync(this.dbPath, Buffer.from(db.export()));
  }

  transaction(callback) {
    const db = this.requireDb();
    db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      const result = callback(db);
      db.exec("COMMIT;");
      this.persist();
      return result;
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }

  run(sql, params = []) {
    this.requireDb().run(sql, params);
  }

  query(sql, params = []) {
    const statement = this.requireDb().prepare(sql);
    try {
      statement.bind(params);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }

  get(sql, params = []) {
    return this.query(sql, params)[0] || null;
  }

  enqueue(db, entityType, entityId, action, payload) {
    const timestamp = nowIso();
    db.run(
      "INSERT INTO sync_queue (id, entity_type, entity_id, action, payload_json, status, retry_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)",
      [createId("sync"), entityType, entityId, action, JSON.stringify(payload), timestamp, timestamp]
    );
    this.logSyncAttempt(db, null, entityType, entityId, "pending", "Queued local change for cloud sync");
  }

  logSyncAttempt(db, queueId, entityType, entityId, status, errorMessage) {
    const timestamp = nowIso();
    db.run(
      "INSERT INTO sync_logs (id, queue_id, entity_type, entity_id, status, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [createId("sync-log"), queueId, entityType, entityId, status, errorMessage || null, timestamp, timestamp]
    );
  }

  audit(db, entityType, entityId, action, payload) {
    const timestamp = nowIso();
    db.run(
      "INSERT INTO audit_logs (id, entity_type, entity_id, action, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [createId("audit"), entityType, entityId, action, JSON.stringify(payload), timestamp, timestamp]
    );
  }

  saveSale(sale) {
    assertSalePayload(sale);
    return this.transaction((db) => {
      const timestamp = sale.createdAt || nowIso();
      const existing = this.get("SELECT id FROM sales WHERE invoice_no = ?", [sale.invoiceNo]);
      if (existing) return { ok: true, saleId: existing.id, duplicate: true };

      let customerId = normalizeText(sale.customerId);
      const mobile = normalizeText(sale.customerMobile).replace(/\D/g, "");
      if (mobile) {
        const existingCustomer = this.get("SELECT id FROM customers WHERE mobile = ?", [mobile]);
        customerId = existingCustomer?.id || customerId || createId("cust");
        if (existingCustomer) {
          db.run("UPDATE customers SET name = ?, updated_at = ? WHERE id = ?", [normalizeText(sale.customerName) || "Walk-in Customer", timestamp, customerId]);
        } else {
          db.run(
            "INSERT INTO customers (id, name, mobile, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            [customerId, normalizeText(sale.customerName) || "Walk-in Customer", mobile, timestamp, timestamp]
          );
          this.enqueue(db, "customer", customerId, "upsert", { id: customerId, name: sale.customerName, mobile });
        }
      }

      const saleId = createId("sale");
      db.run(
        "INSERT INTO sales (id, invoice_no, customer_id, customer_name, customer_mobile, subtotal, tax, discount, savings, profit, total, payment_method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          saleId,
          sale.invoiceNo,
          customerId || null,
          normalizeText(sale.customerName) || "Walk-in Customer",
          mobile || null,
          normalizeNumber(sale.subtotal),
          normalizeNumber(sale.tax),
          normalizeNumber(sale.discount),
          normalizeNumber(sale.savings),
          normalizeNumber(sale.profit),
          normalizeNumber(sale.total),
          normalizeText(sale.paymentMethod) || "Cash",
          timestamp,
          timestamp
        ]
      );

      for (const item of sale.items) {
        const sku = normalizeText(item.sku);
        const barcode = normalizeText(item.barcode);
        let product = this.get("SELECT id, stock_qty FROM products WHERE sku = ? OR barcode = ?", [sku, barcode]);
        if (!product) {
          const productId = createId("prod");
          db.run(
            "INSERT INTO products (id, sku, barcode, name, unit, mrp, selling_price, purchase_price, gst_rate, stock_qty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
            [productId, sku, barcode || null, normalizeText(item.name), normalizeText(item.unit) || "pcs", normalizeNumber(item.mrp), normalizeNumber(item.sellingPrice), normalizeNumber(item.purchasePrice), normalizeNumber(item.gstRate), timestamp, timestamp]
          );
          product = { id: productId, stock_qty: 0 };
          this.enqueue(db, "product", productId, "upsert", item);
        }

        const quantity = normalizeNumber(item.quantity);
        db.run(
          "INSERT INTO sale_items (id, sale_id, product_id, sku, barcode, name, quantity, mrp, selling_price, purchase_price, gst_rate, line_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [createId("item"), saleId, product.id, sku, barcode || null, normalizeText(item.name), quantity, normalizeNumber(item.mrp), normalizeNumber(item.sellingPrice), normalizeNumber(item.purchasePrice), normalizeNumber(item.gstRate), normalizeNumber(item.lineTotal), timestamp, timestamp]
        );
        db.run("UPDATE products SET stock_qty = MAX(0, stock_qty - ?), updated_at = ? WHERE id = ?", [quantity, timestamp, product.id]);
        db.run(
          "INSERT INTO stock_movements (id, product_id, sku, barcode, movement_type, quantity, reference, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'Sale', ?, ?, ?, ?, ?)",
          [createId("move"), product.id, sku, barcode || null, -Math.abs(quantity), sale.invoiceNo, "Checkout sale", timestamp, timestamp]
        );
      }

      db.run(
        "INSERT INTO payments (id, sale_id, method, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [createId("pay"), saleId, normalizeText(sale.paymentMethod) || "Cash", normalizeNumber(sale.total), timestamp, timestamp]
      );

      this.enqueue(db, "sale", saleId, "upsert", sale);
      this.audit(db, "sale", saleId, "checkout", sale);
      return { ok: true, saleId, duplicate: false };
    });
  }

  findProductByBarcode(barcode) {
    const value = normalizeText(barcode);
    if (!value) return null;
    return this.get("SELECT * FROM products WHERE barcode = ? OR sku = ? LIMIT 1", [value, value]);
  }

  searchProducts(query) {
    const value = `%${escapeLike(query)}%`;
    return this.query("SELECT * FROM products WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ? ORDER BY name LIMIT 30", [value, value, value]);
  }

  getSyncQueue(limit = 50) {
    const timestamp = nowIso();
    return this.query(
      "SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') AND (next_retry_at IS NULL OR next_retry_at <= ?) ORDER BY created_at LIMIT ?",
      [timestamp, Math.max(1, Math.min(500, Number(limit) || 50))]
    );
  }

  markSyncStatus(id, status, error) {
    if (!statusValues.has(status)) throw new Error("Invalid sync status");
    return this.transaction((db) => {
      const item = this.get("SELECT * FROM sync_queue WHERE id = ?", [id]);
      if (!item) return { ok: false, message: "Sync queue item not found" };
      const timestamp = nowIso();
      const nextRetryCount = status === "failed" ? Number(item.retry_count || 0) + 1 : Number(item.retry_count || 0);
      const nextRetryAt = status === "failed" ? new Date(Date.now() + retryDelayMs(nextRetryCount - 1)).toISOString() : null;
      db.run(
        "UPDATE sync_queue SET status = ?, retry_count = ?, last_attempt_at = ?, next_retry_at = ?, last_error = ?, updated_at = ? WHERE id = ?",
        [status, nextRetryCount, timestamp, nextRetryAt, error || null, timestamp, id]
      );
      this.logSyncAttempt(db, id, String(item.entity_type), String(item.entity_id), status, error || null);
      return { ok: true };
    });
  }

  getSyncSummary() {
    const rows = this.query("SELECT status, COUNT(*) AS count FROM sync_queue GROUP BY status");
    const counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
    const logs = this.query("SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 25");
    return {
      pending: counts.pending || 0,
      processing: counts.processing || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      logs
    };
  }

  upsertCloudProducts(products) {
    if (!Array.isArray(products)) return { ok: false, count: 0 };
    return this.transaction((db) => {
      const timestamp = nowIso();
      let count = 0;
      for (const product of products) {
        const sku = normalizeText(product.sku || product.id);
        if (!sku) continue;
        const existing = this.get("SELECT updated_at FROM products WHERE sku = ?", [sku]);
        const incomingUpdatedAt = normalizeText(product.updatedAt || product.updated_at) || timestamp;
        if (existing?.updated_at && existing.updated_at > incomingUpdatedAt) continue;
        db.run(
          `INSERT INTO products (id, sku, barcode, name, brand, unit, mrp, selling_price, purchase_price, gst_rate, stock_qty, min_stock_qty, image_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, ?, ?)
           ON CONFLICT(sku) DO UPDATE SET
             barcode = excluded.barcode,
             name = excluded.name,
             brand = excluded.brand,
             unit = excluded.unit,
             mrp = excluded.mrp,
             selling_price = excluded.selling_price,
             purchase_price = excluded.purchase_price,
             gst_rate = excluded.gst_rate,
             stock_qty = excluded.stock_qty,
             min_stock_qty = excluded.min_stock_qty,
             image_url = excluded.image_url,
             updated_at = excluded.updated_at`,
          [
            normalizeText(product.id) || createId("prod"),
            sku,
            normalizeText(product.barcode) || null,
            normalizeText(product.name) || "Product",
            normalizeText(product.brand) || null,
            normalizeText(product.unit) || "pcs",
            normalizeNumber(product.mrp),
            normalizeNumber(product.sellingPrice ?? product.selling_price),
            normalizeNumber(product.purchasePrice ?? product.purchase_price ?? product.costPrice),
            normalizeNumber(product.gstRate ?? product.gst_rate),
            normalizeNumber(product.stock ?? product.stock_qty),
            normalizeNumber(product.lowStockThreshold ?? product.min_stock_qty),
            normalizeText(product.imageUrl ?? product.image_url) || null,
            normalizeText(product.createdAt ?? product.created_at) || timestamp,
            incomingUpdatedAt
          ]
        );
        count += 1;
      }
      return { ok: true, count };
    });
  }

  createBackup() {
    this.ensureBackupDir();
    this.persist();
    const date = new Date().toISOString().slice(0, 10);
    const backupPath = join(this.backupDir, `backup-${date}.db`);
    copyFileSync(this.dbPath, backupPath);
    this.pruneBackups(30);
    return { ok: true, path: backupPath };
  }

  pruneBackups(keepCount) {
    const files = readdirSync(this.backupDir)
      .filter((file) => /^backup-\d{4}-\d{2}-\d{2}\.db$/.test(file))
      .sort()
      .reverse();
    for (const file of files.slice(keepCount)) unlinkSync(join(this.backupDir, file));
  }

  restoreBackup(backupPath) {
    if (!existsSync(backupPath)) throw new Error("Backup file not found");
    const beforeRestore = `${this.dbPath}.before-restore-${Date.now()}`;
    if (existsSync(this.dbPath)) renameSync(this.dbPath, beforeRestore);
    copyFileSync(backupPath, this.dbPath);
    this.db?.close();
    this.db = new this.SQL.Database(readFileSync(this.dbPath));
    this.migrate();
    this.persist();
    return { ok: true, restoredFrom: backupPath, previousDatabase: beforeRestore };
  }

  exportDatabase(targetPath) {
    this.persist();
    copyFileSync(this.dbPath, targetPath);
    return { ok: true, path: targetPath };
  }
}

module.exports = { LocalDatabase };
