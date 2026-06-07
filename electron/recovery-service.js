class RecoveryService {
  constructor({ database, backupService, googleDriveService, syncService, logger }) {
    this.database = database;
    this.backupService = backupService;
    this.googleDriveService = googleDriveService;
    this.syncService = syncService;
    this.logger = logger || (() => undefined);
  }

  async getRecoveryStatus() {
    const localBackups = this.backupService.listBackups();
    const driveBackups = await this.googleDriveService.listBackups().catch((error) => ({ ok: false, configured: false, files: [], message: error.message }));
    const syncSummary = this.database.getSyncSummary();
    return {
      localDatabasePath: this.database.dbPath,
      localBackupCount: localBackups.length,
      latestLocalBackup: localBackups[0] || null,
      googleDriveConfigured: Boolean(driveBackups.configured),
      latestDriveBackup: driveBackups.files?.[0] || null,
      syncSummary,
      disasterRecoveryOrder: ["Local SQLite database", "Local backup folder", "Google Drive backup", "PostgreSQL cloud sync"]
    };
  }

  async rebuildFromCloud() {
    if (!this.syncService) throw new Error("Sync service is not available");
    await this.syncService.pullProducts();
    const productCount = this.database.query("SELECT COUNT(*) AS count FROM products")[0]?.count || 0;
    return { ok: true, productCount };
  }

  async validateAndRestoreLocalBackup(path) {
    const validation = await this.backupService.validateBackup(path);
    if (!validation.ok) return { ok: false, validation };
    const restore = await this.backupService.restoreBackup(path);
    return { ok: true, validation, restore, restartRequired: true };
  }
}

module.exports = { RecoveryService };
