"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { enqueueOfflineSync } from "@/lib/offline/sync-engine";
import { saveOfflineSale } from "@/lib/offline/offline-db";

export type InvoiceItem = {
  sku: string;
  name: string;
  barcode: string;
  hsnCode?: string;
  unit?: string;
  quantity: number;
  mrp: number;
  sellingPrice: number;
  purchasePrice: number;
  gstRate: number;
  gstMode?: "included" | "excluded";
  savings: number;
  profit: number;
  lineTotal: number;
};

export type InvoiceRecord = {
  invoiceNo: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGstin?: string;
  paymentMethod: "Cash" | "Card" | "UPI";
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  savings: number;
  profit: number;
  discount: number;
  total: number;
};

type BillingStore = {
  invoices: InvoiceRecord[];
  nextCustomerId: (mobile?: string) => string;
  addInvoice: (invoice: Omit<InvoiceRecord, "invoiceNo" | "createdAt">) => InvoiceRecord;
};

function invoiceDateStamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export const useBillingStore = create<BillingStore>()(
  persist(
    (set, get) => ({
      invoices: [],
      nextCustomerId: (mobile) => {
        const normalizedMobile = mobile?.replace(/\D/g, "");
        if (normalizedMobile) {
          const existing = get().invoices.find((invoice) => (invoice.customerMobile ?? "").replace(/\D/g, "") === normalizedMobile);
          if (existing) return existing.customerId;
        }
        const uniqueCustomers = new Set(get().invoices.map((invoice) => invoice.customerId).filter(Boolean));
        return `CUST-${String(uniqueCustomers.size + 1).padStart(4, "0")}`;
      },
      addInvoice: (input) => {
        const now = new Date();
        const stamp = invoiceDateStamp(now);
        const todaySequence = get().invoices.reduce((max, invoice) => {
          const match = invoice.invoiceNo.match(new RegExp(`^INV-${stamp}-(\\d+)$`));
          return match ? Math.max(max, Number(match[1])) : max;
        }, 0);
        const invoice: InvoiceRecord = {
          ...input,
          invoiceNo: `INV-${stamp}-${String(todaySequence + 1).padStart(4, "0")}`,
          createdAt: now.toISOString()
        };
        set({ invoices: [invoice, ...get().invoices] });
        void saveOfflineSale(invoice)
          .then(() => enqueueOfflineSync({
            entity: "sale",
            operation: "upsert",
            endpoint: "/sync/sales",
            method: "POST",
            payload: invoice,
            idempotencyKey: invoice.invoiceNo
          }))
          .catch(() => undefined);
        return invoice;
      }
    }),
    { name: "mm-supermart-invoices" }
  )
);
