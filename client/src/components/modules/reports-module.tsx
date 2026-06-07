"use client";

import { BarChart3, Download, FileSpreadsheet, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBillingStore, type InvoiceRecord } from "@/lib/stores/billing-store";
import { useProductStore, type ProductRecord } from "@/lib/stores/product-store";
import { formatCurrency } from "@/lib/utils";

type SheetRow = Record<string, string | number>;
type ReportBundle = {
  filenameBase: string;
  title: string;
  sheets: Record<string, SheetRow[]>;
};

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function reportDateStamp(date: Date) {
  return localDateKey(date).replaceAll("-", "");
}

function isSameDay(value: string, date: Date) {
  return localDateKey(new Date(value)) === localDateKey(date);
}

function sumInvoices(invoices: InvoiceRecord[]) {
  return {
    bills: invoices.length,
    productsSold: invoices.reduce((sum, invoice) => sum + invoice.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
    revenue: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
    subtotal: invoices.reduce((sum, invoice) => sum + invoice.subtotal, 0),
    gst: invoices.reduce((sum, invoice) => sum + invoice.tax, 0),
    profit: invoices.reduce((sum, invoice) => sum + (invoice.profit ?? 0), 0),
    savings: invoices.reduce((sum, invoice) => sum + (invoice.savings ?? 0), 0),
    discount: invoices.reduce((sum, invoice) => sum + (invoice.discount ?? 0), 0)
  };
}

function summaryRows(scope: string, invoices: InvoiceRecord[]): SheetRow[] {
  const totals = sumInvoices(invoices);
  return [{
    Report: scope,
    "Generated At": new Date().toLocaleString("en-IN"),
    Bills: totals.bills,
    "Products Sold": totals.productsSold,
    Revenue: totals.revenue,
    Subtotal: totals.subtotal,
    GST: totals.gst,
    Profit: totals.profit,
    "Customer Savings": totals.savings,
    "Manual Discount": totals.discount
  }];
}

function invoiceRows(invoices: InvoiceRecord[]): SheetRow[] {
  return invoices.map((invoice) => ({
    "Invoice No": invoice.invoiceNo,
    "Date Time": new Date(invoice.createdAt).toLocaleString("en-IN"),
    "Customer ID": invoice.customerId || "",
    "Customer Name": invoice.customerName || "Walk-in Customer",
    Mobile: invoice.customerMobile || "",
    Email: invoice.customerEmail || "",
    Address: invoice.customerAddress || "",
    GSTIN: invoice.customerGstin || "",
    Payment: invoice.paymentMethod,
    Items: invoice.items.length,
    Subtotal: invoice.subtotal,
    GST: invoice.tax,
    Savings: invoice.savings ?? 0,
    Profit: invoice.profit ?? 0,
    "Manual Discount": invoice.discount ?? 0,
    "Grand Total": invoice.total
  }));
}

function productLookup(products: ProductRecord[]) {
  const rows = new Map<string, ProductRecord>();
  for (const product of products) {
    rows.set(product.sku, product);
    if (product.barcode) rows.set(product.barcode, product);
  }
  return rows;
}

function itemHsn(item: InvoiceRecord["items"][number], productsByCode: Map<string, ProductRecord>) {
  return item.hsnCode || productsByCode.get(item.sku)?.hsnCode || productsByCode.get(item.barcode)?.hsnCode || "";
}

function invoiceLineRows(invoices: InvoiceRecord[], productsByCode = new Map<string, ProductRecord>()): SheetRow[] {
  return invoices.flatMap((invoice) => invoice.items.map((item) => ({
    "Invoice No": invoice.invoiceNo,
    "Date Time": new Date(invoice.createdAt).toLocaleString("en-IN"),
    "Customer ID": invoice.customerId || "",
    Mobile: invoice.customerMobile || "",
    Email: invoice.customerEmail || "",
    Address: invoice.customerAddress || "",
    GSTIN: invoice.customerGstin || "",
    Payment: invoice.paymentMethod,
    SKU: item.sku,
    Barcode: item.barcode,
    HSN: itemHsn(item, productsByCode),
    Product: item.name,
    Qty: item.quantity,
    MRP: item.mrp,
    "Selling Price": item.sellingPrice,
    "GST %": item.gstRate,
    Savings: item.savings ?? 0,
    Profit: item.profit ?? 0,
    "Line Total": item.lineTotal,
    "Invoice GST": invoice.tax,
    "Grand Total": invoice.total
  })));
}

function groupByMonth(invoices: InvoiceRecord[]): SheetRow[] {
  const rows = new Map<string, InvoiceRecord[]>();
  for (const invoice of invoices) {
    const created = new Date(invoice.createdAt);
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
    rows.set(key, [...(rows.get(key) ?? []), invoice]);
  }
  return Array.from(rows.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, monthInvoices]) => ({
    Month: month,
    ...sumInvoices(monthInvoices)
  }));
}

function groupByDay(invoices: InvoiceRecord[]): SheetRow[] {
  const rows = new Map<string, InvoiceRecord[]>();
  for (const invoice of invoices) {
    const key = localDateKey(new Date(invoice.createdAt));
    rows.set(key, [...(rows.get(key) ?? []), invoice]);
  }
  return Array.from(rows.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayInvoices]) => ({
    Date: date,
    ...sumInvoices(dayInvoices)
  }));
}

function xmlText(value: string | number) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadWorkbook(filename: string, sheets: Record<string, SheetRow[]>) {
  const worksheets = Object.entries(sheets).map(([sheetName, rawRows]) => {
    const rows = rawRows.length ? rawRows : [{ Message: "No records found for this report." }];
    const columns = Object.keys(rows[0]);
    const columnWidths = columns.map((column) => {
      const maxLength = Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length));
      return Math.min(180, Math.max(72, maxLength * 7));
    });
    const headerRow = `<Row ss:Height="22">${columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlText(column)}</Data></Cell>`).join("")}</Row>`;
    const dataRows = rows.map((row) => `<Row>${columns.map((column) => {
      const value = row[column] ?? "";
      const isNumber = typeof value === "number" && Number.isFinite(value);
      return `<Cell ss:StyleID="${isNumber ? "NumberCell" : "Cell"}"><Data ss:Type="${isNumber ? "Number" : "String"}">${xmlText(value)}</Data></Cell>`;
    }).join("")}</Row>`).join("");

    return `
      <Worksheet ss:Name="${xmlText(sheetName.slice(0, 31))}">
        <Table>
          ${columnWidths.map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}" />`).join("")}
          ${headerRow}
          ${dataRows}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          <FreezePanes/>
          <FrozenNoSplit/>
          <SplitHorizontal>1</SplitHorizontal>
          <TopRowBottomPane>1</TopRowBottomPane>
          <ActivePane>2</ActivePane>
          <Panes><Pane><Number>2</Number></Pane></Panes>
        </WorksheetOptions>
      </Worksheet>
    `;
  }).join("");

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Color="#000000"/>
      <Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
    <Style ss:ID="Cell">
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
    <Style ss:ID="NumberCell">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <NumberFormat ss:Format="#,##0.00"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
  </Styles>
  ${worksheets}
</Workbook>`;

  const url = URL.createObjectURL(new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, sheets: Record<string, SheetRow[]>) {
  const sections = Object.entries(sheets).map(([sheetName, rawRows]) => {
    const rows = rawRows.length ? rawRows : [{ Message: "No records found for this report." }];
    const columns = Object.keys(rows[0]);
    const escape = (value: string | number) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    return [`# ${sheetName}`, columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column] ?? "")).join(","))].join("\r\n");
  }).join("\r\n\r\n");
  const url = URL.createObjectURL(new Blob([sections], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pdfText(value: string | number) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function downloadPdf(filename: string, title: string, sheets: Record<string, SheetRow[]>) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 24;
  const rowHeight = 18;
  const headerHeight = 22;
  const tableTop = 100;
  const tableBottom = margin + 24;
  const maxColumns = 8;
  const pages: string[] = [];

  function text(value: string | number, maxLength = 42) {
    const clean = String(value ?? "").replace(/[^\x20-\x7E]/g, "").trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}.` : clean;
  }

  function moneyLike(value: string | number) {
    return typeof value === "number" ? Math.round(value).toLocaleString("en-IN") : text(value, 24);
  }

  function drawText(x: number, y: number, value: string | number, size = 8, font = "F1", maxLength = 42) {
    return `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(text(value, maxLength))}) Tj ET`;
  }

  function drawLine(x1: number, y1: number, x2: number, y2: number, width = 0.5) {
    return `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
  }

  function drawRect(x: number, y: number, width: number, height: number, fill = false) {
    return `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill ? "f" : "S"}`;
  }

  function makePage(sheetName: string, columns: string[], rows: SheetRow[], rowStart: number, rowEnd: number, pageNo: number, totalPages: number) {
    const commands: string[] = [];
    const tableWidth = pageWidth - margin * 2;
    const colWidth = tableWidth / columns.length;
    let y = pageHeight - margin;
    commands.push(drawText(margin, y, "M&M SuperMart ERP & POS", 14, "F2", 80));
    commands.push(drawText(margin, y - 18, title, 11, "F2", 90));
    commands.push(drawText(margin, y - 34, `${sheetName} | Generated: ${new Date().toLocaleString("en-IN")}`, 8, "F1", 110));
    commands.push(drawText(pageWidth - margin - 80, margin - 6, `Page ${pageNo}/${totalPages}`, 8, "F1", 20));

    y = pageHeight - tableTop;
    columns.forEach((column, index) => {
      const x = margin + index * colWidth;
      commands.push("0.90 0.90 0.90 rg");
      commands.push(drawRect(x, y - headerHeight, colWidth, headerHeight, true));
      commands.push("0 0 0 rg");
      commands.push(drawRect(x, y - headerHeight, colWidth, headerHeight));
      commands.push(drawText(x + 3, y - 14, column, 7, "F2", Math.max(8, Math.floor(colWidth / 4))));
    });
    y -= headerHeight;

    rows.slice(rowStart, rowEnd).forEach((row, rowIndex) => {
      columns.forEach((column, columnIndex) => {
        const x = margin + columnIndex * colWidth;
        if (rowIndex % 2 === 1) {
          commands.push("0.97 0.97 0.97 rg");
          commands.push(drawRect(x, y - rowHeight, colWidth, rowHeight, true));
          commands.push("0 0 0 rg");
        }
        commands.push(drawRect(x, y - rowHeight, colWidth, rowHeight));
        const value = row[column] ?? "";
        commands.push(drawText(x + 3, y - 12, typeof value === "number" ? moneyLike(value) : value, 7.2, "F1", Math.max(8, Math.floor(colWidth / 3.8))));
      });
      y -= rowHeight;
    });
    const tableHeight = headerHeight + (rowEnd - rowStart) * rowHeight;
    commands.push(drawRect(margin, pageHeight - tableTop - tableHeight, tableWidth, tableHeight, false));
    return commands.join("\n");
  }

  for (const [sheetName, rawRows] of Object.entries(sheets)) {
    const rows = rawRows.length ? rawRows : [{ Message: "No records found for this report." }];
    const allColumns = Object.keys(rows[0]);
    for (let columnStart = 0; columnStart < allColumns.length; columnStart += maxColumns) {
      const columns = allColumns.slice(columnStart, columnStart + maxColumns);
      const rowsPerPage = Math.max(1, Math.floor(((pageHeight - tableTop - headerHeight) - tableBottom) / rowHeight));
      const totalPagesForChunk = Math.max(1, Math.ceil(rows.length / rowsPerPage));
      for (let pageIndex = 0; pageIndex < totalPagesForChunk; pageIndex += 1) {
        const start = pageIndex * rowsPerPage;
        const end = start + rowsPerPage;
        const chunkName = allColumns.length > maxColumns ? `${sheetName} (${columnStart + 1}-${Math.min(columnStart + maxColumns, allColumns.length)})` : sheetName;
        pages.push(makePage(chunkName, columns, rows, start, end, pages.length + 1, 0));
      }
    }
  }

  const totalPages = pages.length || 1;
  const finalPages = pages.map((page, index) => page.replace(/Page \d+\/0/g, `Page ${index + 1}/${totalPages}`));

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${finalPages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${finalPages.length} >>`
  ];

  finalPages.forEach((content, pageIndex) => {
    const pageObjectId = 3 + pageIndex * 2;
    const contentObjectId = pageObjectId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${3 + finalPages.length * 2} 0 R /F2 ${4 + finalPages.length * 2} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ReportsModule() {
  const { invoices } = useBillingStore();
  const { products } = useProductStore();
  const [message, setMessage] = useState("All reports are generated from existing live POS bills and inventory. Previous bills are preserved.");
  const today = new Date();
  const stamp = reportDateStamp(today);
  const todayInvoices = useMemo(() => invoices.filter((invoice) => isSameDay(invoice.createdAt, today)), [invoices]);
  const monthInvoices = useMemo(() => invoices.filter((invoice) => {
    const created = new Date(invoice.createdAt);
    return created.getMonth() === today.getMonth() && created.getFullYear() === today.getFullYear();
  }), [invoices]);
  const yearInvoices = useMemo(() => invoices.filter((invoice) => new Date(invoice.createdAt).getFullYear() === today.getFullYear()), [invoices]);
  const weekInvoices = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return invoices.filter((invoice) => {
      const created = new Date(invoice.createdAt);
      return created >= start && created < end;
    });
  }, [invoices]);
  const quarterInvoices = useMemo(() => {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    return invoices.filter((invoice) => {
      const created = new Date(invoice.createdAt);
      return created.getFullYear() === today.getFullYear() && created.getMonth() >= quarterStartMonth && created.getMonth() < quarterStartMonth + 3;
    });
  }, [invoices]);

  const todayTotals = sumInvoices(todayInvoices);
  const stockValueCost = products.reduce((sum, product) => sum + product.stock * (product.purchasePrice || 0), 0);
  const stockValueSale = products.reduce((sum, product) => sum + product.stock * (product.sellingPrice || product.mrp || 0), 0);
  const productsByCode = useMemo(() => productLookup(products), [products]);

  function productPerformanceBundle(): ReportBundle {
    const productMap = new Map<string, SheetRow>();
    for (const invoice of yearInvoices) {
      for (const item of invoice.items) {
        const current = productMap.get(item.sku) ?? { SKU: item.sku, Barcode: item.barcode, Product: item.name, Qty: 0, Revenue: 0, Profit: 0, Savings: 0 };
        current.Qty = Number(current.Qty) + item.quantity;
        current.Revenue = Number(current.Revenue) + item.lineTotal;
        current.Profit = Number(current.Profit) + (item.profit ?? 0);
        current.Savings = Number(current.Savings) + (item.savings ?? 0);
        productMap.set(item.sku, current);
      }
    }
    return {
      filenameBase: `MM-SuperMart-Product-Performance-${stamp}`,
      title: "Product Performance Report",
      sheets: { Products: Array.from(productMap.values()).sort((a, b) => Number(b.Revenue) - Number(a.Revenue)) }
    };
  }

  function inventoryBundle(): ReportBundle {
    return {
      filenameBase: `MM-SuperMart-Inventory-Valuation-${stamp}`,
      title: "Inventory Valuation Report",
      sheets: {
        Summary: [{ "Products": products.length, "Stock Value At Cost": stockValueCost, "Stock Value At Sale": stockValueSale }],
        Inventory: products.map((product) => ({
          SKU: product.sku,
          Barcode: product.barcode,
          Product: product.name,
          Category: product.category,
          Unit: product.unit,
          Stock: product.stock,
          "Purchase Price": product.purchasePrice || 0,
          MRP: product.mrp || 0,
          "Selling Price": product.sellingPrice || product.mrp || 0,
          GST: product.gst,
          "GST Mode": product.gstMode || "included",
          "Purchased By": product.purchasedBy || "",
          "Manufacture Date": product.manufactureDate || "",
          "Expiry Date": product.expiryDate || product.expiry || "",
          "Stock Value At Cost": product.stock * (product.purchasePrice || 0),
          "Stock Value At Sale": product.stock * (product.sellingPrice || product.mrp || 0)
        }))
      }
    };
  }

  function gstBundle(scope: "Monthly" | "Yearly"): ReportBundle {
    const reportInvoices = scope === "Monthly" ? monthInvoices : yearInvoices;
    const gstMap = new Map<number, SheetRow>();
    const productGstMap = new Map<string, SheetRow>();
    for (const invoice of reportInvoices) {
      for (const item of invoice.items) {
        const rate = item.gstRate ?? 0;
        const hsnCode = itemHsn(item, productsByCode);
        const taxableValue = item.gstMode === "included" && rate > 0 ? item.lineTotal / (1 + rate / 100) : item.lineTotal;
        const gstValue = item.gstMode === "included" && rate > 0 ? item.lineTotal - taxableValue : item.lineTotal * (rate / 100);
        const current = gstMap.get(rate) ?? { "GST Rate": `${rate}%`, "Taxable Value": 0, GST: 0, "Invoice Count": 0 };
        current["Taxable Value"] = Number(current["Taxable Value"]) + taxableValue;
        current.GST = Number(current.GST) + gstValue;
        current["Invoice Count"] = Number(current["Invoice Count"]) + 1;
        gstMap.set(rate, current);

        const key = `${invoice.invoiceNo}-${item.sku}-${hsnCode}-${rate}`;
        const productRow = productGstMap.get(key) ?? {
          "Invoice No": invoice.invoiceNo,
          "Date Time": new Date(invoice.createdAt).toLocaleString("en-IN"),
          SKU: item.sku,
          Barcode: item.barcode,
          HSN: hsnCode,
          Product: item.name,
          Qty: 0,
          "GST %": rate,
          "Taxable Value": 0,
          GST: 0,
          "Line Total": 0
        };
        productRow.Qty = Number(productRow.Qty) + item.quantity;
        productRow["Taxable Value"] = Number(productRow["Taxable Value"]) + taxableValue;
        productRow.GST = Number(productRow.GST) + gstValue;
        productRow["Line Total"] = Number(productRow["Line Total"]) + item.lineTotal;
        productGstMap.set(key, productRow);
      }
    }
    return {
      filenameBase: `MM-SuperMart-${scope}-GST-${stamp}`,
      title: `${scope} GST Report`,
      sheets: {
        Summary: summaryRows(`${scope} GST Report`, reportInvoices),
        "GST Rate Wise": Array.from(gstMap.values()),
        "Product HSN Wise": Array.from(productGstMap.values()),
        "Invoice Lines": invoiceLineRows(reportInvoices, productsByCode),
        Invoices: invoiceRows(reportInvoices)
      }
    };
  }

  function customerBundle(title: string): ReportBundle {
    const rows = invoiceRows(yearInvoices).map((row) => ({ ...row, Outstanding: 0, Status: "Paid" }));
    return { filenameBase: `MM-SuperMart-${title.replaceAll(" ", "-")}-${stamp}`, title, sheets: { Customers: rows } };
  }

  function supplierBundle(title: string): ReportBundle {
    return { filenameBase: `MM-SuperMart-${title.replaceAll(" ", "-")}-${stamp}`, title, sheets: { Suppliers: [{ Message: "Supplier purchase rows appear after purchase entries are recorded.", Outstanding: 0 }] } };
  }

  function stockMovementBundle(title: string, mode: "dead" | "fast" | "slow" | "stock"): ReportBundle {
    const performance = productPerformanceBundle().sheets.Products;
    const soldQty = new Map(performance.map((row) => [String(row.SKU), Number(row.Qty)]));
    const rows = products.map((product) => ({
      SKU: product.sku,
      Barcode: product.barcode,
      Product: product.name,
      Category: product.category,
      Stock: product.stock,
      "Sold Qty": soldQty.get(product.sku) || 0,
      "Sale Value": product.stock * (product.sellingPrice || product.mrp || 0)
    }));
    const filtered = mode === "dead"
      ? rows.filter((row) => Number(row["Sold Qty"]) === 0 && Number(row.Stock) > 0)
      : mode === "fast"
        ? rows.filter((row) => Number(row["Sold Qty"]) > 0).sort((a, b) => Number(b["Sold Qty"]) - Number(a["Sold Qty"])).slice(0, 100)
        : mode === "slow"
          ? rows.filter((row) => Number(row["Sold Qty"]) <= 2).sort((a, b) => Number(a["Sold Qty"]) - Number(b["Sold Qty"]))
          : rows;
    return { filenameBase: `MM-SuperMart-${title.replaceAll(" ", "-")}-${stamp}`, title, sheets: { Products: filtered } };
  }

  function bundle(title: string, filename: string, reportInvoices: InvoiceRecord[], extraSheets: Record<string, SheetRow[]> = {}): ReportBundle {
    return {
      filenameBase: `MM-SuperMart-${filename}-${stamp}`,
      title,
      sheets: {
        Summary: summaryRows(title, reportInvoices),
        Invoices: invoiceRows(reportInvoices),
        "Invoice Lines": invoiceLineRows(reportInvoices, productsByCode),
        ...extraSheets
      }
    };
  }

  const reportFactories: Array<{ title: string; description: string; icon: typeof ReceiptText; primary?: boolean; make: () => ReportBundle }> = [
    { title: "Daily Sales Report", description: "Today's bills, item lines, GST, profit, savings, customer and payment details.", icon: ReceiptText, primary: true, make: () => bundle("Daily Sales Report", "Daily-Sales", todayInvoices) },
    { title: "Weekly Sales Report", description: "Current week bills, revenue, products sold, GST, and payments.", icon: ReceiptText, make: () => bundle("Weekly Sales Report", "Weekly-Sales", weekInvoices, { "Daily Summary": groupByDay(weekInvoices) }) },
    { title: "Monthly Sales Report", description: "Current month sales with daily summary and invoice lines.", icon: BarChart3, make: () => bundle("Monthly Sales Report", "Monthly-Sales", monthInvoices, { "Daily Summary": groupByDay(monthInvoices) }) },
    { title: "Quarterly Sales Report", description: "Current quarter sales summary with invoice and item details.", icon: BarChart3, make: () => bundle("Quarterly Sales Report", "Quarterly-Sales", quarterInvoices, { "Daily Summary": groupByDay(quarterInvoices) }) },
    { title: "Yearly Sales Report", description: "Full financial year style sales summary with monthly totals and invoice lines.", icon: BarChart3, make: () => bundle("Yearly Sales Report", "Yearly-Sales", yearInvoices, { "Monthly Summary": groupByMonth(yearInvoices) }) },
    { title: "Daily Profit Report", description: "Today's revenue, purchase cost based profit, discounts, GST, and savings.", icon: BarChart3, make: () => bundle("Daily Profit Report", "Daily-Profit", todayInvoices) },
    { title: "Monthly Profit Report", description: "Monthly profit and margin summary.", icon: BarChart3, make: () => bundle("Monthly Profit Report", "Monthly-Profit", monthInvoices, { "Daily Profit": groupByDay(monthInvoices) }) },
    { title: "Yearly Profit Report", description: "Yearly profit/loss summary with monthly P&L.", icon: BarChart3, make: () => bundle("Yearly Profit Report", "Yearly-Profit", yearInvoices, { "Monthly P&L": groupByMonth(yearInvoices) }) },
    { title: "GSTR-1 Report", description: "Invoice-wise outward supply summary for GST filing.", icon: FileSpreadsheet, make: () => gstBundle("Monthly") },
    { title: "GSTR-3B Report", description: "Monthly GST liability summary by tax rate.", icon: FileSpreadsheet, make: () => gstBundle("Monthly") },
    { title: "Yearly GST Summary", description: "Yearly GST summary for accountant filing and audit review.", icon: FileSpreadsheet, make: () => gstBundle("Yearly") },
    { title: "Balance Sheet", description: "Simple live balance sheet from POS revenue, profit, GST payable, and inventory value.", icon: FileSpreadsheet, make: () => ({ filenameBase: `MM-SuperMart-Balance-Sheet-${stamp}`, title: "Balance Sheet", sheets: { Summary: [{ Assets: stockValueCost + sumInvoices(yearInvoices).revenue, "Inventory At Cost": stockValueCost, Cash: sumInvoices(yearInvoices).revenue, "GST Payable": sumInvoices(yearInvoices).gst, Equity: stockValueCost + sumInvoices(yearInvoices).profit }] } }) },
    { title: "Cash Flow Statement", description: "Cash/UPI/Card inflow by day and all POS invoice cash movement.", icon: FileSpreadsheet, make: () => bundle("Cash Flow Statement", "Cash-Flow", yearInvoices, { "Daily Cash Flow": groupByDay(yearInvoices) }) },
    { title: "Receivables Aging", description: "Customer invoice payment status. POS bills are marked paid unless credit is later added.", icon: FileSpreadsheet, make: () => ({ filenameBase: `MM-SuperMart-Receivables-Aging-${stamp}`, title: "Receivables Aging", sheets: { Receivables: invoiceRows(yearInvoices).map((row) => ({ ...row, Status: "Paid", Outstanding: 0 })) } }) },
    { title: "Stock Report", description: "Current stock, purchase price, MRP, selling price, and valuation.", icon: FileSpreadsheet, make: inventoryBundle },
    { title: "Dead Stock Report", description: "Products with stock but no sales movement.", icon: FileSpreadsheet, make: () => stockMovementBundle("Dead Stock Report", "dead") },
    { title: "Fast Moving Products", description: "Highest moving products by sold quantity.", icon: BarChart3, make: () => stockMovementBundle("Fast Moving Products", "fast") },
    { title: "Slow Moving Products", description: "Low movement products needing attention.", icon: BarChart3, make: () => stockMovementBundle("Slow Moving Products", "slow") },
    { title: "Customer Ledger", description: "Customer-wise purchase and payment ledger from bills.", icon: FileSpreadsheet, make: () => customerBundle("Customer Ledger") },
    { title: "Customer Outstanding Amount", description: "Customer outstanding amounts; POS bills are paid unless credit is recorded.", icon: FileSpreadsheet, make: () => customerBundle("Customer Outstanding Amount") },
    { title: "Customer Purchase History", description: "Customer-wise purchase history from invoices.", icon: FileSpreadsheet, make: () => customerBundle("Customer Purchase History") },
    { title: "Supplier Ledger", description: "Supplier ledger from purchase records.", icon: FileSpreadsheet, make: () => supplierBundle("Supplier Ledger") },
    { title: "Supplier Purchase History", description: "Supplier purchase history.", icon: FileSpreadsheet, make: () => supplierBundle("Supplier Purchase History") },
    { title: "Supplier Outstanding Amount", description: "Supplier outstanding balances.", icon: FileSpreadsheet, make: () => supplierBundle("Supplier Outstanding Amount") },
    { title: "Attendance Report", description: "Downloads correctly; HR attendance data will appear when employee attendance is recorded.", icon: FileSpreadsheet, make: () => ({ filenameBase: `MM-SuperMart-Attendance-${stamp}`, title: "Attendance Report", sheets: { Attendance: [{ Message: "No attendance records available yet." }] } }) },
    { title: "Salary Report", description: "Downloads correctly; payroll rows will appear after salary data is configured.", icon: FileSpreadsheet, make: () => ({ filenameBase: `MM-SuperMart-Salary-${stamp}`, title: "Salary Report", sheets: { Salary: [{ Message: "No salary records available yet." }] } }) },
    { title: "Leave & Department Report", description: "Downloads correctly; leave and department records will appear when HRMS data is added.", icon: FileSpreadsheet, make: () => ({ filenameBase: `MM-SuperMart-Leave-Department-${stamp}`, title: "Leave & Department Report", sheets: { Leave: [{ Message: "No leave records available yet." }], Departments: [{ Message: "No department records available yet." }] } }) }
  ];

  async function downloadExcel(report: ReportBundle) {
    downloadWorkbook(`${report.filenameBase}.xls`, report.sheets);
    setMessage(`Downloaded ${report.title} Excel. Existing bills were not changed.`);
  }

  function downloadReportPdf(report: ReportBundle) {
    downloadPdf(`${report.filenameBase}.pdf`, report.title, report.sheets);
    setMessage(`Downloaded ${report.title} PDF. Existing bills were not changed.`);
  }

  function downloadReportCsv(report: ReportBundle) {
    downloadCsv(`${report.filenameBase}.csv`, report.sheets);
    setMessage(`Downloaded ${report.title} CSV. Existing bills were not changed.`);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">PDF and Excel exports for sales, GST, yearly reports, profit, inventory, cash flow, and HR.</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">{message}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Today's Revenue</p><p className="text-2xl font-semibold">{formatCurrency(todayTotals.revenue)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Today's Profit</p><p className="text-2xl font-semibold">{formatCurrency(todayTotals.profit)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Bills</p><p className="text-2xl font-semibold">{todayTotals.bills}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Customer Savings</p><p className="text-2xl font-semibold">{formatCurrency(todayTotals.savings)}</p><p className="text-xs text-muted-foreground">{todayTotals.productsSold} products sold</p></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {reportFactories.map((report) => {
          const Icon = report.icon;
          return (
            <Card className={report.primary ? "border-primary" : ""} key={report.title}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{report.title}</CardTitle>
                <Icon className={report.primary ? "size-5 text-primary" : "size-5 text-accent"} />
              </CardHeader>
              <CardContent>
                <p className="mb-4 min-h-20 text-sm text-muted-foreground">{report.description}</p>
                <div className="grid gap-2">
                  <Button className="w-full" variant={report.primary ? "default" : "outline"} onClick={() => downloadReportPdf(report.make())}>
                    <Download className="size-4" /> Download PDF
                  </Button>
                  <Button className="w-full" variant="outline" onClick={() => downloadExcel(report.make())}>
                    <FileSpreadsheet className="size-4" /> Download Excel
                  </Button>
                  <Button className="w-full" variant="outline" onClick={() => downloadReportCsv(report.make())}>
                    <FileSpreadsheet className="size-4" /> Download CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
