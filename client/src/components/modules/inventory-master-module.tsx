"use client";

import { Barcode, Download, FileSpreadsheet, FileText, Filter, ImagePlus, PackagePlus, Pencil, Printer, RefreshCw, ScanText, Search, Trash2, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { barcodeSvgToDataUrl, generateBarcodeSvg } from "@/lib/barcode";
import { listDesktopPrinters, printQrLabelsDirect, type DesktopPrinter } from "@/lib/local-pos";
import { lookupBarcodeOnline, productToInput, saveProductToBackend, type PendingBarcodeProduct } from "@/lib/product-lookup";
import { makeBarcode, useProductStore } from "@/lib/stores/product-store";
import { formatCurrency } from "@/lib/utils";

type MovementType = "" | "Stock In" | "Stock Out" | "Branch Transfer";

type ProductForm = {
  itemCode: string;
  name: string;
  category: string;
  mainGroup: string;
  subGroup: string;
  unit: string;
  mrp: string;
  gst: string;
  sgst: string;
  cgst: string;
  igst: string;
  stock: string;
  stockDate: string;
  barcode: string;
  brand: string;
  supplierName: string;
  hsnCode: string;
  sellingPrice: string;
  costPrice: string;
  discountPercent: string;
  value: string;
  dealerPrice: string;
  dealerMargin: string;
  expiryDate: string;
  itemNameKn: string;
  packing: string;
  size: string;
  salesAccount: string;
  purchaseAccount: string;
  gstMode: "included" | "excluded";
  minStockLevel: string;
  minStockQty: string;
  rackLocation: string;
  lastSrNo: string;
  autoCode: boolean;
  companyBarCode: boolean;
  carryOn: boolean;
  imageUrl: string;
  description: string;
};

type OcrInventoryRow = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  price: string;
  category: string;
};

type ExcelInventoryRow = OcrInventoryRow & {
  barcode: string;
  brand: string;
  gst: string;
  hsnCode: string;
};

const emptyForm: ProductForm = {
  itemCode: "",
  name: "",
  category: "",
  mainGroup: "",
  subGroup: "",
  unit: "",
  mrp: "",
  gst: "",
  sgst: "",
  cgst: "",
  igst: "",
  stock: "",
  stockDate: "",
  barcode: "",
  brand: "",
  supplierName: "",
  hsnCode: "",
  sellingPrice: "",
  costPrice: "",
  discountPercent: "",
  value: "",
  dealerPrice: "",
  dealerMargin: "",
  expiryDate: "",
  itemNameKn: "",
  packing: "",
  size: "",
  salesAccount: "",
  purchaseAccount: "",
  gstMode: "excluded",
  minStockLevel: "",
  minStockQty: "",
  rackLocation: "",
  lastSrNo: "",
  autoCode: false,
  companyBarCode: false,
  carryOn: false,
  imageUrl: "",
  description: ""
};

const inventoryCategories = ["Grocery", "Oil", "Snacks", "Dry Fruits", "Masala", "Dairy", "Beverages", "Personal Care", "Household", "Biscuits & Bakery"];
const supplierStorageKey = "mm-supplier-accounts";
const inventorySubGroups: Record<string, string[]> = {
  Grocery: ["Rice", "Atta & Flour", "Dal & Pulses", "Sugar", "Salt", "Sooji & Rava", "Poha", "Loose Grocery", "Packed Grocery"],
  Oil: ["Sunflower Oil", "Groundnut Oil", "Mustard Oil", "Coconut Oil", "Gingelly Oil", "Ghee"],
  Snacks: ["Chips", "Namkeen", "Mixture", "Sev", "Popcorn", "Ready Snacks"],
  "Dry Fruits": ["Almonds", "Cashews", "Raisins", "Dates", "Pista", "Mixed Dry Fruits"],
  Masala: ["Whole Spices", "Powder Masala", "Chilli", "Turmeric", "Jeera", "Dhaniya", "Garam Masala"],
  Dairy: ["Milk", "Curd", "Paneer", "Butter", "Cheese", "Lassi"],
  Beverages: ["Tea", "Coffee", "Juice", "Soft Drinks", "Water", "Energy Drinks"],
  "Personal Care": ["Soap", "Shampoo", "Toothpaste", "Cream", "Deodorant", "Face Wash"],
  Household: ["Detergent", "Dishwash", "Cleaner", "Phenyl", "Tissue", "Napkin"],
  "Biscuits & Bakery": ["Biscuits", "Cookies", "Rusk", "Cake", "Bread", "Bakery"]
};
const unitOptions = ["pcs", "kg", "g", "ltr", "ml", "box", "pkt", "bag", "dozen"];
const accountOptions = ["Sales A/C", "Retail Sales", "GST Sales", "Purchase A/C", "Local Purchase", "GST Purchase"];

function cleanBarcode(value: string) {
  return value.replace(/[\s-]+/g, "").trim();
}

function normalizeInventoryCategory(value = "") {
  const category = value.trim();
  if (!category) return "";
  if (/^staples$/i.test(category)) return "Grocery";
  if (/^rice$/i.test(category)) return "Grocery";
  if (/^oils?$/i.test(category)) return "Oil";
  if (/^snakes$/i.test(category)) return "Snacks";
  return category;
}

function inferSubGroup(name = "", mainGroup = "") {
  const text = `${name} ${mainGroup}`.toLowerCase();
  const hasAny = (...words: string[]) => words.some((word) => text.includes(word));

  if (mainGroup === "Grocery") {
    if (hasAny("rice", "basmati", "sona masoori")) return "Rice";
    if (hasAny("atta", "flour", "maida", "wheat")) return "Atta & Flour";
    if (hasAny("dal", "pulse", "pulses", "chana", "toor", "moong", "urad", "masoor")) return "Dal & Pulses";
    if (hasAny("sugar")) return "Sugar";
    if (hasAny("salt")) return "Salt";
    if (hasAny("sooji", "rava")) return "Sooji & Rava";
    if (hasAny("poha")) return "Poha";
  }
  if (mainGroup === "Oil") {
    if (hasAny("sunflower")) return "Sunflower Oil";
    if (hasAny("groundnut")) return "Groundnut Oil";
    if (hasAny("mustard")) return "Mustard Oil";
    if (hasAny("coconut")) return "Coconut Oil";
    if (hasAny("ghee")) return "Ghee";
  }
  if (mainGroup === "Snacks") {
    if (hasAny("chips")) return "Chips";
    if (hasAny("namkeen", "bhujia", "sev")) return "Namkeen";
    if (hasAny("mixture")) return "Mixture";
  }
  return "";
}

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function legacyDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-sm font-semibold text-foreground">{children}</label>;
}

function MasterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function toPendingProduct(form: ProductForm): PendingBarcodeProduct {
  return {
    barcode: cleanBarcode(form.barcode),
    name: form.name,
    brand: form.brand,
    category: normalizeInventoryCategory(form.mainGroup || form.category),
    unit: form.unit,
    imageUrl: form.imageUrl,
    description: form.description,
    mrp: form.mrp,
    sellingPrice: form.sellingPrice || form.mrp,
    gst: form.gst || form.igst || form.sgst || form.cgst,
    stock: form.stock
  };
}

function parseBillText(text: string): OcrInventoryRow[] {
  const ignored = /\b(total|subtotal|sub total|grand|cash|card|upi|gst|cgst|sgst|tax|invoice|bill|date|time|round|balance|paid|change|amount|qty|rate|mrp)\b/i;
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|_]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && !ignored.test(line))
    .map((line, index) => {
      const numbers = line.match(/\d+(?:\.\d{1,2})?/g) ?? [];
      const price = numbers.at(-1) ?? "0";
      const possibleQty = numbers.length > 1 ? numbers[0] : "1";
      const name = line
        .replace(/\b\d+(?:\.\d{1,2})?\b/g, " ")
        .replace(/\b(rs|inr|pcs|pc|qty|x)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!name || name.length < 3) return null;
      return {
        id: `${Date.now()}-${index}`,
        name,
        quantity: possibleQty,
        unit: "pcs",
        price,
        category: "Grocery"
      };
    })
    .filter((row): row is OcrInventoryRow => Boolean(row))
    .slice(0, 80);
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "barcode";
}

function normalizeHsnCode(value = "") {
  return value.replace(/\D/g, "").trim();
}

function inferHsnCode(name = "", category = "") {
  const text = `${name} ${category}`.toLowerCase();
  const hasAny = (...words: string[]) => words.some((word) => text.includes(word));

  if (hasAny("milk")) return "040120";
  if (hasAny("curd", "dahi", "yogurt", "lassi")) return "040390";
  if (hasAny("paneer", "cheese")) return "040610";
  if (hasAny("ghee", "butter")) return "040590";
  if (hasAny("rice", "basmati")) return "100630";
  if (hasAny("atta", "wheat flour", "maida", "flour")) return "110100";
  if (hasAny("dal", "pulse", "pulses", "chana", "toor", "moong", "urad", "masoor")) return "071390";
  if (hasAny("sugar")) return "170199";
  if (hasAny("salt")) return "250100";
  if (hasAny("oil", "sunflower", "groundnut", "mustard", "soyabean", "coconut oil")) return "151219";
  if (hasAny("tea")) return "090240";
  if (hasAny("coffee")) return "090190";
  if (hasAny("masala", "spice", "spices", "chilli", "turmeric", "haldi", "jeera", "dhaniya", "pepper")) return "091091";
  if (hasAny("biscuit", "cookie", "rusk", "cake", "bakery")) return "190590";
  if (hasAny("noodle", "pasta", "vermicelli")) return "190230";
  if (hasAny("namkeen", "snack", "chips", "mixture", "sev", "bhujia", "kurkure")) return "210690";
  if (hasAny("jam", "sauce", "ketchup", "pickle")) return "200190";
  if (hasAny("juice")) return "200989";
  if (hasAny("water")) return "220110";
  if (hasAny("cola", "soft drink", "soda", "beverage")) return "220210";
  if (hasAny("soap")) return "340111";
  if (hasAny("detergent", "dishwash", "cleaner", "phenyl")) return "340290";
  if (hasAny("shampoo")) return "330510";
  if (hasAny("toothpaste", "tooth brush", "toothbrush")) return "330610";
  if (hasAny("cream", "lotion", "deodorant", "perfume", "face wash")) return "330499";

  return "";
}

function getExcelValue(row: Record<string, unknown>, names: string[]) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]+/g, ""), value]));
  for (const name of names) {
    const value = normalized[name.toLowerCase().replace(/[^a-z0-9]+/g, "")];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizeExcelRows(rows: Record<string, unknown>[]) {
  return rows
    .map((row, index): ExcelInventoryRow | null => {
      const name = getExcelValue(row, ["name", "product", "productname", "item", "itemname", "description", "particulars"]);
      if (!name) return null;
      const price = getExcelValue(row, ["mrp", "price", "rate", "sellingprice", "saleprice", "amount"]);
      return {
        id: `excel-${Date.now()}-${index}`,
        name,
        quantity: getExcelValue(row, ["stock", "openingstock", "qty", "quantity", "currentstock"]) || "",
        unit: getExcelValue(row, ["unit", "uom", "packing", "size"]) || "",
        price,
        category: normalizeInventoryCategory(getExcelValue(row, ["category", "group", "maingroup"])),
        barcode: cleanBarcode(getExcelValue(row, ["barcode", "barcodenumber", "ean", "upc", "code"])),
        brand: getExcelValue(row, ["brand", "company", "companyname", "manufacturer"]),
        gst: getExcelValue(row, ["gst", "gstrate", "tax", "taxrate"]) || "",
      hsnCode: normalizeHsnCode(getExcelValue(row, ["hsn", "hsncode", "hsnsac", "sac"])) || inferHsnCode(name, getExcelValue(row, ["category", "group", "maingroup"]))
      };
    })
    .filter((row): row is ExcelInventoryRow => Boolean(row))
    .slice(0, 1000);
}

export function InventoryMasterModule() {
  const { products, addProduct, updateProduct, updateStock, deleteProduct } = useProductStore();
  const lastAutoLookupRef = useRef("");
  const lastAutoHsnRef = useRef("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrRows, setOcrRows] = useState<OcrInventoryRow[]>([]);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelRows, setExcelRows] = useState<ExcelInventoryRow[]>([]);
  const [printBusy, setPrintBusy] = useState(false);
  const [printers, setPrinters] = useState<DesktopPrinter[]>([]);
  const [printerName, setPrinterName] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [movement, setMovement] = useState({
    barcode: "",
    quantity: "",
    type: "" as MovementType
  });
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const barcodeValue = cleanBarcode(form.barcode);
  const barcodeSvg = useMemo(() => barcodeValue ? generateBarcodeSvg(barcodeValue) : "", [barcodeValue]);
  const currentSubGroups = inventorySubGroups[form.mainGroup] || ["General", "Premium", "Local", "Imported", "Loose", "Packed", "Wholesale"];
  const categories = useMemo(() => new Set(products.map((product) => normalizeInventoryCategory(product.category))).size, [products]);
  const inventoryRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = query
      ? products.filter((product) => [product.name, product.sku, product.barcode, normalizeInventoryCategory(product.category), product.brand].some((value) => String(value ?? "").toLowerCase().includes(query)))
      : products;
    return rows.slice(0, 100);
  }, [products, search]);

  useEffect(() => {
    function loadSuppliers() {
      try {
        const records = JSON.parse(localStorage.getItem(supplierStorageKey) || "[]") as Array<{ name?: string }>;
        const names = Array.from(new Set(records.map((record) => String(record.name || "").trim()).filter(Boolean)));
        setSupplierOptions(names);
      } catch {
        setSupplierOptions([]);
      }
    }

    loadSuppliers();
    window.addEventListener("focus", loadSuppliers);
    window.addEventListener("storage", loadSuppliers);
    return () => {
      window.removeEventListener("focus", loadSuppliers);
      window.removeEventListener("storage", loadSuppliers);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPrinters() {
      const available = await listDesktopPrinters();
      if (!active) return;
      setPrinters(available);
      setPrinterName((current) => current || available.find((printer) => printer.isDefault)?.name || available[0]?.name || "");
    }
    void loadPrinters();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const clean = cleanBarcode(form.barcode);
    if (clean.length < 8 || clean === lastAutoLookupRef.current) return;
    const local = products.find((product) => product.barcode.toLowerCase() === clean.toLowerCase() || product.sku.toLowerCase() === clean.toLowerCase());
    if (local) return;

    const timer = window.setTimeout(() => {
      lastAutoLookupRef.current = clean;
      void lookupOnline(clean);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [form.barcode, products]);

  useEffect(() => {
    const nextHsn = inferHsnCode(form.name, form.mainGroup || form.category);
    if (!nextHsn) return;
    if (form.hsnCode && form.hsnCode !== lastAutoHsnRef.current) return;
    if (form.hsnCode === nextHsn) return;
    lastAutoHsnRef.current = nextHsn;
    setForm((current) => ({ ...current, hsnCode: nextHsn }));
  }, [form.category, form.hsnCode, form.mainGroup, form.name]);

  useEffect(() => {
    const qty = Number(form.stock);
    const cost = Number(form.costPrice);
    const value = qty > 0 && cost > 0 ? String(Number((qty * cost).toFixed(2))) : "";
    if (form.value === value) return;
    setForm((current) => ({ ...current, value }));
  }, [form.costPrice, form.stock, form.value]);

  useEffect(() => {
    const gst = Number(form.gst);
    if (!gst || form.sgst || form.cgst || form.igst) return;
    const half = String(Number((gst / 2).toFixed(2)));
    setForm((current) => ({ ...current, sgst: half, cgst: half, igst: String(gst) }));
  }, [form.cgst, form.gst, form.igst, form.sgst]);

  useEffect(() => {
    if (!form.mainGroup || !form.subGroup) return;
    const allowedSubGroups = inventorySubGroups[form.mainGroup];
    if (!allowedSubGroups || allowedSubGroups.includes(form.subGroup)) return;
    setForm((current) => ({ ...current, subGroup: "" }));
  }, [form.mainGroup, form.subGroup]);

  function clearMasterForm() {
    setForm(emptyForm);
    setMessage("Inventory Master cleared.");
  }

  function generateItemCode() {
    const next = products.length + 1;
    setForm((current) => ({
      ...current,
      itemCode: current.itemCode || `ITEM-${String(next).padStart(5, "0")}`,
      barcode: current.barcode || makeBarcode(),
      lastSrNo: String(next),
      autoCode: true
    }));
  }

  function removeLfCr() {
    setForm((current) => ({
      ...current,
      name: current.name.replace(/[\r\n]+/g, " ").trim(),
      itemNameKn: current.itemNameKn.replace(/[\r\n]+/g, " ").trim(),
      description: current.description.replace(/[\r\n]+/g, " ").trim()
    }));
  }

  function deleteCurrentProduct() {
    const clean = cleanBarcode(form.barcode);
    const product = products.find((item) => item.sku.toLowerCase() === form.itemCode.toLowerCase() || item.barcode.toLowerCase() === clean.toLowerCase());
    if (!product) {
      setMessage("Load an existing item by item code or barcode before delete.");
      return;
    }
    deleteProduct(product.sku);
    clearMasterForm();
    setMessage(`Deleted ${product.name} from local inventory.`);
  }

  function editProductDetails(product: (typeof products)[number]) {
    const mainGroup = normalizeInventoryCategory(product.mainCategory || product.category);
    setForm({
      itemCode: product.sku,
      name: product.name,
      category: normalizeInventoryCategory(product.category),
      mainGroup,
      subGroup: product.subCategory || inferSubGroup(product.name, mainGroup),
      unit: product.unit,
      mrp: String(product.mrp || ""),
      gst: String(product.gst || ""),
      sgst: String(product.sgst || ""),
      cgst: String(product.cgst || ""),
      igst: String(product.igst || product.gst || ""),
      stock: String(product.stock || ""),
      stockDate: "",
      barcode: product.barcode,
      brand: product.brand || "",
      supplierName: product.purchasedBy && !["Direct Purchase", "Import"].includes(product.purchasedBy) ? product.purchasedBy : "",
      hsnCode: product.hsnCode || "",
      sellingPrice: String(product.sellingPrice || product.mrp || ""),
      costPrice: String(product.purchasePrice || ""),
      discountPercent: String(product.discountPercent || ""),
      value: product.stock && product.purchasePrice ? String(Number(product.stock) * Number(product.purchasePrice)) : "",
      dealerPrice: String(product.dealerPrice || ""),
      dealerMargin: "",
      expiryDate: product.expiryDate && product.expiryDate !== "Not tracked" ? product.expiryDate : "",
      itemNameKn: product.itemNameKn || "",
      packing: product.packing || "",
      size: product.size || "",
      salesAccount: product.salesAccount || "",
      purchaseAccount: product.purchaseAccount || "",
      gstMode: product.gstMode || "excluded",
      minStockLevel: String(product.minStockLevel || ""),
      minStockQty: String(product.minStockQty || ""),
      rackLocation: product.rackLocation || "",
      lastSrNo: "",
      autoCode: false,
      companyBarCode: Boolean(product.barcode),
      carryOn: false,
      imageUrl: product.imageUrl || "",
      description: product.description || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    setMessage(`Editing ${product.name}. Update the details and click Save.`);
  }

  async function lookupOnline(barcode = form.barcode) {
    const clean = cleanBarcode(barcode);
    if (!clean) {
      setMessage("Scan or enter a barcode before online lookup.");
      return;
    }

    const local = products.find((product) => product.barcode.toLowerCase() === clean.toLowerCase() || product.sku.toLowerCase() === clean.toLowerCase());
    if (local) {
      editProductDetails(local);
      return;
    }

    setLookupBusy(true);
    setMessage("Searching global product databases...");
    try {
      const result = await lookupBarcodeOnline(clean);
      if (!result.product) {
        setForm((current) => ({ ...current, barcode: clean }));
        setMessage("No online product found. Complete product details manually.");
        return;
      }

      const product = result.product;
      setForm((current) => {
        const nextMainGroup = normalizeInventoryCategory(product.category || current.mainGroup || current.category);
        return {
          ...current,
          barcode: clean,
          name: product.name,
          category: nextMainGroup,
          mainGroup: nextMainGroup,
          subGroup: current.subGroup || inferSubGroup(product.name, nextMainGroup),
          unit: product.unit || current.unit,
          brand: product.brand || product.manufacturer || "",
          imageUrl: product.imageUrl || current.imageUrl,
          description: product.description || current.description,
          hsnCode: product.hsnCode || current.hsnCode,
          mrp: product.mrp ? String(product.mrp) : current.mrp,
          sellingPrice: product.sellingPrice ? String(product.sellingPrice) : current.sellingPrice,
          gst: product.gstRate ? String(product.gstRate) : current.gst
        };
      });
      setMessage(`Product details auto-filled from global database: ${result.source}. Check MRP, GST, expiry, and stock before saving.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Global barcode lookup failed.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function createProduct() {
    if (!form.name.trim()) {
      setMessage("Product name is required.");
      return;
    }

    const barcode = cleanBarcode(form.barcode) || makeBarcode();
    const input = {
      ...productToInput(toPendingProduct({ ...form, barcode })),
      barcode,
      sku: form.itemCode || undefined,
      brand: form.brand || undefined,
      purchasedBy: form.supplierName || undefined,
      category: normalizeInventoryCategory(form.mainGroup || form.category) || "Grocery",
      mainCategory: normalizeInventoryCategory(form.mainGroup || form.category) || undefined,
      subCategory: form.subGroup || undefined,
      hsnCode: normalizeHsnCode(form.hsnCode) || undefined,
      imageUrl: form.imageUrl || undefined,
      description: form.description || undefined,
      itemNameKn: form.itemNameKn || undefined,
      packing: form.packing || undefined,
      size: form.size || undefined,
      dealerPrice: Number(form.dealerPrice) || undefined,
      discountPercent: Number(form.discountPercent) || undefined,
      sgst: Number(form.sgst) || undefined,
      cgst: Number(form.cgst) || undefined,
      igst: Number(form.igst || form.gst) || undefined,
      minStockLevel: Number(form.minStockLevel) || undefined,
      minStockQty: Number(form.minStockQty) || undefined,
      rackLocation: form.rackLocation || undefined,
      salesAccount: form.salesAccount || undefined,
      purchaseAccount: form.purchaseAccount || undefined,
      purchasePrice: Number(form.costPrice) || undefined,
      expiryDate: form.expiryDate || undefined,
      gstMode: form.gstMode,
      sellingPrice: Number(form.sellingPrice) || Number(form.mrp) || 0
    };
    const existingProduct = products.find((item) =>
      (form.itemCode && item.sku.toLowerCase() === form.itemCode.toLowerCase()) ||
      (barcode && item.barcode.toLowerCase() === barcode.toLowerCase())
    );
    const product = existingProduct ? { ...existingProduct, ...input, sku: existingProduct.sku, barcode } : addProduct(input);
    if (existingProduct) updateProduct(existingProduct.sku, input);
    try {
      await saveProductToBackend(input);
    } catch {
      // Local product master still works when API persistence is unavailable.
    }
    setMessage(`${existingProduct ? "Updated" : "Saved"} ${product.name}. Barcode: ${product.barcode}`);
    setForm(form.carryOn ? { ...emptyForm, carryOn: true, mainGroup: form.mainGroup, subGroup: form.subGroup, unit: form.unit, salesAccount: form.salesAccount, purchaseAccount: form.purchaseAccount } : emptyForm);
  }

  async function processBillPhoto(file?: File) {
    if (!file) return;
    setOcrBusy(true);
    setMessage("Reading bill photo with OCR...");
    try {
      const tesseract = await import("tesseract.js");
      const result = await tesseract.recognize(file, "eng");
      const text = result.data.text.trim();
      const rows = parseBillText(text);
      setOcrText(text);
      setOcrRows(rows);
      setMessage(rows.length ? `OCR found ${rows.length} possible inventory item(s). Review and save.` : "OCR finished, but no clear item lines were found. You can edit the extracted text and parse again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read bill photo.");
    } finally {
      setOcrBusy(false);
    }
  }

  function updateOcrRow(id: string, patch: Partial<OcrInventoryRow>) {
    setOcrRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function updateExcelRow(id: string, patch: Partial<ExcelInventoryRow>) {
    setExcelRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  async function saveOcrRows() {
    const validRows = ocrRows.filter((row) => row.name.trim());
    if (!validRows.length) {
      setMessage("No OCR rows to save.");
      return;
    }

    let savedCount = 0;
    for (const row of validRows) {
      const input = productToInput({
        barcode: makeBarcode(),
        name: row.name.trim(),
        category: normalizeInventoryCategory(row.category) || "Grocery",
        unit: row.unit || "pcs",
        mrp: row.price || "0",
        sellingPrice: row.price || "0",
        gst: "0",
        stock: row.quantity || "1"
      });
      const productInput = { ...input, hsnCode: inferHsnCode(row.name, normalizeInventoryCategory(row.category)) || undefined };
      addProduct(productInput);
      savedCount += 1;
      try {
        await saveProductToBackend(productInput);
      } catch {
        // Continue importing locally even if backend persistence is unavailable.
      }
    }
    setOcrRows([]);
    setMessage(`Added ${savedCount} OCR item(s) to inventory.`);
  }

  async function importExcelFile(file?: File) {
    if (!file) return;
    setExcelBusy(true);
    setMessage("Reading Excel sheet...");
    try {
      const xlsx = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const rows = normalizeExcelRows(rawRows);
      setExcelRows(rows);
      setMessage(rows.length ? `Excel sheet loaded with ${rows.length} inventory row(s). Review and dump to inventory.` : "No product rows found in this Excel sheet. Check that the first row contains headers.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read Excel sheet.");
    } finally {
      setExcelBusy(false);
    }
  }

  async function saveExcelRows() {
    const validRows = excelRows.filter((row) => row.name.trim());
    if (!validRows.length) {
      setMessage("No Excel rows to dump.");
      return;
    }

    let savedCount = 0;
    for (const row of validRows) {
      const input = productToInput({
        barcode: row.barcode || makeBarcode(),
        name: row.name.trim(),
        brand: row.brand,
        category: normalizeInventoryCategory(row.category) || "Grocery",
        unit: row.unit || "pcs",
        mrp: row.price || "0",
        sellingPrice: row.price || "0",
        gst: row.gst || "0",
        stock: row.quantity || "0"
      });
      const productInput = { ...input, hsnCode: normalizeHsnCode(row.hsnCode) || undefined };
      addProduct(productInput);
      savedCount += 1;
      try {
        await saveProductToBackend(productInput);
      } catch {
        // Continue dumping locally even if backend persistence is unavailable.
      }
    }
    setExcelRows([]);
    setMessage(`Dumped ${savedCount} Excel row(s) into inventory.`);
  }

  async function exportInventoryExcel() {
    const xlsx = await import("xlsx");
    const rows = products.map((product) => ({
      Name: product.name,
      SKU: product.sku,
      Barcode: product.barcode,
      Brand: product.brand || "",
      Category: normalizeInventoryCategory(product.category),
      Unit: product.unit,
      Stock: product.stock,
      GST: product.gst,
      MRP: product.mrp,
      "Selling Price": product.sellingPrice,
      HSN: product.hsnCode || ""
    }));
    const sheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, "Inventory");
    xlsx.writeFile(workbook, `MM-SuperMart-Inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setMessage(`Exported ${rows.length} inventory item(s) to Excel.`);
  }

  function recordMovement() {
    const query = movement.barcode.trim().toLowerCase();
    const quantity = Math.max(1, Number(movement.quantity) || 1);
    if (!query) {
      setMessage("Scan or enter a barcode/SKU before recording stock.");
      return;
    }

    const product = products.find((item) => item.barcode.toLowerCase() === query || item.sku.toLowerCase() === query);
    if (!product) {
      setMessage("No product found for this barcode/SKU.");
      return;
    }

    if (!movement.type) {
      setMessage("Select Stock In, Stock Out, or Branch Transfer before recording stock.");
      return;
    }

    const delta = movement.type === "Stock In" ? quantity : -quantity;
    if (delta < 0 && product.stock < quantity) {
      setMessage(`Only ${product.stock} ${product.unit} available for ${product.name}.`);
      return;
    }

    updateStock(product.sku, delta);
    setMessage(`${movement.type} recorded for ${product.name}: ${delta < 0 ? "-" : "+"}${quantity}.`);
    setMovement((current) => ({ ...current, barcode: "", quantity: "" }));
  }

  function downloadBarcode() {
    if (!barcodeSvg || !barcodeValue) {
      setMessage("Generate or enter a barcode before downloading.");
      return;
    }
    const link = document.createElement("a");
    link.href = barcodeSvgToDataUrl(barcodeSvg);
    link.download = `${safeFileName(form.name || barcodeValue)}.svg`;
    link.click();
  }

  async function printBarcode() {
    if (!form.name.trim() || !barcodeValue || !barcodeSvg) {
      setMessage("Product name and barcode are required before printing.");
      return;
    }

    setPrintBusy(true);
    try {
      await printQrLabelsDirect({
        printerName,
        items: [{
          labelType: "barcode",
          name: form.name,
          sku: form.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24) || "PRODUCT",
          barcode: barcodeValue,
          price: Number(form.sellingPrice || form.mrp) || 0,
          barcodeSvg,
          valueMode: "barcode"
        }]
      });
      setMessage(`Printed barcode label for ${form.name}.`);
    } catch (error) {
      const popup = window.open("", "inventory-barcode-label", "width=420,height=320");
      if (popup) {
        popup.document.write(`<!doctype html><html><head><title>Barcode Label</title><style>@page{size:50mm 25mm;margin:0}html,body{width:50mm;height:25mm;margin:0;overflow:hidden;background:#fff;font-family:Arial,sans-serif}.label{position:relative;width:50mm;height:25mm;overflow:hidden;background:#fff}.rotated{box-sizing:border-box;position:absolute;left:50%;top:50%;width:25mm;height:50mm;padding:0.8mm 1.2mm;text-align:center;transform:translate(-50%,-50%) rotate(90deg);transform-origin:center;overflow:hidden}.name{height:5.5mm;overflow:hidden;font-size:7.2px;font-weight:800;line-height:1.02;margin:0}.code{height:39mm;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0}.code svg{width:23mm;height:36mm;display:block}.price{height:3.8mm;overflow:hidden;font-size:8px;font-weight:900;line-height:1;text-align:right;margin:0}</style></head><body><section class="label"><div class="rotated"><div class="name">${form.name}</div><div class="code">${barcodeSvg}</div><div class="price">${formatCurrency(Number(form.sellingPrice || form.mrp) || 0)}</div></div></section><script>window.print();</script></body></html>`);
        popup.document.close();
        setMessage("Opened 90 degree rotated browser print preview because direct printer bridge is unavailable.");
      } else {
        setMessage(error instanceof Error ? error.message : "Barcode printing failed.");
      }
    } finally {
      setPrintBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground">Barcode, SKU, GST, batches, expiry tracking, stock movement, and branch-wise inventory.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
            <ImagePlus className="size-4" />
            Upload Bill Photo
            <input className="hidden" type="file" accept="image/*" onChange={(event) => void processBillPhoto(event.target.files?.[0])} />
          </label>
          <Button variant="outline" disabled={lookupBusy} onClick={() => lookupOnline()}>
            {lookupBusy ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}
            Online Lookup
          </Button>
          <Button onClick={createProduct}><PackagePlus className="size-4" /> Save Product</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5" /> Excel Sheet Dumping</CardTitle>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
              {excelBusy ? <RefreshCw className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
              {excelBusy ? "Reading Sheet" : "Choose Excel"}
              <input className="hidden" type="file" accept=".xlsx,.xls,.csv,.tsv" onChange={(event) => void importExcelFile(event.target.files?.[0])} />
            </label>
            <Button disabled={!excelRows.length || excelBusy} onClick={saveExcelRows}><PackagePlus className="size-4" /> Dump to Inventory</Button>
            <Button variant="outline" onClick={() => void exportInventoryExcel()}><Download className="size-4" /> Export Inventory</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr><th className="p-2">Product</th><th>Barcode</th><th>Brand</th><th>Category</th><th>Unit</th><th>Stock</th><th>MRP/Price</th><th>GST</th><th>HSN</th><th /></tr>
            </thead>
            <tbody>
              {excelRows.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-2"><Input value={row.name} onChange={(event) => updateExcelRow(row.id, { name: event.target.value })} /></td>
                  <td><Input className="w-36" value={row.barcode} onChange={(event) => updateExcelRow(row.id, { barcode: event.target.value })} /></td>
                  <td><Input className="w-32" value={row.brand} onChange={(event) => updateExcelRow(row.id, { brand: event.target.value })} /></td>
                  <td><Input className="w-32" value={row.category} onChange={(event) => updateExcelRow(row.id, { category: event.target.value })} /></td>
                  <td><Input className="w-24" value={row.unit} onChange={(event) => updateExcelRow(row.id, { unit: event.target.value })} /></td>
                  <td><Input className="w-24" type="number" value={row.quantity} onChange={(event) => updateExcelRow(row.id, { quantity: event.target.value })} /></td>
                  <td><Input className="w-24" type="number" value={row.price} onChange={(event) => updateExcelRow(row.id, { price: event.target.value })} /></td>
                  <td><Input className="w-20" type="number" value={row.gst} onChange={(event) => updateExcelRow(row.id, { gst: event.target.value })} /></td>
                  <td><Input className="w-28" value={row.hsnCode} onChange={(event) => updateExcelRow(row.id, { hsnCode: event.target.value })} /></td>
                  <td className="pr-2"><Button variant="ghost" size="icon" onClick={() => setExcelRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}
              {!excelRows.length ? <tr><td className="p-6 text-muted-foreground" colSpan={10}>Choose an Excel or CSV sheet to preview rows before dumping them into inventory. Supported headers include Product, Item Name, Barcode, Brand, Category, Unit, Stock, Qty, MRP, GST, and HSN.</td></tr> : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-4">
          <div><p className="text-sm text-muted-foreground">Book1 Import</p><p className="text-2xl font-semibold">{products.length || 0}</p></div>
          <div><p className="text-sm text-muted-foreground">Imported Categories</p><p className="text-2xl font-semibold">{categories || 0}</p></div>
          <div><p className="text-sm text-muted-foreground">Source</p><p className="text-lg font-semibold">Product master</p></div>
          <div><p className="text-sm text-muted-foreground">Status</p><p className="text-lg font-semibold text-primary">Ready for billing</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Inventory Master Details</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="icon" onClick={generateItemCode} title="Auto item code"><Wand2 className="size-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => setForm({ ...form, barcode: makeBarcode(), companyBarCode: true })} title="Generate barcode"><Barcode className="size-4" /></Button>
            <Button variant="outline" size="icon" disabled={printBusy} onClick={printBarcode} title="Print barcode"><Printer className="size-4" /></Button>
            <Button variant="outline" size="icon" onClick={downloadBarcode} title="Download barcode"><Download className="size-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-5 rounded-md border bg-muted/30 p-4 xl:grid-cols-2">
            <div className="space-y-3">
              <MasterField label="Item Code">
                <div className="flex gap-2">
                  <Input value={form.itemCode} onChange={(event) => setForm({ ...form, itemCode: event.target.value })} />
                  <Button variant="outline" size="icon" onClick={generateItemCode} title="Auto code"><Wand2 className="size-4" /></Button>
                </div>
              </MasterField>
              <MasterField label="Main Group">
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.mainGroup} onChange={(event) => setForm({ ...form, mainGroup: event.target.value, category: event.target.value, subGroup: "" })}>
                  <option value="">Main Group</option>
                  {inventoryCategories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </MasterField>
              <MasterField label="Sub Group">
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.subGroup} onChange={(event) => setForm({ ...form, subGroup: event.target.value })}>
                  <option value="">Sub Group</option>
                  {currentSubGroups.map((group) => <option key={group}>{group}</option>)}
                </select>
              </MasterField>
              <MasterField label="Comp. Name">
                <Input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
              </MasterField>
              <MasterField label="Supplier">
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })}>
                  <option value="">Select supplier</option>
                  {supplierOptions.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
                </select>
              </MasterField>
              <MasterField label="Stock Date">
                <div className="flex gap-2">
                  <Input type="date" value={form.stockDate} onChange={(event) => setForm({ ...form, stockDate: event.target.value })} />
                  <Button variant="outline" onClick={() => setForm({ ...form, stockDate: todayInputDate() })}>{legacyDate(todayInputDate())}</Button>
                </div>
              </MasterField>
              <MasterField label="Quantity">
                <Input type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} />
              </MasterField>
              <MasterField label="Cost Price/Trp">
                <div className="grid grid-cols-[1fr_44px_0.6fr_0.7fr] items-center gap-2">
                  <Input type="number" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} />
                  <span className="text-center font-semibold">%</span>
                  <Input type="number" value={form.dealerMargin} onChange={(event) => setForm({ ...form, dealerMargin: event.target.value })} />
                  <Input placeholder="Disc %" type="number" value={form.discountPercent} onChange={(event) => setForm({ ...form, discountPercent: event.target.value })} />
                </div>
              </MasterField>
              <MasterField label="Value">
                <Input readOnly value={form.value} />
              </MasterField>
              <MasterField label="Sale Price">
                <Input type="number" value={form.sellingPrice} onChange={(event) => setForm({ ...form, sellingPrice: event.target.value })} />
              </MasterField>
              <MasterField label="Dealer Price / MRP">
                <div className="grid grid-cols-[1fr_44px_0.7fr] items-center gap-2">
                  <Input type="number" value={form.dealerPrice} onChange={(event) => setForm({ ...form, dealerPrice: event.target.value })} />
                  <span className="text-center font-semibold">%</span>
                  <Input type="number" value={form.mrp} onChange={(event) => setForm({ ...form, mrp: event.target.value })} />
                </div>
              </MasterField>
              <MasterField label="Expiry Date">
                <Input type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} />
              </MasterField>
            </div>

            <div className="space-y-3">
              <MasterField label="Item Name">
                <Input className="h-16 text-lg font-semibold" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") createProduct(); }} />
              </MasterField>
              <div className="grid gap-3 md:grid-cols-2">
                <MasterField label="Packing">
                  <Input value={form.packing} onChange={(event) => setForm({ ...form, packing: event.target.value })} />
                </MasterField>
                <MasterField label="Meas. Unit">
                  <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>
                    <option value="">Meas. Unit</option>
                    {unitOptions.map((unit) => <option key={unit}>{unit}</option>)}
                  </select>
                </MasterField>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <MasterField label="Size/ml.">
                  <Input value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} />
                </MasterField>
                <MasterField label="HSN/SAC Code">
                  <Input inputMode="numeric" value={form.hsnCode} onChange={(event) => setForm({ ...form, hsnCode: normalizeHsnCode(event.target.value) })} />
                </MasterField>
              </div>
              <div className="grid grid-cols-[150px_1fr] items-center gap-2">
                <div />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="SGST" type="number" value={form.sgst} onChange={(event) => setForm({ ...form, sgst: event.target.value })} />
                  <Input placeholder="CGST" type="number" value={form.cgst} onChange={(event) => setForm({ ...form, cgst: event.target.value })} />
                  <Input placeholder="IGST" type="number" value={form.igst} onChange={(event) => setForm({ ...form, igst: event.target.value, gst: event.target.value })} />
                </div>
              </div>
              <MasterField label="Sales A/C">
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.salesAccount} onChange={(event) => setForm({ ...form, salesAccount: event.target.value })}>
                  <option value="">Sales A/C</option>
                  {accountOptions.map((account) => <option key={account}>{account}</option>)}
                </select>
              </MasterField>
              <MasterField label="Purchase A/C">
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.purchaseAccount} onChange={(event) => setForm({ ...form, purchaseAccount: event.target.value })}>
                  <option value="">Purchase A/C</option>
                  {accountOptions.map((account) => <option key={account}>{account}</option>)}
                </select>
              </MasterField>
              <div className="grid grid-cols-[150px_1fr] items-center gap-2">
                <FieldLabel>Selling Price</FieldLabel>
                <div className="flex flex-wrap items-center gap-4 rounded-md border bg-background px-3 py-2">
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" checked={form.gstMode === "included"} onChange={() => setForm({ ...form, gstMode: "included" })} /> Including Tax</label>
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" checked={form.gstMode === "excluded"} onChange={() => setForm({ ...form, gstMode: "excluded" })} /> Excluding Tax</label>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <MasterField label="Min.Stock Level">
                  <Input type="number" value={form.minStockLevel} onChange={(event) => setForm({ ...form, minStockLevel: event.target.value })} />
                </MasterField>
                <MasterField label="Min.Stock Qty.">
                  <Input type="number" value={form.minStockQty} onChange={(event) => setForm({ ...form, minStockQty: event.target.value })} />
                </MasterField>
              </div>
              <div className="grid grid-cols-[150px_1fr] items-center gap-2">
                <div />
                <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-2">
                  <span className="text-sm font-semibold">Last SrNo.</span>
                  <Input className="w-24" value={form.lastSrNo} onChange={(event) => setForm({ ...form, lastSrNo: event.target.value })} />
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.autoCode} onChange={(event) => setForm({ ...form, autoCode: event.target.checked })} /> Auto Code</label>
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.companyBarCode} onChange={(event) => setForm({ ...form, companyBarCode: event.target.checked })} /> Company Bar Code</label>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <Input icon={Barcode} placeholder="Company barcode / scan here for online lookup" value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value, companyBarCode: Boolean(event.target.value) })} onKeyDown={(event) => { if (event.key === "Enter") lookupOnline(); }} />
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 xl:flex-row xl:items-center xl:justify-end">
            <div className="flex flex-wrap gap-2">
              <Button onClick={createProduct}><PackagePlus className="size-4" /> Save</Button>
              <Button variant="outline" onClick={() => lookupOnline()} disabled={lookupBusy}>{lookupBusy ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />} Edit / Lookup</Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-md bg-muted/50 p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="flex flex-wrap gap-2">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={printerName} onChange={(event) => setPrinterName(event.target.value)}>
                {printers.map((printer) => <option key={printer.name} value={printer.name}>{printer.displayName || printer.name}{printer.isDefault ? " (default)" : ""}</option>)}
                {!printers.length ? <option value="">No desktop printers found</option> : null}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2"><ScanText className="size-5" /> AI/OCR Bill Photo Import</CardTitle>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
              {ocrBusy ? <RefreshCw className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {ocrBusy ? "Reading Bill" : "Choose Bill Photo"}
              <input className="hidden" type="file" accept="image/*" onChange={(event) => void processBillPhoto(event.target.files?.[0])} />
            </label>
            <Button variant="outline" disabled={!ocrText || ocrBusy} onClick={() => setOcrRows(parseBillText(ocrText))}>Parse Text</Button>
            <Button disabled={!ocrRows.length || ocrBusy} onClick={saveOcrRows}><PackagePlus className="size-4" /> Save OCR Items</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <textarea
            className="min-h-52 rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="OCR text from bill photo will appear here. You can edit it and click Parse Text."
            value={ocrText}
            onChange={(event) => setOcrText(event.target.value)}
          />
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr><th className="p-2">Item</th><th>Qty</th><th>Unit</th><th>Price</th><th>Category</th><th /></tr>
              </thead>
              <tbody>
                {ocrRows.map((row) => (
                  <tr className="border-t" key={row.id}>
                    <td className="p-2"><Input value={row.name} onChange={(event) => updateOcrRow(row.id, { name: event.target.value })} /></td>
                    <td><Input className="w-20" type="number" value={row.quantity} onChange={(event) => updateOcrRow(row.id, { quantity: event.target.value })} /></td>
                    <td><Input className="w-24" value={row.unit} onChange={(event) => updateOcrRow(row.id, { unit: event.target.value })} /></td>
                    <td><Input className="w-24" type="number" value={row.price} onChange={(event) => updateOcrRow(row.id, { price: event.target.value })} /></td>
                    <td><Input className="w-32" value={row.category} onChange={(event) => updateOcrRow(row.id, { category: event.target.value })} /></td>
                    <td className="pr-2"><Button variant="ghost" size="icon" onClick={() => setOcrRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="size-4" /></Button></td>
                  </tr>
                ))}
                {!ocrRows.length ? <tr><td className="p-6 text-muted-foreground" colSpan={6}>Upload a bill photo to extract inventory items. Review rows before saving.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card id="inventory-products-table">
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Products</CardTitle>
            <div className="flex gap-2">
              <Input icon={Search} placeholder="Search SKU, barcode, product" value={search} onChange={(event) => setSearch(event.target.value)} />
              <Button variant="outline" size="icon"><Filter className="size-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2">Product</th><th>SKU</th><th>Barcode</th><th>Category</th><th>Batch</th><th>Expiry</th><th>Stock</th><th>GST</th><th>MRP</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {inventoryRows.map((product) => (
                  <tr className="border-t" key={product.sku}>
                    <td className="py-3 font-medium">{product.name}</td>
                    <td>{product.sku}</td>
                    <td>{product.barcode}</td>
                    <td>{normalizeInventoryCategory(product.category) || "Grocery"}</td>
                    <td>{product.batch}</td>
                    <td>{product.expiry}</td>
                    <td>{product.stock}</td>
                    <td>{product.gst}%</td>
                    <td>{formatCurrency(product.mrp)}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => editProductDetails(product)}><Pencil className="size-3.5" /> Edit</Button>
                        <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => { deleteProduct(product.sku); setMessage(`Deleted ${product.name} from inventory.`); }}><Trash2 className="size-3.5" /> Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {inventoryRows.length === 0 ? <tr className="border-t"><td className="py-6 text-muted-foreground" colSpan={10}>No products yet. Add your first product above, then bill it from POS.</td></tr> : null}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick Stock In/Out</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input icon={Barcode} placeholder="Scan barcode or SKU" value={movement.barcode} onChange={(event) => setMovement({ ...movement, barcode: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") recordMovement(); }} />
            <Input placeholder="Quantity" type="number" min="1" value={movement.quantity} onChange={(event) => setMovement({ ...movement, quantity: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") recordMovement(); }} />
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm text-muted-foreground" value={movement.type} onChange={(event) => setMovement({ ...movement, type: event.target.value as MovementType })}><option value="">Movement type</option><option>Stock In</option><option>Stock Out</option><option>Branch Transfer</option></select>
            <Button className="w-full" onClick={recordMovement}>Record Movement</Button>
            {barcodeSvg ? (
              <div className="rounded-lg border bg-white p-3 text-black">
                <div className="mx-auto flex h-[190px] w-[96px] rotate-90 flex-col justify-center overflow-hidden text-center">
                  <p className="m-0 line-clamp-2 h-6 text-[10px] font-extrabold leading-none">{form.name || "Barcode Preview"}</p>
                  <div className="m-0 flex h-[142px] items-center justify-center overflow-hidden [&_svg]:block [&_svg]:h-[132px] [&_svg]:w-[86px]" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                  <p className="m-0 h-5 text-right text-xs font-black leading-none">{formatCurrency(Number(form.sellingPrice || form.mrp) || 0)}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Scan or generate a barcode to preview and print the label.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
