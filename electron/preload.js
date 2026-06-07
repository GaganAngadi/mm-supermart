const { contextBridge, ipcRenderer } = require("electron");

const validSyncStatuses = new Set(["pending", "processing", "completed", "failed"]);

contextBridge.exposeInMainWorld("mmPos", {
  version: () => ipcRenderer.invoke("app:version"),
  printReceipt: () => ipcRenderer.invoke("print:receipt"),
  backupNow: () => ipcRenderer.invoke("backup:now"),
  databaseAPI: {
    saveSale: (sale) => ipcRenderer.invoke("database:sale:save", sale),
    findProductByBarcode: (barcode) => ipcRenderer.invoke("database:product:barcode", String(barcode || "")),
    searchProducts: (query) => ipcRenderer.invoke("database:products:search", String(query || ""))
  },
  printerAPI: {
    printReceipt: () => ipcRenderer.invoke("printer:receipt"),
    openSettings: () => ipcRenderer.invoke("printer:open-settings"),
    listPrinters: () => ipcRenderer.invoke("printer:list"),
    printQrLabels: (payload) => ipcRenderer.invoke("printer:qr-labels", payload)
  },
  backupAPI: {
    createBackup: () => ipcRenderer.invoke("backup:now"),
    listBackups: () => ipcRenderer.invoke("backup:list"),
    verifyBackup: (backupPath) => ipcRenderer.invoke("backup:verify", String(backupPath || "")),
    deleteBackup: (backupPath) => ipcRenderer.invoke("backup:delete", String(backupPath || "")),
    restoreBackup: (backupPath) => ipcRenderer.invoke("backup:restore", String(backupPath || "")),
    exportDatabase: (backupPath, targetPath) => ipcRenderer.invoke("backup:export", String(backupPath || ""), String(targetPath || "")),
    uploadToDrive: (backupPath) => ipcRenderer.invoke("drive:upload-backup", String(backupPath || "")),
    listDriveBackups: () => ipcRenderer.invoke("drive:list-backups"),
    driveStorage: () => ipcRenderer.invoke("drive:storage"),
    recoveryStatus: () => ipcRenderer.invoke("recovery:status"),
    rebuildFromCloud: () => ipcRenderer.invoke("recovery:cloud-rebuild"),
    createYearEndArchive: () => ipcRenderer.invoke("archive:create-year-end")
  },
  syncAPI: {
    listQueue: (limit) => ipcRenderer.invoke("sync:queue:list", Number(limit) || 50),
    summary: () => ipcRenderer.invoke("sync:summary"),
    runNow: () => ipcRenderer.invoke("sync:run"),
    markStatus: (id, status, error) => {
      if (!validSyncStatuses.has(status)) throw new Error("Invalid sync status");
      return ipcRenderer.invoke("sync:queue:status", { id: String(id || ""), status, error: error ? String(error) : undefined });
    }
  }
});
