"use client";

import type { InvoiceRecord } from "@/lib/stores/billing-store";
import { saveOfflineSale } from "@/lib/offline/offline-db";

type ElectronResult = { ok?: boolean; [key: string]: unknown };
export type DesktopPrinter = {
  name: string;
  displayName?: string;
  isDefault?: boolean;
  status?: string;
};

export type QrLabelPrintPayload = {
  printerName?: string;
  items: Array<{
    labelType?: "qr" | "barcode" | "inventory";
    name: string;
    sku: string;
    barcode: string;
    price: number;
    qrSvg?: string;
    barcodeSvg?: string;
    labelHtml?: string;
    valueMode: "barcode" | "sku";
  }>;
};

type MmPosBridge = {
  version?: () => Promise<string>;
  printReceipt?: () => Promise<ElectronResult>;
  backupNow?: () => Promise<ElectronResult>;
  databaseAPI?: {
    saveSale: (sale: InvoiceRecord) => Promise<ElectronResult>;
    findProductByBarcode: (barcode: string) => Promise<unknown>;
    searchProducts: (query: string) => Promise<unknown[]>;
  };
  printerAPI?: {
    printReceipt: () => Promise<ElectronResult>;
    openSettings?: () => Promise<ElectronResult>;
    listPrinters?: () => Promise<DesktopPrinter[]>;
    printQrLabels?: (payload: QrLabelPrintPayload) => Promise<ElectronResult>;
  };
  backupAPI?: {
    createBackup: () => Promise<ElectronResult>;
    listBackups: () => Promise<Array<{ name: string; path: string; size: number; sizeLabel: string; modifiedAt: string; status: string }>>;
    verifyBackup: (backupPath: string) => Promise<ElectronResult>;
    deleteBackup: (backupPath: string) => Promise<ElectronResult>;
    restoreBackup: (backupPath: string) => Promise<ElectronResult>;
    exportDatabase: (backupPath: string, targetPath: string) => Promise<ElectronResult>;
    uploadToDrive: (backupPath: string) => Promise<ElectronResult>;
    listDriveBackups: () => Promise<ElectronResult>;
    driveStorage: () => Promise<ElectronResult>;
    recoveryStatus: () => Promise<ElectronResult>;
    rebuildFromCloud: () => Promise<ElectronResult>;
    createYearEndArchive: () => Promise<ElectronResult>;
  };
  syncAPI?: {
    listQueue: (limit?: number) => Promise<unknown[]>;
    markStatus: (id: string, status: "pending" | "processing" | "completed" | "failed", error?: string) => Promise<ElectronResult>;
  };
};

declare global {
  interface Window {
    mmPos?: MmPosBridge;
  }
}

export function isElectronPos() {
  return typeof window !== "undefined" && Boolean(window.mmPos?.databaseAPI);
}

export async function saveSaleToLocalMaster(invoice: InvoiceRecord) {
  if (typeof window !== "undefined" && window.mmPos?.databaseAPI?.saveSale) {
    return window.mmPos.databaseAPI.saveSale(invoice);
  }
  await saveOfflineSale(invoice);
  return { ok: true, fallback: "indexeddb" };
}

export async function createLocalBackup() {
  if (typeof window === "undefined" || !window.mmPos?.backupAPI?.createBackup) {
    throw new Error("Desktop backup API is available only in the Electron app.");
  }
  return window.mmPos.backupAPI.createBackup();
}

export async function listLocalBackups() {
  if (typeof window === "undefined" || !window.mmPos?.backupAPI?.listBackups) return [];
  return window.mmPos.backupAPI.listBackups();
}

export async function verifyLocalBackup(path: string) {
  if (typeof window === "undefined" || !window.mmPos?.backupAPI?.verifyBackup) throw new Error("Desktop backup API is available only in the Electron app.");
  return window.mmPos.backupAPI.verifyBackup(path);
}

export async function deleteLocalBackup(path: string) {
  if (typeof window === "undefined" || !window.mmPos?.backupAPI?.deleteBackup) throw new Error("Desktop backup API is available only in the Electron app.");
  return window.mmPos.backupAPI.deleteBackup(path);
}

export async function restoreLocalBackup(path: string) {
  if (typeof window === "undefined" || !window.mmPos?.backupAPI?.restoreBackup) throw new Error("Desktop backup API is available only in the Electron app.");
  return window.mmPos.backupAPI.restoreBackup(path);
}

export async function uploadBackupToDrive(path: string) {
  if (typeof window === "undefined" || !window.mmPos?.backupAPI?.uploadToDrive) throw new Error("Google Drive upload is available only in the Electron app.");
  return window.mmPos.backupAPI.uploadToDrive(path);
}

export async function getRecoveryStatus() {
  if (typeof window === "undefined" || !window.mmPos?.backupAPI?.recoveryStatus) return null;
  return window.mmPos.backupAPI.recoveryStatus();
}

export async function createYearEndArchive() {
  if (typeof window === "undefined" || !window.mmPos?.backupAPI?.createYearEndArchive) throw new Error("Year-end archive is available only in the Electron app.");
  return window.mmPos.backupAPI.createYearEndArchive();
}

export async function listDesktopPrinters() {
  if (typeof window === "undefined" || !window.mmPos?.printerAPI?.listPrinters) return [];
  return window.mmPos.printerAPI.listPrinters();
}

export async function printQrLabelsDirect(payload: QrLabelPrintPayload) {
  if (typeof window === "undefined" || !window.mmPos?.printerAPI?.printQrLabels) {
    throw new Error("Direct label printing is available only in the Electron desktop app.");
  }
  return window.mmPos.printerAPI.printQrLabels(payload);
}
