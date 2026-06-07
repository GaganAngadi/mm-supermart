"use client";

import Dexie, { type Table } from "dexie";
import type { InvoiceRecord } from "@/lib/stores/billing-store";
import type { ProductRecord } from "@/lib/stores/product-store";

export type OfflineProduct = ProductRecord & {
  serverId?: string;
  deletedAt?: string;
  createdAt?: string;
  updatedAt: string;
};

export type OfflineCustomer = {
  id: string;
  serverId?: string;
  name: string;
  mobile: string;
  loyaltyPoints: number;
  creditBalance: number;
  purchaseCount: number;
  lastPurchaseAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OfflineStockMovement = {
  id: string;
  serverId?: string;
  productSku: string;
  barcode?: string;
  type: "Stock In" | "Stock Out" | "Sale" | "Return" | "Adjustment" | "Transfer" | "Damage";
  quantity: number;
  reference?: string;
  note?: string;
  createdAt: string;
  syncedAt?: string;
};

export type SyncEntity = "product" | "customer" | "sale" | "stockMovement" | "expense" | "supplier" | "purchase";
export type SyncOperation = "create" | "update" | "delete" | "upsert";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export type OfflineSyncQueueItem = {
  id: string;
  entity: SyncEntity;
  operation: SyncOperation;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  payload: unknown;
  idempotencyKey: string;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
};

export type OfflineSyncLog = {
  id: string;
  queueId?: string;
  entity: SyncEntity;
  operation: SyncOperation;
  status: SyncStatus;
  message: string;
  createdAt: string;
};

export type OfflineMeta = {
  key: string;
  value: string;
  updatedAt: string;
};

export class MmOfflineDatabase extends Dexie {
  products!: Table<OfflineProduct, string>;
  customers!: Table<OfflineCustomer, string>;
  sales!: Table<InvoiceRecord, string>;
  stockMovements!: Table<OfflineStockMovement, string>;
  syncQueue!: Table<OfflineSyncQueueItem, string>;
  syncLogs!: Table<OfflineSyncLog, string>;
  meta!: Table<OfflineMeta, string>;

  constructor() {
    super("mm-supermart-offline-pos");
    this.version(1).stores({
      products: "sku, barcode, name, category, updatedAt, deletedAt",
      customers: "id, serverId, mobile, name, updatedAt, deletedAt",
      sales: "invoiceNo, createdAt, customerId, customerMobile, paymentMethod",
      stockMovements: "id, productSku, barcode, type, createdAt, syncedAt",
      syncQueue: "id, entity, operation, status, nextRetryAt, idempotencyKey, createdAt",
      syncLogs: "id, queueId, entity, operation, status, createdAt",
      meta: "key"
    });
  }
}

export const offlineDb = new MmOfflineDatabase();

export function createOfflineId(prefix: string) {
  const randomPart = crypto.getRandomValues(new Uint32Array(2)).join("");
  return `${prefix}-${Date.now()}-${randomPart}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function upsertOfflineProducts(products: ProductRecord[]) {
  const timestamp = nowIso();
  await offlineDb.products.bulkPut(products.map((product) => ({ ...product, updatedAt: timestamp })));
  await offlineDb.meta.put({ key: "products:lastLocalWriteAt", value: timestamp, updatedAt: timestamp });
}

export async function saveOfflineSale(invoice: InvoiceRecord) {
  await offlineDb.sales.put(invoice);
  await offlineDb.stockMovements.bulkPut(invoice.items.map((item) => ({
    id: createOfflineId("move"),
    productSku: item.sku,
    barcode: item.barcode,
    type: "Sale",
    quantity: -Math.abs(item.quantity),
    reference: invoice.invoiceNo,
    note: `Offline sale ${invoice.invoiceNo}`,
    createdAt: invoice.createdAt
  })));
}
