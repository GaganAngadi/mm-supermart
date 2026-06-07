"use client";

import type { ProductRecord } from "@/lib/stores/product-store";

type QrBarcodeLabelProps = {
  product: ProductRecord;
  qrSvg: string;
  valueMode: "barcode" | "sku";
};

export type QrLabelPrintItem = {
  name: string;
  sku: string;
  barcode: string;
  price: number;
  qrSvg: string;
  valueMode: "barcode" | "sku";
};

function formatLabelPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(price);
}

export function QrBarcodeLabel({ product, qrSvg, valueMode }: QrBarcodeLabelProps) {
  const codeValue = valueMode === "barcode" ? product.barcode : product.sku;
  const price = product.sellingPrice || product.mrp || 0;

  return (
    <section className="qr-barcode-label">
      <div className="qr-label-inner">
        <div className="qr-product-name">{product.name}</div>
        <div className="qr-code-slot" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <div className="qr-code-value">{codeValue}</div>
        <div className="qr-price">Price: {formatLabelPrice(price)}</div>
      </div>
    </section>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildQrLabelPrintHtml(items: QrLabelPrintItem[]) {
  const labels = items
    .map((item) => {
      const codeValue = item.valueMode === "barcode" ? item.barcode : item.sku;
      return `
        <section class="qr-barcode-label">
          <div class="qr-label-inner">
            <div class="qr-product-name">${escapeHtml(item.name)}</div>
            <div class="qr-code-slot">${item.qrSvg}</div>
            <div class="qr-code-value">${escapeHtml(codeValue)}</div>
            <div class="qr-price">Price: ${escapeHtml(formatLabelPrice(item.price))}</div>
          </div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>M&M SuperMart QR Label</title>
        <style>${qrBarcodeLabelCss}</style>
      </head>
      <body><main class="qr-print-sheet">${labels}</main></body>
    </html>`;
}

export const qrBarcodeLabelCss = `
  @page { size: 50mm 25mm; margin: 0; }
  html {
    width: 50mm;
    margin: 0;
    padding: 0;
    background: #fff;
  }
  body {
    width: 50mm;
    margin: 0;
    padding: 0;
    background: #fff;
    overflow: hidden;
  }
  .qr-print-sheet {
    display: flex;
    flex-direction: column;
    gap: 2mm;
    margin: 0;
    padding: 0;
    background: #fff;
  }
  .qr-barcode-label {
    width: 50mm;
    height: 25mm;
    margin: 0;
    padding: 0;
    position: relative;
    overflow: hidden;
    color: #000;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    box-sizing: border-box;
    break-inside: avoid;
    page-break-inside: avoid;
    page-break-after: always;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .qr-barcode-label:last-child {
    page-break-after: auto;
  }
  .qr-label-inner {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: 5.4mm 11.3mm 3.2mm 3.4mm;
    justify-items: center;
    align-items: center;
    padding: 0.8mm 1.2mm 0.6mm;
    overflow: hidden;
    box-sizing: border-box;
  }
  .qr-product-name {
    width: 47.6mm;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    text-align: center;
    font-size: 6.7pt;
    font-weight: 800;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .qr-code-slot {
    width: 11mm;
    height: 11mm;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .qr-code-slot svg {
    width: 11mm;
    height: 11mm;
    display: block;
    shape-rendering: crispEdges;
  }
  .qr-code-value {
    width: 47.6mm;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
    font-family: "Courier New", monospace;
    font-size: 6.2pt;
    font-weight: 800;
    line-height: 1;
  }
  .qr-price {
    width: 47.6mm;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: right;
    font-size: 7.4pt;
    font-weight: 900;
    line-height: 1;
  }
`;
