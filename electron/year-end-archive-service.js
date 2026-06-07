const AdmZip = require("adm-zip");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

function money(value) {
  return Number(value || 0);
}

function rowsToCsv(rows) {
  const safeRows = rows.length ? rows : [{ Message: "No records found" }];
  const columns = Object.keys(safeRows[0]);
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [columns.map(escape).join(","), ...safeRows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\r\n");
}

function rowsToXlsXml(sheetName, rows) {
  const safeRows = rows.length ? rows : [{ Message: "No records found" }];
  const columns = Object.keys(safeRows[0]);
  const xml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const header = `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${xml(column)}</Data></Cell>`).join("")}</Row>`;
  const body = safeRows.map((row) => `<Row>${columns.map((column) => {
    const value = row[column];
    const type = typeof value === "number" ? "Number" : "String";
    return `<Cell><Data ss:Type="${type}">${xml(value)}</Data></Cell>`;
  }).join("")}</Row>`).join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="${xml(sheetName.slice(0, 31))}"><Table>${header}${body}</Table></Worksheet>
</Workbook>`;
}

function simplePdf(title, rows) {
  const text = [title, `Generated: ${new Date().toLocaleString("en-IN")}`, "", ...rows.slice(0, 40).map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(" | "))].join("\n");
  const safe = text.replace(/[^\x20-\x7E\n]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = `BT /F1 10 Tf 40 780 Td (${safe.replace(/\n/g, ") Tj T* (")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

class YearEndArchiveService {
  constructor({ database, backupService, userDataPath, logger }) {
    this.database = database;
    this.backupService = backupService;
    this.userDataPath = userDataPath;
    this.logger = logger || (() => undefined);
    this.preferredArchiveRoot = "C:\\MMSuperMart\\Archives";
    this.archiveRoot = this.preferredArchiveRoot;
  }

  ensureArchiveRoot(year) {
    try {
      mkdirSync(this.preferredArchiveRoot, { recursive: true });
      this.archiveRoot = this.preferredArchiveRoot;
    } catch {
      this.archiveRoot = join(this.userDataPath, "Archives");
      mkdirSync(this.archiveRoot, { recursive: true });
    }
    const dir = join(this.archiveRoot, String(year));
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  financialYear(date = new Date()) {
    const year = date.getFullYear();
    const startsPreviousYear = date.getMonth() < 3;
    const startYear = startsPreviousYear ? year - 1 : year;
    return { startYear, endYear: startYear + 1, label: `FY-${startYear}-${String(startYear + 1).slice(2)}` };
  }

  readRows(sql, params = []) {
    return this.database.query(sql, params);
  }

  buildReports(startIso, endIso) {
    const sales = this.readRows("SELECT * FROM sales WHERE created_at >= ? AND created_at < ? ORDER BY created_at", [startIso, endIso]);
    const items = this.readRows("SELECT * FROM sale_items WHERE created_at >= ? AND created_at < ? ORDER BY created_at", [startIso, endIso]);
    const inventory = this.readRows("SELECT sku, barcode, name, stock_qty, mrp, selling_price, purchase_price, gst_rate FROM products ORDER BY name");
    const customers = this.readRows("SELECT id, name, mobile, loyalty_points, credit_balance, created_at FROM customers ORDER BY name");
    const suppliers = this.readRows("SELECT id, name, mobile, gstin, balance, created_at FROM suppliers ORDER BY name");
    const salesSummary = [{
      Bills: sales.length,
      Revenue: sales.reduce((sum, row) => sum + money(row.total), 0),
      GST: sales.reduce((sum, row) => sum + money(row.tax), 0),
      Profit: sales.reduce((sum, row) => sum + money(row.profit), 0),
      Savings: sales.reduce((sum, row) => sum + money(row.savings), 0)
    }];
    const gstSummary = this.readRows("SELECT gst_rate AS GST_Rate, SUM(line_total) AS Taxable_Value, SUM(line_total * gst_rate / 100) AS GST FROM sale_items WHERE created_at >= ? AND created_at < ? GROUP BY gst_rate", [startIso, endIso]);
    return {
      "Yearly Sales Report": sales,
      "Yearly Profit Report": salesSummary,
      "Yearly GST Summary": gstSummary,
      "Yearly Inventory Summary": inventory,
      "Customer Ledger Summary": customers,
      "Supplier Ledger Summary": suppliers,
      "Inventory Snapshot": inventory,
      "Sale Items": items
    };
  }

  async createArchive(date = new Date()) {
    const fy = this.financialYear(date);
    const archiveYearDir = this.ensureArchiveRoot(fy.endYear);
    const startIso = new Date(fy.startYear, 3, 1).toISOString();
    const endIso = new Date(fy.endYear, 3, 1).toISOString();
    const reports = this.buildReports(startIso, endIso);
    const backup = await this.backupService.createBackup({ tier: "Yearly" });
    const settings = this.readRows("SELECT key, value_json, updated_at FROM settings ORDER BY key");
    const zip = new AdmZip();

    for (const [name, rows] of Object.entries(reports)) {
      zip.addFile(`Reports/${name}.csv`, Buffer.from(rowsToCsv(rows)));
      zip.addFile(`Reports/${name}.xls`, Buffer.from(rowsToXlsXml(name, rows)));
      zip.addFile(`Reports/${name}.pdf`, simplePdf(name, rows));
    }
    zip.addLocalFile(backup.path, "SQLite Backup");
    zip.addFile("Settings/settings.json", Buffer.from(JSON.stringify(settings, null, 2)));
    zip.addFile("Archive-Metadata.json", Buffer.from(JSON.stringify({ financialYear: fy, createdAt: new Date().toISOString(), sqliteBackup: backup.path }, null, 2)));
    const zipPath = join(archiveYearDir, `MMSuperMart-${fy.label}.zip`);
    zip.writeZip(zipPath);
    return { ok: true, path: zipPath, financialYear: fy, backupPath: backup.path };
  }
}

module.exports = { YearEndArchiveService };
