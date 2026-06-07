const initSqlJs = require("sql.js");
const { createHash, randomUUID } = require("node:crypto");
const { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");

const requiredTables = [
  "products",
  "customers",
  "suppliers",
  "sales",
  "sale_items",
  "payments",
  "expenses",
  "stock_movements",
  "settings",
  "sync_queue",
  "sync_logs",
  "audit_logs"
];

function timestampParts(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

class BackupService {
  constructor({ database, userDataPath, logger }) {
    this.database = database;
    this.userDataPath = userDataPath;
    this.preferredBackupDir = "C:\\MMSuperMart\\Backups";
    this.backupDir = this.preferredBackupDir;
    this.logger = logger || (() => undefined);
    this.SQL = null;
  }

  async init() {
    this.ensureBackupDir();
    this.SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
    return this;
  }

  ensureBackupDir() {
    try {
      mkdirSync(this.preferredBackupDir, { recursive: true });
      const probe = join(this.preferredBackupDir, `.write-test-${randomUUID()}.tmp`);
      writeFileSync(probe, "ok");
      unlinkSync(probe);
      this.backupDir = this.preferredBackupDir;
    } catch {
      this.backupDir = join(this.userDataPath, "Backups");
      mkdirSync(this.backupDir, { recursive: true });
    }
    return this.backupDir;
  }

  backupTierDir(tier = "Daily") {
    const safeTier = ["Daily", "Weekly", "Monthly", "Yearly"].includes(tier) ? tier : "Daily";
    const dir = join(this.ensureBackupDir(), safeTier);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  log(action, status, payload) {
    try {
      const now = new Date().toISOString();
      this.database.run(
        "INSERT INTO audit_logs (id, entity_type, entity_id, action, payload_json, created_at, updated_at) VALUES (?, 'backup', ?, ?, ?, ?, ?)",
        [`backup-log-${Date.now()}-${Math.random().toString(16).slice(2)}`, payload?.path || null, action, JSON.stringify({ status, ...payload }), now, now]
      );
      this.database.persist();
    } catch (error) {
      this.logger(`backup log failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  backupFileName(date = new Date()) {
    return `backup-${timestampParts(date)}.db`;
  }

  listBackups() {
    this.ensureBackupDir();
    const tiers = ["Daily", "Weekly", "Monthly", "Yearly"];
    return tiers.flatMap((tier) => {
      const dir = this.backupTierDir(tier);
      return readdirSync(dir)
        .filter((file) => /^backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.db$/.test(file) || /^backup-\d{4}-\d{2}-\d{2}\.db$/.test(file))
        .map((file) => {
          const path = join(dir, file);
          const stat = statSync(path);
          return {
            name: file,
            tier,
            path,
            size: stat.size,
            sizeLabel: formatBytes(stat.size),
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
            status: stat.size > 0 ? "available" : "empty"
          };
        });
    })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async validateBackup(path) {
    if (!existsSync(path)) return { ok: false, status: "missing", path, message: "Backup file not found" };
    const stat = statSync(path);
    if (stat.size < 1024) return { ok: false, status: "invalid", path, size: stat.size, message: "Backup file is too small" };
    let db;
    try {
      db = new this.SQL.Database(readFileSync(path));
      const integrity = db.exec("PRAGMA integrity_check;");
      const integrityValue = integrity?.[0]?.values?.[0]?.[0];
      if (integrityValue !== "ok") return { ok: false, status: "corrupt", path, size: stat.size, message: `SQLite integrity check failed: ${integrityValue}` };
      const tableRows = db.exec("SELECT name FROM sqlite_master WHERE type='table';")?.[0]?.values?.flat().map(String) || [];
      const missingTables = requiredTables.filter((table) => !tableRows.includes(table));
      if (missingTables.length) return { ok: false, status: "invalid_schema", path, size: stat.size, missingTables, message: `Missing tables: ${missingTables.join(", ")}` };
      const recordCounts = {};
      for (const table of requiredTables) {
        recordCounts[table] = Number(db.exec(`SELECT COUNT(*) FROM ${table};`)?.[0]?.values?.[0]?.[0] || 0);
      }
      return {
        ok: true,
        status: "verified",
        path,
        name: basename(path),
        size: stat.size,
        sizeLabel: formatBytes(stat.size),
        checksum: sha256File(path),
        recordCounts,
        verifiedAt: new Date().toISOString()
      };
    } catch (error) {
      return { ok: false, status: "corrupt", path, size: stat.size, message: error instanceof Error ? error.message : "Backup validation failed" };
    } finally {
      db?.close();
    }
  }

  async createBackup({ uploadToDrive, tier = "Daily" } = {}) {
    this.ensureBackupDir();
    this.database.persist();
    const source = this.database.dbPath;
    const destination = join(this.backupTierDir(tier), this.backupFileName());
    copyFileSync(source, destination);
    const validation = await this.validateBackup(destination);
    if (!validation.ok) {
      this.log("create", "failed", { path: destination, message: validation.message });
      throw new Error(validation.message || "Backup validation failed");
    }
    this.applyRetentionPolicy();
    this.log("create", "verified", { ...validation, tier });
    return { ...validation, tier, uploadRequested: Boolean(uploadToDrive) };
  }

  pruneBackups(tier, keepCount) {
    const backups = this.listBackups().filter((backup) => backup.tier === tier);
    for (const backup of backups.slice(keepCount)) {
      unlinkSync(backup.path);
      this.log("delete-old", "completed", { path: backup.path });
    }
  }

  applyRetentionPolicy() {
    this.pruneBackups("Daily", 90);
    this.pruneBackups("Weekly", 52);
    this.pruneBackups("Monthly", 24);
    this.pruneBackups("Yearly", 10);
  }

  async deleteBackup(path) {
    const validation = await this.validateBackup(path);
    if (!existsSync(path)) return { ok: false, message: "Backup file not found" };
    unlinkSync(path);
    this.log("delete", "completed", { path, priorStatus: validation.status });
    return { ok: true, path };
  }

  async restoreBackup(path) {
    const validation = await this.validateBackup(path);
    if (!validation.ok) throw new Error(validation.message || "Invalid backup file");
    const currentPath = this.database.dbPath;
    const beforeRestore = `${currentPath}.before-restore-${Date.now()}`;
    this.database.persist();
    if (existsSync(currentPath)) renameSync(currentPath, beforeRestore);
    copyFileSync(path, currentPath);
    this.database.db?.close();
    this.database.db = new this.database.SQL.Database(readFileSync(currentPath));
    this.database.migrate();
    this.database.persist();
    this.log("restore", "completed", { path, beforeRestore, checksum: validation.checksum });
    return { ok: true, restoredFrom: path, previousDatabase: beforeRestore, validation };
  }

  exportBackup(path, targetPath) {
    if (!existsSync(path)) throw new Error("Backup file not found");
    copyFileSync(path, targetPath);
    this.log("download", "completed", { path, targetPath });
    return { ok: true, path: targetPath };
  }

  writeMetadata(path, metadata) {
    writeFileSync(`${path}.json`, JSON.stringify(metadata, null, 2));
  }
}

module.exports = { BackupService };
