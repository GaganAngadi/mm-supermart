"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Barcode, CreditCard, FileText, IndianRupee, Phone, Printer, ReceiptText, Search, Trash2, UserRound, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { saveSaleToLocalMaster } from "@/lib/electron-pos";
import { lookupBarcodeOnline, productToInput, saveProductToBackend, type PendingBarcodeProduct } from "@/lib/product-lookup";
import { useBillingStore, type InvoiceRecord } from "@/lib/stores/billing-store";
import { useCartStore } from "@/lib/stores/cart-store";
import { useProductStore, type ProductInput } from "@/lib/stores/product-store";
import { formatCurrency } from "@/lib/utils";

type BillingProduct = {
  name: string;
  sku: string;
  barcode: string;
  hsnCode?: string;
  mrp: number;
  sellingPrice: number;
  purchasePrice: number;
  gstRate: number;
  gstMode: "included" | "excluded";
  stock: number;
  category: string;
  unit: string;
  imageUrl?: string;
};

type ReceiptPrintMode = "thermal" | "a4";

function normalizeBarcodeValue(value = "") {
  return value.replace(/[\s-]+/g, "").trim().toLowerCase();
}

function scanLookupValue(value = "") {
  const text = value.trim();
  if (!text.startsWith("MM|")) return text;
  const fields = Object.fromEntries(text.split("|").slice(1).map((part) => {
    const index = part.indexOf(":");
    return index === -1 ? [part.toUpperCase(), ""] : [part.slice(0, index).toUpperCase(), part.slice(index + 1)];
  }));
  return fields.BARCODE || fields.SKU || text;
}

function numberToIndianWords(value: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const underHundred = (num: number) => num < 20 ? ones[num] : `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`;
  const underThousand = (num: number) => {
    const hundred = Math.floor(num / 100);
    const rest = num % 100;
    return `${hundred ? `${ones[hundred]} Hundred` : ""}${hundred && rest ? " " : ""}${rest ? underHundred(rest) : ""}`.trim();
  };
  const rounded = Math.round(Math.max(0, value));
  if (rounded === 0) return "Zero Rupees Only";
  const crore = Math.floor(rounded / 10000000);
  const lakh = Math.floor((rounded % 10000000) / 100000);
  const thousand = Math.floor((rounded % 100000) / 1000);
  const rest = rounded % 1000;
  return [
    crore ? `${underThousand(crore)} Crore` : "",
    lakh ? `${underThousand(lakh)} Lakh` : "",
    thousand ? `${underThousand(thousand)} Thousand` : "",
    rest ? underThousand(rest) : ""
  ].filter(Boolean).join(" ") + " Rupees Only";
}

export function PosModule() {
  const { products, addProduct, updateStock } = useProductStore();
  const { invoices, addInvoice, nextCustomerId } = useBillingStore();
  const { items, add, setQuantity, remove, clear } = useCartStore();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const scannerBufferRef = useRef("");
  const lastScannerKeyRef = useRef(0);
  const [scanValue, setScanValue] = useState("");
  const [search, setSearch] = useState("");
  const [scanMessage, setScanMessage] = useState("Ready for barcode scan");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<PendingBarcodeProduct | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card" | "UPI">("Cash");
  const receiptSize = "80mm";
  const [manualDiscount, setManualDiscount] = useState("0");
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);

  const customerId = useMemo(() => nextCustomerId(customerMobile), [customerMobile, invoices, nextCustomerId]);
  const billingProducts: BillingProduct[] = useMemo(() => products.map((product) => ({
    name: `${product.name} ${product.unit}`,
    sku: product.sku,
    barcode: product.barcode,
    hsnCode: product.hsnCode,
    mrp: Number(product.mrp) || Number(product.sellingPrice) || 0,
    sellingPrice: Number(product.sellingPrice) || Number(product.mrp) || 0,
    purchasePrice: Number(product.purchasePrice) || Math.max(0, (Number(product.sellingPrice) || Number(product.mrp) || 0) * 0.85),
    gstRate: Number(product.gst) || 0,
    gstMode: product.gstMode || "included",
    stock: Number(product.stock) || 0,
    category: product.category,
    unit: product.unit,
    imageUrl: product.imageUrl
  })), [products]);

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    return billingProducts
      .filter((product) => product.name.toLowerCase().includes(query) || normalizeBarcodeValue(product.sku).includes(query) || normalizeBarcodeValue(product.barcode).includes(query))
      .slice(0, 8);
  }, [billingProducts, search]);

  const itemGrossTotal = useMemo(() => items.reduce((sum, item) => {
    const base = item.sellingPrice * item.qty;
    const gstRate = (item.gstRate ?? 0) / 100;
    return sum + (item.gstMode === "excluded" ? base + base * gstRate : base);
  }, 0), [items]);
  const subtotal = useMemo(() => items.reduce((sum, item) => {
    const gross = item.sellingPrice * item.qty;
    const gstRate = (item.gstRate ?? 0) / 100;
    return sum + (item.gstMode === "included" && gstRate > 0 ? gross / (1 + gstRate) : gross);
  }, 0), [items]);
  const mrpTotal = useMemo(() => items.reduce((sum, item) => sum + item.mrp * item.qty, 0), [items]);
  const gst = useMemo(() => items.reduce((sum, item) => {
    const gross = item.sellingPrice * item.qty;
    const gstRate = (item.gstRate ?? 0) / 100;
    return sum + (item.gstMode === "included" && gstRate > 0 ? gross - gross / (1 + gstRate) : gross * gstRate);
  }, 0), [items]);
  const automaticSavings = Math.max(0, mrpTotal - itemGrossTotal);
  const billDiscount = Math.max(0, Number(manualDiscount) || 0);
  const totalSavings = automaticSavings + billDiscount;
  const total = Math.max(itemGrossTotal - billDiscount, 0);
  const profit = useMemo(() => items.reduce((sum, item) => {
    const gross = item.sellingPrice * item.qty;
    const gstRate = (item.gstRate ?? 0) / 100;
    const taxable = item.gstMode === "included" && gstRate > 0 ? gross / (1 + gstRate) : gross;
    return sum + taxable - item.purchasePrice * item.qty;
  }, 0) - billDiscount, [billDiscount, items]);
  const todayInvoices = useMemo(() => invoices.filter((row) => new Date(row.createdAt).toDateString() === new Date().toDateString()), [invoices]);
  const todayRevenue = todayInvoices.reduce((sum, row) => sum + row.total, 0);
  const regularCustomer = useMemo(() => {
    const mobile = customerMobile.replace(/\D/g, "");
    if (mobile.length < 5) return null;
    const history = invoices.filter((row) => (row.customerMobile ?? "").replace(/\D/g, "") === mobile);
    if (!history.length) return null;
    const sorted = [...history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return {
      customerId: sorted[0].customerId,
      name: sorted.find((row) => row.customerName && row.customerName !== "Walk-in Customer")?.customerName ?? "",
      bills: history.length,
      total: history.reduce((sum, row) => sum + row.total, 0),
      savings: history.reduce((sum, row) => sum + (row.savings ?? 0), 0),
      lastVisit: sorted[0].createdAt
    };
  }, [customerMobile, invoices]);

  useEffect(() => {
    scanInputRef.current?.focus();
    localStorage.setItem("receipt-size", receiptSize);
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "F2") {
        event.preventDefault();
        scanInputRef.current?.focus();
      }
      if (event.key === "F3") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === "F9") {
        event.preventDefault();
        generateInvoice({ showPreview: false, directPrintOnly: true });
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  useEffect(() => {
    function handleScannerInput(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.target === scanInputRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;

      const now = Date.now();
      if (now - lastScannerKeyRef.current > 120) scannerBufferRef.current = "";
      lastScannerKeyRef.current = now;

      if (event.key === "Enter") {
        const code = scannerBufferRef.current.trim();
        scannerBufferRef.current = "";
        if (code.length >= 3) {
          event.preventDefault();
          scanAndAdd(code);
        }
        return;
      }

      if (event.key.length === 1) {
        scannerBufferRef.current += event.key;
        if (scannerBufferRef.current.length > 1) event.preventDefault();
      }
    }
    window.addEventListener("keydown", handleScannerInput, true);
    return () => window.removeEventListener("keydown", handleScannerInput, true);
  });

  useEffect(() => {
    if (!regularCustomer?.name || customerName) return;
    setCustomerName(regularCustomer.name);
  }, [customerName, regularCustomer]);

  function playScanTone(success: boolean) {
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = success ? 920 : 180;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      window.setTimeout(() => {
        oscillator.stop();
        audio.close();
      }, success ? 60 : 150);
    } catch {
      // Audio can be blocked until a user gesture.
    }
  }

  function focusQuantity(sku: string) {
    window.setTimeout(() => {
      qtyRefs.current[sku]?.focus();
      qtyRefs.current[sku]?.select();
    }, 0);
  }

  function formatQty(qty: number, unit?: string) {
    const normalized = (unit ?? "").toLowerCase();
    const displayQty = Number.isInteger(qty) ? String(qty) : String(qty);
    if (normalized.includes("kg")) return qty < 1 ? `${Math.round(qty * 1000)} g` : `${displayQty} kg`;
    if (normalized.includes("ltr") || normalized.includes("liter") || normalized.includes("litre")) return qty < 1 ? `${Math.round(qty * 1000)} ml` : `${displayQty} ltr`;
    return `${displayQty} ${unit || "pcs"}`;
  }

  function focusBarcodeInput() {
    window.setTimeout(() => {
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    }, 0);
  }

  function addProductToBill(product: BillingProduct, options: { focusQty?: boolean } = {}) {
    if (product.stock <= 0) {
      setScanMessage(`${product.name} is out of stock`);
      playScanTone(false);
      return;
    }
    add(product);
    setScanMessage(`Added ${product.name}`);
    playScanTone(true);
    setScanValue("");
    setSearch("");
    if (options.focusQty) {
      focusQuantity(product.sku);
    } else {
      focusBarcodeInput();
    }
  }

  function productInputToBillingProduct(input: ProductInput, savedProduct?: { sku?: string }) {
    const mrp = Number(input.mrp) || Number(input.sellingPrice) || 0;
    const sellingPrice = Number(input.sellingPrice) || mrp;
    return {
      name: `${input.name} ${input.unit || "pcs"}`,
      sku: savedProduct?.sku || input.sku || input.barcode || input.name,
      barcode: input.barcode || "",
      mrp,
      sellingPrice,
      purchasePrice: Number(input.purchasePrice) || Math.max(0, sellingPrice * 0.85),
      gstRate: Number(input.gst) || 0,
      gstMode: input.gstMode || "included",
      stock: Number(input.stock) || 0,
      category: input.category,
      unit: input.unit,
      imageUrl: input.imageUrl
    } satisfies BillingProduct;
  }

  function saveCompletedProduct(product = pendingProduct) {
    if (!product) return;
    if (!product.name.trim()) {
      setScanMessage("Product name is required.");
      return;
    }
    const input = productToInput(product);
    if (!input.mrp || !input.sellingPrice) {
      setScanMessage("Enter MRP and sale price before adding this product.");
      return;
    }
    const saved = addProduct(input);
    void saveProductToBackend(input).catch(() => undefined);
    setPendingProduct(null);
    setScanMessage(`Saved ${saved.name}. Enter quantity to bill.`);
    addProductToBill(productInputToBillingProduct(input, saved));
  }

  async function scanAndAdd(value = scanValue) {
    const query = normalizeBarcodeValue(scanLookupValue(value));
    if (!query) return;
    const product = billingProducts.find((item) => normalizeBarcodeValue(item.barcode) === query || normalizeBarcodeValue(item.sku) === query);
    if (product) {
      addProductToBill(product);
      return;
    }

    setLookupBusy(true);
    setScanMessage("Searching barcode online...");
    try {
      const result = await lookupBarcodeOnline(value);
      const found = result.product;
      if (!found) {
        setPendingProduct({ barcode: value.trim(), name: "", category: "Grocery", unit: "pcs", mrp: "", sellingPrice: "", gst: "", stock: "" });
        setScanMessage("Barcode not found online. Complete product details manually.");
        playScanTone(false);
        return;
      }
      const pending: PendingBarcodeProduct = {
        barcode: found.barcode || value.trim(),
        name: found.name,
        brand: found.brand,
        category: found.category || "Grocery",
        imageUrl: found.imageUrl,
        unit: found.unit || "pcs",
        manufacturer: found.manufacturer,
        description: found.description,
        mrp: "",
        sellingPrice: "",
        gst: "",
        stock: ""
      };
      setPendingProduct(pending);
      setScanMessage(`${found.name} found via ${result.source}. Enter MRP, sale price, GST, and stock to save.`);
      playScanTone(true);
    } catch (error) {
      setPendingProduct({ barcode: value.trim(), name: "", category: "Grocery", unit: "pcs", mrp: "", sellingPrice: "", gst: "", stock: "" });
      setScanMessage(error instanceof Error ? `${error.message}. Complete product manually.` : "Online lookup failed. Complete product manually.");
      playScanTone(false);
      scanInputRef.current?.focus();
    } finally {
      setLookupBusy(false);
    }
  }

  function updateQty(sku: string, value: string) {
    const qty = Math.max(0, Number(value) || 0);
    const product = products.find((candidate) => candidate.sku === sku);
    if (product && qty > product.stock) {
      setScanMessage(`Only ${product.stock} available for ${product.name}`);
      setQuantity(sku, product.stock);
      return;
    }
    setQuantity(sku, qty);
  }

  async function sendCustomerThankYou(invoiceToSend: InvoiceRecord) {
    const mobile = invoiceToSend.customerMobile.replace(/\D/g, "");
    if (!mobile) return "skipped";
    const result = await apiRequest<{ status: string; provider?: string }>("/notifications/customer-thank-you", {
      method: "POST",
      body: JSON.stringify({
        mobile: invoiceToSend.customerMobile,
        customerName: invoiceToSend.customerName,
        invoiceNo: invoiceToSend.invoiceNo,
        total: invoiceToSend.total,
        savings: invoiceToSend.savings ?? 0
      })
    });
    return result.status;
  }

  async function generateInvoice(options: { showPreview?: boolean; directPrintOnly?: boolean } = {}) {
    if (!items.length) {
      setScanMessage("Add at least one product before payment");
      return;
    }
    const missingQuantity = items.find((item) => item.qty <= 0);
    if (missingQuantity) {
      setScanMessage(`Enter quantity for ${missingQuantity.name}`);
      qtyRefs.current[missingQuantity.sku]?.focus();
      return;
    }
    const missingStock = items.find((item) => {
      const product = products.find((candidate) => candidate.sku === item.sku);
      return !product || product.stock < item.qty;
    });
    if (missingStock) {
      setScanMessage(`Not enough stock for ${missingStock.name}`);
      playScanTone(false);
      return;
    }

    const nextInvoice = addInvoice({
      customerId,
      customerName: customerName.trim() || "Walk-in Customer",
      customerMobile: customerMobile.trim(),
      customerEmail: "",
      customerAddress: "",
      customerGstin: "",
      paymentMethod,
      items: items.map((item) => ({
        sku: item.sku,
        name: item.name,
        barcode: item.barcode ?? "",
        hsnCode: item.hsnCode,
        unit: item.unit,
        quantity: item.qty,
        mrp: item.mrp,
        sellingPrice: item.sellingPrice,
        purchasePrice: item.purchasePrice,
        gstRate: item.gstRate ?? 0,
        gstMode: item.gstMode,
        savings: Math.max(0, item.mrp * item.qty - (item.gstMode === "excluded" ? item.sellingPrice * item.qty * (1 + (item.gstRate ?? 0) / 100) : item.sellingPrice * item.qty)),
        profit: (item.sellingPrice - item.purchasePrice) * item.qty,
        lineTotal: item.gstMode === "excluded" ? item.sellingPrice * item.qty * (1 + (item.gstRate ?? 0) / 100) : item.sellingPrice * item.qty
      })),
      subtotal,
      tax: gst,
      savings: totalSavings,
      profit,
      discount: billDiscount,
      total
    });

    try {
      await saveSaleToLocalMaster(nextInvoice);
    } catch (error) {
      setScanMessage(error instanceof Error ? `Local database save failed: ${error.message}` : "Local database save failed.");
      return;
    }

    for (const item of items) updateStock(item.sku, -item.qty);
    if (options.showPreview ?? true) setInvoice(nextInvoice);
    clear();
    setManualDiscount("0");
    setScanMessage(`Bill generated: ${nextInvoice.invoiceNo}`);
    void sendCustomerThankYou(nextInvoice)
      .then((status) => {
        if (status === "sent") setScanMessage(`Bill generated: ${nextInvoice.invoiceNo}. SMS sent to customer.`);
        if (status === "not_configured") setScanMessage(`Bill generated: ${nextInvoice.invoiceNo}. SMS API is not configured.`);
      })
      .catch(() => setScanMessage(`Bill generated: ${nextInvoice.invoiceNo}. SMS could not be sent.`));
    printReceipt(nextInvoice, { autoPrint: true, directOnly: options.directPrintOnly });
    scanInputRef.current?.focus();
  }

  function buildReceiptHtml(invoiceToPrint: InvoiceRecord, mode: ReceiptPrintMode) {
    const paperSize = mode === "a4" ? "A4" : "80mm 120mm";
    const receiptWidth = mode === "a4" ? "190mm" : "68mm";
    const pageMargin = mode === "a4" ? "10mm" : "0";
    const thermalTopOffset = mode === "a4" ? "0" : "-18mm";
    const fontSize = "12.5px";
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
    const money = (value: number) => `Rs ${Math.round(value)}`;
    const billDate = new Date(invoiceToPrint.createdAt).toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
    const rows = invoiceToPrint.items.map((item) => `
      <tr>
        <td class="item-name">${escapeHtml(item.name)}</td>
        <td>${escapeHtml(formatQty(item.quantity, item.unit))}</td>
        <td>${Math.round(item.mrp)}</td>
        <td>${Math.round(item.sellingPrice)}</td>
        <td>${Math.round(item.lineTotal)}</td>
      </tr>
    `).join("");

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(invoiceToPrint.invoiceNo)}</title>
          <style>
            @page { size: ${paperSize}; margin: ${pageMargin}; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; width: 80mm; min-height: 0; background: #fff; color: #000; }
            body {
              display: block;
              -webkit-font-smoothing: none;
              -webkit-print-color-adjust: exact;
              filter: grayscale(100%) contrast(185%);
              print-color-adjust: exact;
              text-rendering: geometricPrecision;
            }
            .receipt {
              width: ${receiptWidth};
              max-width: ${receiptWidth};
              margin: 0;
              padding: ${mode === "a4" ? "8px" : "0 0.75mm 0.8mm 0"};
              box-sizing: border-box;
              overflow: hidden;
              page-break-inside: avoid;
              break-inside: avoid;
              transform: translateY(${thermalTopOffset});
              font-family: Arial, Helvetica, sans-serif;
              font-size: ${mode === "a4" ? "12px" : "11.2px"};
              font-weight: 500;
              line-height: 1.12;
              letter-spacing: 0;
            }
            .logo { display: block; filter: contrast(230%) grayscale(100%); height: 20px; image-rendering: crisp-edges; margin: 0 auto; max-width: 25mm; object-fit: contain; }
            h1 { font-size: 17px; font-weight: 800; line-height: 1; margin: 0; text-align: center; }
            .center { text-align: center; }
            .muted { font-size: 0.86em; font-weight: 500; }
            .section { border-top: 1px solid #000; margin-top: 2px; padding-top: 2px; }
            .line { display: grid; grid-template-columns: 19mm 1fr; gap: 1mm; width: 100%; align-items: start; }
            .line span:last-child, .line strong { min-width: 0; text-align: right; overflow-wrap: anywhere; word-break: break-word; }
            .line strong { font-weight: 800; }
            table { border-collapse: collapse; table-layout: fixed; width: 100%; }
            th, td { border-bottom: 1px solid #000; color: #000; font-size: inherit; font-weight: 500; line-height: 1.08; overflow: hidden; overflow-wrap: normal; padding: 1.5px 1px; text-align: right; vertical-align: top; word-break: normal; }
            th { font-weight: 800; }
            th:first-child, td:first-child { text-align: left; }
            .item-name { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
            .grand { font-size: 1.2em; font-weight: 800; }
            .saved { font-weight: 800; }
            .footer { margin-top: 4px; text-align: center; font-weight: 700; }
            .preview-page { min-height: 100vh; padding: 16px; background: #f3f4f6; }
            .preview-page .receipt { background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.16); }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                min-width: 0 !important;
                background: #fff !important;
              }
              .preview-page {
                min-height: auto !important;
                padding: 0 !important;
                background: #fff !important;
              }
              .receipt {
                width: ${receiptWidth} !important;
                max-width: ${receiptWidth} !important;
                margin: 0 !important;
                padding: ${mode === "a4" ? "8px" : "0 0.75mm 0.8mm 0"} !important;
                overflow: hidden !important;
                transform: translateY(${thermalTopOffset}) !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                box-shadow: none !important;
              }
              table {
                width: 100% !important;
                table-layout: fixed !important;
                border-collapse: collapse !important;
              }
              td, th {
                overflow: hidden !important;
                overflow-wrap: anywhere !important;
                word-wrap: break-word !important;
                word-break: break-word !important;
              }
            }
          </style>
        </head>
        <body>
          <main class="${mode === "a4" ? "preview-page" : ""}">
            <div class="receipt">
              <img class="logo" src="/mm-logo-icon.png" alt="M&M SuperMart" />
              <h1>M&M SuperMart</h1>
              <div class="center muted">GST Invoice</div>
              <div class="center muted">GSTIN: 29AABCMMSUP1Z5</div>

              <div class="section">
                <div class="line"><span>Invoice</span><strong>${escapeHtml(invoiceToPrint.invoiceNo)}</strong></div>
                <div class="line"><span>Date</span><span>${billDate}</span></div>
                <div class="line"><span>Customer</span><span>${escapeHtml(invoiceToPrint.customerName || "Walk-in Customer")}</span></div>
                <div class="line"><span>Customer ID</span><span>${escapeHtml(invoiceToPrint.customerId)}</span></div>
                <div class="line"><span>Mobile</span><span>${escapeHtml(invoiceToPrint.customerMobile || "-")}</span></div>
                ${invoiceToPrint.customerGstin ? `<div class="line"><span>Cust GSTIN</span><span>${escapeHtml(invoiceToPrint.customerGstin)}</span></div>` : ""}
              </div>

              <div class="section">
                <table>
                  <colgroup>
                    <col style="width: 40%" />
                    <col style="width: 17%" />
                    <col style="width: 13%" />
                    <col style="width: 13%" />
                    <col style="width: 17%" />
                  </colgroup>
                  <thead><tr><th>Item</th><th>Qty</th><th>MRP</th><th>Sale</th><th>Amt</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>

              <div class="section">
                <div class="line"><span>Subtotal</span><span>${money(invoiceToPrint.subtotal)}</span></div>
                <div class="line"><span>GST</span><span>${money(invoiceToPrint.tax)}</span></div>
                <div class="line"><span>Savings</span><span>${money(invoiceToPrint.savings)}</span></div>
                ${invoiceToPrint.discount > 0 ? `<div class="line"><span>Addl Discount</span><span>-${money(invoiceToPrint.discount)}</span></div>` : ""}
                <div class="line grand"><span>Total</span><span>${money(invoiceToPrint.total)}</span></div>
                <div class="line"><span>Payment</span><strong>${escapeHtml(invoiceToPrint.paymentMethod)}</strong></div>
              </div>

              <div class="section center saved">You Saved ${money(invoiceToPrint.savings)} Today</div>
              <div class="footer">Thank you for shopping with M&M SuperMart</div>
            </div>
          </main>
        </body>
      </html>
    `;
  }

  function printReceipt(invoiceToPrint = invoice, options: { autoPrint?: boolean; mode?: ReceiptPrintMode; directOnly?: boolean } = {}) {
    if (!invoiceToPrint) return;
    const mode = options.mode ?? "thermal";
    const autoPrint = options.autoPrint ?? true;
    const receiptHtml = buildReceiptHtml(invoiceToPrint, mode);

    if (autoPrint && mode === "thermal") {
      const existingFrame = document.getElementById("thermal-print-frame");
      existingFrame?.remove();
      const frame = document.createElement("iframe");
      frame.id = "thermal-print-frame";
      frame.style.position = "fixed";
      frame.style.left = "0";
      frame.style.top = "0";
      frame.style.width = "80mm";
      frame.style.height = "200mm";
      frame.style.border = "0";
      frame.style.opacity = "0";
      frame.style.pointerEvents = "none";
      document.body.appendChild(frame);
      const frameWindow = frame.contentWindow;
      const frameDocument = frame.contentDocument ?? frameWindow?.document;
      if (!frameWindow || !frameDocument) {
        if (options.directOnly) {
          setScanMessage("Direct printer frame was not ready. Please press F9 again.");
          return;
        }
        window.print();
        return;
      }
      frameDocument.open();
      frameDocument.write(receiptHtml);
      frameDocument.close();
      window.setTimeout(() => {
        frameWindow.focus();
        frameWindow.print();
      }, 500);
      return;
    }

    if (options.directOnly) return;

    const printWindow = window.open("", mode === "a4" ? "mm-supermart-a4-invoice" : "mm-supermart-receipt-preview", mode === "a4" ? "width=900,height=900" : "width=420,height=720");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    if (autoPrint) window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  }

  function printInvoice(invoiceToPrint = invoice, mode: ReceiptPrintMode = "thermal") {
    printReceipt(invoiceToPrint, { autoPrint: true, mode });
  }

  return (
    <section className="min-h-[calc(100vh-7rem)] space-y-4">
      <div className="rounded-lg border bg-slate-950 p-5 text-white shadow-soft xl:flex xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase text-white/55">Billing counter</p>
          <h1 className="page-title mt-2 text-3xl font-semibold">POS Billing</h1>
          <p className="mt-2 text-sm text-white/65">Scan, adjust quantity, collect payment, and print the 80mm receipt.</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-md border border-white/10 bg-white/8 p-2 text-center text-xs text-white/70 sm:w-[420px] xl:mt-0">
          <span>F2 Barcode</span><span>F3 Search</span><span>F9 Pay</span>
        </div>
      </div>

      <div className="grid min-h-[720px] gap-4 xl:grid-cols-[300px_minmax(560px,1fr)_320px]">
        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Barcode className="size-4" /> Barcode Scanner</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input ref={scanInputRef} icon={Barcode} placeholder="Scan barcode / SKU" value={scanValue} onChange={(event) => setScanValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") scanAndAdd(); }} />
              <div className="grid gap-2">
                <Button className="w-full" variant="accent" disabled={lookupBusy} onClick={() => scanAndAdd()}><Zap className="size-4" /> {lookupBusy ? "Searching" : "Add Scan"}</Button>
              </div>
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{scanMessage}</p>
            </CardContent>
          </Card>

          {pendingProduct ? (
            <Card className="border-primary">
              <CardHeader><CardTitle>Complete New Product</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {pendingProduct.imageUrl ? <img src={pendingProduct.imageUrl} alt="" className="h-24 w-24 rounded-md object-cover" /> : null}
                <Input placeholder="Product name" value={pendingProduct.name} onChange={(event) => setPendingProduct({ ...pendingProduct, name: event.target.value })} />
                <Input placeholder="Brand" value={pendingProduct.brand ?? ""} onChange={(event) => setPendingProduct({ ...pendingProduct, brand: event.target.value })} />
                <Input placeholder="Category" value={pendingProduct.category ?? ""} onChange={(event) => setPendingProduct({ ...pendingProduct, category: event.target.value })} />
                <Input placeholder="Weight / unit" value={pendingProduct.unit ?? ""} onChange={(event) => setPendingProduct({ ...pendingProduct, unit: event.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="MRP" type="number" value={pendingProduct.mrp} onChange={(event) => setPendingProduct({ ...pendingProduct, mrp: event.target.value })} />
                  <Input placeholder="Sale price" type="number" value={pendingProduct.sellingPrice} onChange={(event) => setPendingProduct({ ...pendingProduct, sellingPrice: event.target.value })} />
                  <Input placeholder="GST %" type="number" value={pendingProduct.gst} onChange={(event) => setPendingProduct({ ...pendingProduct, gst: event.target.value })} />
                  <Input placeholder="Stock qty" type="number" value={pendingProduct.stock} onChange={(event) => setPendingProduct({ ...pendingProduct, stock: event.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => saveCompletedProduct()}>Save & Add</Button>
                  <Button variant="outline" onClick={() => setPendingProduct(null)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Search className="size-4" /> Find Products</CardTitle></CardHeader>
            <CardContent>
              <Input ref={searchInputRef} icon={Search} placeholder="Search product name, SKU, or barcode" value={search} onChange={(event) => setSearch(event.target.value)} />
            </CardContent>
          </Card>

          {searchResults.length ? (
            <Card>
              <CardHeader><CardTitle>Search Results</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {searchResults.map((product) => (
                  <button className="w-full rounded-md border p-3 text-left transition hover:border-primary hover:bg-muted" key={product.sku} onClick={() => addProductToBill(product, { focusQty: true })}>
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.barcode} · Stock {product.stock}</p>
                    <p className="mt-1 text-sm font-semibold text-primary">{formatCurrency(product.sellingPrice)} <span className="text-xs font-normal text-muted-foreground">MRP {formatCurrency(product.mrp)}</span></p>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle>Recent Bills</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {invoices.slice(0, 4).map((row, index) => (
                <div className="rounded-md border p-2 text-xs" key={`${row.invoiceNo}-${row.createdAt}-${index}`}>
                  <div className="flex justify-between gap-2"><span className="font-medium">{row.invoiceNo}</span><span>{formatCurrency(row.total)}</span></div>
                  <p className="mt-1 text-muted-foreground">{row.customerId || "CUST-0000"} · {row.paymentMethod}</p>
                </div>
              ))}
              {!invoices.length ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No bills yet.</p> : null}
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
          <Card className="min-h-full overflow-hidden border-primary/20 shadow-soft">
            <CardHeader className="gap-3 border-b lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="flex items-center gap-2 text-xl"><ReceiptText className="size-5 text-primary" /> Center Billing Cart</CardTitle>
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input icon={UserRound} placeholder="Customer name optional" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                  <Input icon={Phone} placeholder="Mobile number" value={customerMobile} onChange={(event) => setCustomerMobile(event.target.value)} />
                  <Input readOnly value={customerId} />
                </div>
                {regularCustomer ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <strong>Regular Customer</strong>
                    <span className="ml-2">{regularCustomer.bills} bills</span>
                    <span className="ml-2">Total {formatCurrency(regularCustomer.total)}</span>
                    <span className="ml-2">Last {new Date(regularCustomer.lastVisit).toLocaleDateString("en-IN")}</span>
                  </div>
                ) : customerMobile.replace(/\D/g, "").length >= 5 ? (
                  <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                    New customer mobile. Details will be saved after bill generation.
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-[minmax(160px,1fr)_150px_66px_78px_88px_36px] gap-2 rounded-md bg-slate-950 px-3 py-2 text-[11px] font-medium uppercase text-white/65 max-lg:hidden">
                <span>Product</span><span>Qty</span><span>MRP</span><span>Sale</span><span>Total</span><span />
              </div>
              <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                <AnimatePresence initial={false}>
                  {items.map((item) => {
                    const itemSavings = Math.max(0, item.mrp - item.sellingPrice) * item.qty;
                    return (
                      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} className="grid gap-3 rounded-lg border bg-card/95 p-3 shadow-sm lg:grid-cols-[minmax(160px,1fr)_150px_66px_78px_88px_36px] lg:items-center lg:gap-2" key={item.sku}>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="text-xs text-emerald-600">{item.qty > 0 ? `Qty ${formatQty(item.qty, item.unit)} · ` : ""}Saved {formatCurrency(itemSavings)}</p>
                        </div>
                        <div className="space-y-1">
                          <Input ref={(node) => { qtyRefs.current[item.sku] = node; }} className="h-9 text-center font-semibold" type="number" min="0.001" step="0.001" value={item.qty > 0 ? item.qty : ""} onChange={(event) => updateQty(item.sku, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") scanInputRef.current?.focus(); }} />
                        </div>
                        <p className="truncate text-sm">{formatCurrency(item.mrp)}</p>
                        <p className="truncate text-sm font-semibold text-primary">{formatCurrency(item.sellingPrice)}</p>
                        <p className="truncate font-semibold">{formatCurrency(item.sellingPrice * item.qty)}</p>
                        <Button variant="ghost" size="icon" onClick={() => remove(item.sku)}><Trash2 className="size-4" /></Button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {!items.length ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-8 text-center">
                    <Barcode className="size-12 text-primary" />
                    <p className="mt-4 text-lg font-semibold">Scan barcode to start billing</p>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">Add items by barcode scan or product search, set loose quantity like 250 g, then collect payment and print the 80mm receipt.</p>
                  </div>
                ) : null}
              </div>
              <div className="grid gap-3 border-t pt-4 md:grid-cols-5">
                <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">MRP Total</p><p className="text-lg font-semibold">{formatCurrency(mrpTotal)}</p></div>
                <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Selling Subtotal</p><p className="text-lg font-semibold">{formatCurrency(subtotal)}</p></div>
                <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">GST</p><p className="text-lg font-semibold">{formatCurrency(gst)}</p></div>
                <div className="rounded-md bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><p className="text-xs">Customer Savings</p><p className="text-lg font-semibold">{formatCurrency(totalSavings)}</p></div>
                <div className="rounded-md bg-primary p-3 text-primary-foreground"><p className="text-xs opacity-80">Grand Total</p><p className="text-xl font-semibold">{formatCurrency(total)}</p></div>
              </div>
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Payment Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(["Cash", "UPI", "Card"] as const).map((method) => <Button key={method} variant={paymentMethod === method ? "default" : "outline"} onClick={() => setPaymentMethod(method)}>{method}</Button>)}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Additional discount</p>
                <Input placeholder="Vendor/customer discount amount" type="number" min="0" value={manualDiscount} onChange={(event) => setManualDiscount(event.target.value)} />
              </div>
              <div className="rounded-lg bg-muted p-4 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="mt-2 flex justify-between"><span>GST</span><span>{formatCurrency(gst)}</span></div>
                <div className="mt-2 flex justify-between"><span>Auto Savings</span><span>{formatCurrency(automaticSavings)}</span></div>
                <div className="mt-2 flex justify-between"><span>Additional Discount</span><span>-{formatCurrency(billDiscount)}</span></div>
                <div className="mt-3 flex justify-between border-t pt-3 text-xl font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
              </div>
              <div className="rounded-md bg-muted p-3 text-sm font-medium">Receipt printer: 80mm thermal</div>
              <Button className="w-full" size="lg" onClick={() => generateInvoice({ showPreview: false, directPrintOnly: true })}><CreditCard className="size-4" /> Pay & Direct Print</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Invoice Preview</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-background p-4 text-sm">
                <div className="flex justify-between"><span>Customer</span><strong>{customerId}</strong></div>
                <div className="mt-2 flex justify-between"><span>Items</span><strong>{items.length}</strong></div>
                <div className="mt-2 flex justify-between"><span>Saved</span><strong>{formatCurrency(totalSavings)}</strong></div>
                <div className="mt-2 flex justify-between"><span>Payment</span><strong>{paymentMethod}</strong></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={!invoice} onClick={() => printInvoice()}><Printer className="size-4" /> Receipt</Button>
                <Button variant="outline" disabled={!invoice} onClick={() => printInvoice(invoice, "a4")}><FileText className="size-4" /> PDF/A4</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Today Live</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted p-3"><IndianRupee className="mb-2 size-4 text-primary" /><p className="text-muted-foreground">Revenue</p><p className="text-lg font-semibold">{formatCurrency(todayRevenue)}</p></div>
              <div className="rounded-md bg-muted p-3"><ReceiptText className="mb-2 size-4 text-primary" /><p className="text-muted-foreground">Bills</p><p className="text-lg font-semibold">{todayInvoices.length}</p></div>
              <div className="col-span-2 rounded-md bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><p>Last customer view</p><p className="text-lg font-semibold">You Saved {formatCurrency(totalSavings)} Today</p></div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
