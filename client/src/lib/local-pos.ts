"use client";

import { saveOfflineSale } from "@/lib/offline/offline-db";
import type { InvoiceRecord } from "@/lib/stores/billing-store";

type WebPosResult = { ok?: boolean; [key: string]: unknown };

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

export function isLocalPos() {
  return typeof window !== "undefined";
}

export async function saveSaleToLocalMaster(invoice: InvoiceRecord) {
  await saveOfflineSale(invoice);
  return { ok: true, fallback: "indexeddb" };
}

export async function createLocalBackup(): Promise<WebPosResult> {
  throw new Error("Local file backups are not available in the web app.");
}

export async function listLocalBackups() {
  return [];
}

export async function verifyLocalBackup(_path: string): Promise<WebPosResult> {
  throw new Error("Local backup verification is not available in the web app.");
}

export async function deleteLocalBackup(_path: string): Promise<WebPosResult> {
  throw new Error("Local backup deletion is not available in the web app.");
}

export async function restoreLocalBackup(_path: string): Promise<WebPosResult> {
  throw new Error("Local backup restore is not available in the web app.");
}

export async function uploadBackupToDrive(_path: string): Promise<WebPosResult> {
  throw new Error("Google Drive backup upload is not available in the web app.");
}

export async function getRecoveryStatus() {
  return null;
}

export async function createYearEndArchive(): Promise<WebPosResult> {
  throw new Error("Year-end local archive is not available in the web app.");
}

export async function listDesktopPrinters(): Promise<DesktopPrinter[]> {
  return [];
}

export async function printQrLabelsDirect(_payload: QrLabelPrintPayload): Promise<WebPosResult> {
  throw new Error("Direct printer access is not available in the web app. Use the browser print dialog.");
}
