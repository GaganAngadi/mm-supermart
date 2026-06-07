import { apiRequest } from "@/lib/api";
import type { ProductInput, ProductRecord } from "@/lib/stores/product-store";

export type OnlineBarcodeProduct = {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  unit?: string;
  manufacturer?: string;
  description?: string;
  hsnCode?: string;
  source?: string;
  mrp?: number;
  sellingPrice?: number;
  gstRate?: number;
  stock?: number;
};

type RawBarcodeProduct = Omit<OnlineBarcodeProduct, "category"> & {
  category?: string | { name?: string };
};

export type PendingBarcodeProduct = Omit<OnlineBarcodeProduct, "mrp" | "sellingPrice" | "gstRate" | "stock"> & {
  mrp: string;
  sellingPrice: string;
  gst: string;
  stock: string;
};

function normalizeBarcode(value: string) {
  return value.replace(/\D/g, "").trim();
}

function normalizeUnit(value?: string) {
  const unit = value?.trim();
  return unit && unit.length <= 24 ? unit : "pcs";
}

function cleanCategoryLabel(value?: string) {
  const category = value?.trim();
  if (!category) return "";
  if (/^staples$/i.test(category)) return "Grocery";
  if (/^oils?$/i.test(category)) return "Oil";
  if (/^snakes$/i.test(category)) return "Snacks";
  return category;
}

function inferCategory(product: { name?: string; brand?: string; description?: string; category?: RawBarcodeProduct["category"] }) {
  const rawCategory = typeof product.category === "string" ? product.category : product.category?.name;
  const text = [product.name, product.brand, product.description, rawCategory].filter(Boolean).join(" ").toLowerCase();
  const hasAny = (...words: string[]) => words.some((word) => text.includes(word));

  if (hasAny("chips", "kurkure", "namkeen", "bhujia", "snack", "snacks", "mixture", "sev", "popcorn", "nachos", "wafers")) return "Snacks";
  if (hasAny("oil", "sunflower", "groundnut", "mustard", "soyabean", "coconut oil")) return "Oil";
  if (hasAny("paneer", "milk", "curd", "dahi", "butter", "cheese", "ghee", "cream", "lassi", "yogurt", "dairy")) return "Dairy";
  if (hasAny("biscuit", "cookie", "cookies", "rusk", "wafer", "cake")) return "Biscuits & Bakery";
  if (hasAny("masala", "spice", "spices", "chilli", "turmeric", "haldi", "jeera", "dhaniya", "pepper", "garam masala")) return "Spices & Masala";
  if (hasAny("rice", "atta", "flour", "dal", "pulses", "wheat", "sugar", "salt", "sooji", "maida")) return "Grocery";
  if (hasAny("tea", "coffee", "juice", "drink", "cola", "soda", "water", "beverage", "energy drink")) return "Beverages";
  if (hasAny("soap", "shampoo", "toothpaste", "brush", "cream", "lotion", "face wash", "deodorant")) return "Personal Care";
  if (hasAny("detergent", "cleaner", "dishwash", "phenyl", "floor", "toilet", "tissue", "napkin")) return "Household";
  if (rawCategory?.trim() && !/grocery|groceries|food/i.test(rawCategory)) return cleanCategoryLabel(rawCategory);
  return "Grocery";
}

function normalizeCategory(value?: RawBarcodeProduct["category"]) {
  return inferCategory({ category: value });
}

function normalizeLookupProduct(product: RawBarcodeProduct | null): OnlineBarcodeProduct | null {
  if (!product) return null;
  return {
    ...product,
    barcode: normalizeBarcode(product.barcode),
    category: inferCategory(product),
    mrp: Number(product.mrp) || undefined,
    sellingPrice: Number(product.sellingPrice) || undefined,
    gstRate: Number(product.gstRate) || undefined,
    stock: Number(product.stock) || undefined
  };
}

export function productToInput(product: PendingBarcodeProduct): ProductInput {
  const mrp = Number(product.mrp) || 0;
  return {
    name: product.name.trim(),
    barcode: normalizeBarcode(product.barcode),
    brand: product.brand?.trim() || undefined,
    category: inferCategory(product),
    description: product.description?.trim() || undefined,
    manufacturer: product.manufacturer?.trim() || undefined,
    imageUrl: product.imageUrl?.trim() || undefined,
    unit: normalizeUnit(product.unit),
    stock: Number(product.stock) || 0,
    gst: Number(product.gst) || 0,
    mrp,
    sellingPrice: Number(product.sellingPrice) || mrp
  };
}

export function productRecordToPending(product: ProductRecord): PendingBarcodeProduct {
  return {
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: product.imageUrl,
    unit: product.unit,
    manufacturer: product.manufacturer,
    description: product.description,
    mrp: String(product.mrp || ""),
    sellingPrice: String(product.sellingPrice || product.mrp || ""),
    gst: String(product.gst || ""),
    stock: String(product.stock || "")
  };
}

export async function lookupBarcodeOnline(barcode: string) {
  const cleanBarcode = normalizeBarcode(barcode);
  if (!cleanBarcode) throw new Error("Enter or scan a barcode first.");
  const result = await apiRequest<{ product: RawBarcodeProduct | null; suggestions: RawBarcodeProduct[]; source: string }>(`/products/barcode/${cleanBarcode}`);
  return {
    ...result,
    product: normalizeLookupProduct(result.product),
    suggestions: result.suggestions.map((product) => normalizeLookupProduct(product)).filter((product): product is OnlineBarcodeProduct => Boolean(product))
  };
}

export async function saveProductToBackend(product: ProductInput) {
  return apiRequest("/products/create", {
    method: "POST",
    body: JSON.stringify({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.category,
      brand: product.brand,
      description: product.description,
      imageUrl: product.imageUrl,
      unit: product.unit,
      mrp: Number(product.mrp) || 0,
      sellingPrice: Number(product.sellingPrice) || Number(product.mrp) || 0,
      gstRate: Number(product.gst) || 0,
      hsnCode: product.hsnCode,
      lowStockThreshold: 10
    })
  });
}
