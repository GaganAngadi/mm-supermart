"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProductRecord = {
  name: string;
  sku: string;
  barcode: string;
  barcodeType?: string;
  qrCode?: string;
  lastPrintedAt?: string;
  itemNameKn?: string;
  mainCategory?: string;
  subCategory?: string;
  dealerPrice?: number;
  discountPercent?: number;
  sgst?: number;
  cgst?: number;
  igst?: number;
  active?: boolean;
  allowNegativeStock?: boolean;
  labelWidth?: number;
  labelHeight?: number;
  printCount?: number;
  category: string;
  brand?: string;
  description?: string;
  manufacturer?: string;
  hsnCode?: string;
  packing?: string;
  size?: string;
  minStockLevel?: number;
  minStockQty?: number;
  rackLocation?: string;
  salesAccount?: string;
  purchaseAccount?: string;
  unit: string;
  batch: string;
  expiry: string;
  manufactureDate: string;
  expiryDate: string;
  purchasedBy: string;
  gstMode: "included" | "excluded";
  stock: number;
  gst: number;
  mrp: number;
  sellingPrice: number;
  purchasePrice: number;
  imageUrl?: string;
};

export type ProductInput = Omit<ProductRecord, "sku" | "barcode" | "batch" | "expiry" | "manufactureDate" | "expiryDate" | "purchasedBy" | "gstMode" | "purchasePrice"> & {
  sku?: string;
  barcode?: string;
  barcodeType?: string;
  qrCode?: string;
  lastPrintedAt?: string;
  itemNameKn?: string;
  mainCategory?: string;
  subCategory?: string;
  dealerPrice?: number;
  discountPercent?: number;
  sgst?: number;
  cgst?: number;
  igst?: number;
  active?: boolean;
  allowNegativeStock?: boolean;
  labelWidth?: number;
  labelHeight?: number;
  printCount?: number;
  purchasePrice?: number;
  manufactureDate?: string;
  expiryDate?: string;
  purchasedBy?: string;
  gstMode?: "included" | "excluded";
};

type ProductStore = {
  products: ProductRecord[];
  addProduct: (product: ProductInput) => ProductRecord;
  upsertProducts: (products: ProductInput[]) => ProductRecord[];
  updateProduct: (sku: string, product: Partial<ProductInput>) => void;
  deleteProduct: (sku: string) => void;
  updateStock: (sku: string, quantityDelta: number) => void;
};

function generateBarcode() {
  const digits = `${Date.now()}`.replace(/\D/g, "").slice(-12).padStart(12, "0");
  const sum = digits.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return `${digits}${check}`;
}

function generateSku(name: string, count: number) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18) || "PRODUCT";
  return `MM-${base}-${String(count + 1).padStart(4, "0")}`;
}

export function makeInventoryBarcode(sequence: number) {
  return `MMM${String(Math.max(1, sequence)).padStart(6, "0")}`;
}

export const useProductStore = create<ProductStore>()(
  persist(
    (set, get) => ({
      products: [],
      addProduct: (input) => {
        const products = get().products;
        const product: ProductRecord = {
          ...input,
          sku: input.sku || generateSku(input.name, products.length),
          barcode: input.barcode || makeInventoryBarcode(products.length + 1),
          barcodeType: input.barcodeType || "CODE128",
          qrCode: input.qrCode,
          lastPrintedAt: input.lastPrintedAt,
          active: input.active ?? true,
          allowNegativeStock: input.allowNegativeStock ?? false,
          labelWidth: input.labelWidth ?? 50,
          labelHeight: input.labelHeight ?? 25,
          printCount: input.printCount ?? 0,
          purchasePrice: Number(input.purchasePrice) || Math.max(0, (Number(input.sellingPrice) || Number(input.mrp) || 0) * 0.85),
          batch: "USER",
          manufactureDate: input.manufactureDate || "Not tracked",
          expiryDate: input.expiryDate || "Not tracked",
          purchasedBy: input.purchasedBy || "Direct Purchase",
          gstMode: input.gstMode || "included",
          expiry: input.expiryDate || "Not tracked"
        };
        set({ products: [product, ...products] });
        return product;
      },
      upsertProducts: (inputs) => {
        const currentProducts = get().products;
        const nextProducts = [...currentProducts];
        const savedProducts: ProductRecord[] = [];

        for (const input of inputs) {
          const existingIndex = nextProducts.findIndex((product) =>
            (input.sku && product.sku.toLowerCase() === input.sku.toLowerCase()) ||
            (input.barcode && product.barcode.toLowerCase() === input.barcode.toLowerCase())
          );

          if (existingIndex >= 0) {
            const existing = nextProducts[existingIndex];
            const updated: ProductRecord = {
              ...existing,
              ...input,
              sku: existing.sku,
              barcode: input.barcode || existing.barcode,
              barcodeType: input.barcodeType || existing.barcodeType || "CODE128",
              qrCode: input.qrCode ?? existing.qrCode,
              lastPrintedAt: input.lastPrintedAt ?? existing.lastPrintedAt,
              active: input.active ?? existing.active ?? true,
              allowNegativeStock: input.allowNegativeStock ?? existing.allowNegativeStock ?? false,
              labelWidth: input.labelWidth ?? existing.labelWidth ?? 50,
              labelHeight: input.labelHeight ?? existing.labelHeight ?? 25,
              printCount: input.printCount ?? existing.printCount ?? 0,
              batch: existing.batch,
              manufactureDate: input.manufactureDate || existing.manufactureDate || "Not tracked",
              expiryDate: input.expiryDate || existing.expiryDate || existing.expiry || "Not tracked",
              purchasedBy: input.purchasedBy || existing.purchasedBy || "Direct Purchase",
              gstMode: input.gstMode || existing.gstMode || "included",
              expiry: input.expiryDate || existing.expiryDate || existing.expiry,
              purchasePrice: Number(input.purchasePrice) || existing.purchasePrice || Math.max(0, (Number(input.sellingPrice) || Number(input.mrp) || 0) * 0.85),
              stock: Math.max(0, Number(input.stock) || 0)
            };
            nextProducts[existingIndex] = updated;
            savedProducts.push(updated);
            continue;
          }

          const product: ProductRecord = {
            ...input,
            sku: input.sku || generateSku(input.name, nextProducts.length),
            barcode: input.barcode || makeInventoryBarcode(nextProducts.length + 1),
            barcodeType: input.barcodeType || "CODE128",
            qrCode: input.qrCode,
            lastPrintedAt: input.lastPrintedAt,
            active: input.active ?? true,
            allowNegativeStock: input.allowNegativeStock ?? false,
            labelWidth: input.labelWidth ?? 50,
            labelHeight: input.labelHeight ?? 25,
            printCount: input.printCount ?? 0,
            purchasePrice: Number(input.purchasePrice) || Math.max(0, (Number(input.sellingPrice) || Number(input.mrp) || 0) * 0.85),
            batch: "IMPORT",
            manufactureDate: input.manufactureDate || "Not tracked",
            expiryDate: input.expiryDate || "Not tracked",
            purchasedBy: input.purchasedBy || "Import",
            gstMode: input.gstMode || "included",
            expiry: input.expiryDate || "Not tracked"
          };
          nextProducts.unshift(product);
          savedProducts.push(product);
        }

        set({ products: nextProducts });
        return savedProducts;
      },
      updateProduct: (sku, input) => {
        set({
          products: get().products.map((product) =>
            product.sku === sku
              ? {
                  ...product,
                  ...input,
                  sku: product.sku,
                  barcode: input.barcode || product.barcode,
                  barcodeType: input.barcodeType || product.barcodeType || "CODE128",
                  qrCode: input.qrCode ?? product.qrCode,
                  lastPrintedAt: input.lastPrintedAt ?? product.lastPrintedAt,
                  active: input.active ?? product.active ?? true,
                  allowNegativeStock: input.allowNegativeStock ?? product.allowNegativeStock ?? false,
                  labelWidth: input.labelWidth ?? product.labelWidth ?? 50,
                  labelHeight: input.labelHeight ?? product.labelHeight ?? 25,
                  printCount: input.printCount ?? product.printCount ?? 0,
                  purchasePrice: input.purchasePrice !== undefined ? Number(input.purchasePrice) : product.purchasePrice,
                  manufactureDate: input.manufactureDate || product.manufactureDate,
                  expiryDate: input.expiryDate || product.expiryDate,
                  expiry: input.expiryDate || product.expiry,
                  purchasedBy: input.purchasedBy || product.purchasedBy,
                  gstMode: input.gstMode || product.gstMode
                }
              : product
          )
        });
      },
      deleteProduct: (sku) => {
        set({ products: get().products.filter((product) => product.sku !== sku) });
      },
      updateStock: (sku, quantityDelta) => {
        set({
          products: get().products.map((product) =>
            product.sku === sku ? { ...product, stock: Math.max(0, product.stock + quantityDelta) } : product
          )
        });
      }
    }),
    { name: "mm-supermart-products" }
  )
);

export function makeBarcode() {
  return generateBarcode();
}
