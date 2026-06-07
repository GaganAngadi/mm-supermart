const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const { fork } = require("node:child_process");
const { appendFileSync, createReadStream, existsSync, mkdirSync, statSync } = require("node:fs");
const { createServer } = require("node:http");
const { join, resolve } = require("node:path");
const { LocalDatabase } = require("./local-database.js");
const { SyncService } = require("./sync-service.js");
const { BackupService } = require("./backup-service.js");
const { GoogleDriveService } = require("./google-drive-service.js");
const { RecoveryService } = require("./recovery-service.js");
const { YearEndArchiveService } = require("./year-end-archive-service.js");

const APP_URL = "http://localhost:3000/login";

let apiProcess = null;
let webServer = null;
let splashWindow = null;
let mainWindow = null;
let bootLogPath = null;
let localDatabase = null;
let syncService = null;
let backupService = null;
let googleDriveService = null;
let recoveryService = null;
let yearEndArchiveService = null;
let backupTimer = null;

function logBoot(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  if (bootLogPath) {
    try {
      appendFileSync(bootLogPath, `${line}\n`);
    } catch {
      // Logging must never block POS startup.
    }
  }
}

function appRoot() {
  return app.isPackaged ? app.getAppPath() : resolve(__dirname, "..");
}

function ensureBackupFolder() {
  const backupDir = "C:\\MMSuperMart\\Backups";
  try {
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    return backupDir;
  } catch {
    const fallback = join(app.getPath("userData"), "Backups");
    if (!existsSync(fallback)) mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function prepareRuntimeFolders() {
  const userData = app.getPath("userData");
  if (!existsSync(userData)) mkdirSync(userData, { recursive: true });
  bootLogPath = join(userData, "boot.log");
  logBoot("desktop process started");
  ensureBackupFolder();
}

async function prepareLocalDatabase() {
  localDatabase = await new LocalDatabase({ userDataPath: app.getPath("userData") }).init();
  backupService = await new BackupService({ database: localDatabase, userDataPath: app.getPath("userData"), logger: logBoot }).init();
  googleDriveService = await new GoogleDriveService({ logger: logBoot, storeId: process.env.STORE_ID || "mmsupermart" }).init();
  yearEndArchiveService = new YearEndArchiveService({ database: localDatabase, backupService, userDataPath: app.getPath("userData"), logger: logBoot });
  logBoot("local sqlite database ready");
}

function startSyncService() {
  syncService = new SyncService({
    database: localDatabase,
    baseUrl: process.env.CLOUD_SYNC_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
    token: process.env.CLOUD_SYNC_TOKEN || "",
    logger: logBoot
  });
  syncService.start(60_000);
  recoveryService = new RecoveryService({ database: localDatabase, backupService, googleDriveService, syncService, logger: logBoot });
  logBoot("background sync service started");
}

function scheduleDailyBackup() {
  const run = async () => {
    try {
      const result = await backupService?.createBackup();
      if (result?.ok) {
        logBoot(`daily backup created ${result.path}`);
        const upload = await googleDriveService?.uploadBackup(result.path, result);
        if (upload?.ok) logBoot(`daily backup uploaded ${upload.file?.name || upload.file?.id}`);
      }
      const now = new Date();
      if (now.getMonth() === 2 && now.getDate() === 31) {
        const archive = await yearEndArchiveService?.createArchive(now);
        if (archive?.ok) logBoot(`year-end archive created ${archive.path}`);
      }
    } catch (error) {
      logBoot(`daily backup failed ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      scheduleDailyBackup();
    }
  };
  if (backupTimer) clearTimeout(backupTimer);
  const now = new Date();
  const next = new Date(now);
  next.setHours(22, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  backupTimer = setTimeout(run, next.getTime() - now.getTime());
}

function forkNodeScript(script, args = [], env = {}) {
  return fork(script, args, {
    cwd: appRoot(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      ...env
    },
    stdio: "pipe"
  });
}

function attachLogs(name, child) {
  child.stdout?.on("data", (data) => logBoot(`[${name}] ${String(data).trim()}`));
  child.stderr?.on("data", (data) => logBoot(`[${name}] ${String(data).trim()}`));
  child.on("exit", (code) => logBoot(`[${name}] exited ${code}`));
}

function startBackend() {
  logBoot("starting backend");
  const root = appRoot();
  const bundledServerEntry = join(root, "server", "dist-electron", "server.mjs");
  const serverEntry = existsSync(bundledServerEntry) ? bundledServerEntry : join(root, "server", "dist", "server.js");
  if (!existsSync(serverEntry)) throw new Error("Backend build missing. Run npm run build first.");

  apiProcess = forkNodeScript(serverEntry, [], {
    PORT: "4000",
    DATABASE_URL: process.env.DATABASE_URL || "mysql://mm_user:mm_password@127.0.0.1:3306/mm_supermart"
  });
  attachLogs("api", apiProcess);
  logBoot("backend process spawned");
}

function startFrontend() {
  logBoot("starting frontend");
  const root = appRoot();
  const appDir = join(root, "client", ".next", "server", "app");
  const staticDir = join(root, "client", ".next", "static");
  const publicDir = join(root, "client", "public");
  if (!existsSync(join(appDir, "login.html"))) throw new Error("Next.js static pages missing. Run npm run build first.");

  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp"
  };

  const sendFile = (res, filePath) => {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = require("node:path").extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable"
    });
    createReadStream(filePath).pipe(res);
  };

  webServer = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost:3000");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/_next/static/")) {
      return sendFile(res, join(staticDir, pathname.replace("/_next/static/", "")));
    }

    const publicPath = join(publicDir, pathname.replace(/^\/+/, ""));
    if (pathname !== "/" && existsSync(publicPath)) return sendFile(res, publicPath);

    const routeName = pathname === "/" ? "index" : pathname.replace(/^\/+/, "").replace(/\/$/, "");
    const htmlPath = join(appDir, `${routeName || "index"}.html`);
    return sendFile(res, existsSync(htmlPath) ? htmlPath : join(appDir, "index.html"));
  });

  webServer.listen(3000, "127.0.0.1", () => logBoot("frontend static server ready"));
}

async function waitFor(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        logBoot(`ready ${url}`);
        return true;
      }
    } catch {
      // Local service is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return false;
}

function createSplashWindow() {
  logBoot("creating splash");
  splashWindow = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: "#047857",
    show: true
  });

  const logoPath = join(appRoot(), "client", "public", "mm-logo-icon.png").replace(/\\/g, "/");
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#047857;font-family:Segoe UI,Arial;color:white">
        <main style="text-align:center">
          <img src="file:///${logoPath}" style="width:96px;height:96px;object-fit:contain;background:white;border-radius:12px;padding:8px" />
          <h1 style="font-size:28px;margin:18px 0 6px">M&M POS</h1>
          <p style="margin:0;opacity:.85">Starting billing system...</p>
        </main>
      </body>
    </html>
  `)}`);
}

function escapePrintHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatLabelPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

const qrLabelPrintCss = `
  @page { size: 50mm 25mm; margin: 0; }
  html, body {
    width: 50mm;
    height: 25mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
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
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
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

const barcodeLabelPrintCss = `
  @page { size: 50mm 25mm; margin: 0; }
  html, body {
    width: 50mm;
    height: 25mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #fff;
  }
  .thermal-barcode-label {
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
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .thermal-label-inner {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 25mm;
    height: 50mm;
    display: grid;
    grid-template-rows: 5.5mm 39mm 3.8mm;
    justify-items: center;
    align-items: center;
    padding: 0.8mm 1.2mm;
    overflow: hidden;
    box-sizing: border-box;
    transform: translate(-50%, -50%) rotate(90deg);
    transform-origin: center;
  }
  .thermal-product-name {
    width: 22.6mm;
    height: 5.5mm;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    text-align: center;
    font-size: 5.6pt;
    font-weight: 800;
    line-height: 1.02;
    overflow-wrap: anywhere;
  }
  .thermal-barcode-block {
    width: 22.6mm;
    height: 39mm;
    display: flex;
    flex-direction: column;
    gap: 0;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .thermal-barcode-slot, .thermal-barcode {
    width: 22.6mm;
    height: 36mm;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thermal-barcode svg {
    width: 22.6mm;
    height: 36mm;
    display: block;
    fill: #000;
    shape-rendering: crispEdges;
  }
  .thermal-barcode-number {
    width: 22.6mm;
    height: 2.5mm;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    text-align: center;
    text-overflow: ellipsis;
    font-family: "Courier New", monospace;
    font-size: 5.2pt;
    font-weight: 900;
    line-height: 1;
  }
  .thermal-price {
    width: 22.6mm;
    height: 3.8mm;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: right;
    font-size: 6.4pt;
    font-weight: 900;
    line-height: 1;
  }
`;

function buildSingleQrLabelHtml(item) {
  const codeValue = item.valueMode === "sku" ? item.sku : item.barcode;
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>M&M SuperMart QR Label</title>
        <style>${qrLabelPrintCss}</style>
      </head>
      <body>
        <section class="qr-barcode-label">
          <div class="qr-label-inner">
            <div class="qr-product-name">${escapePrintHtml(item.name)}</div>
            <div class="qr-code-slot">${String(item.qrSvg || "")}</div>
            <div class="qr-code-value">${escapePrintHtml(codeValue)}</div>
            <div class="qr-price">Price: ${escapePrintHtml(formatLabelPrice(item.price))}</div>
          </div>
        </section>
      </body>
    </html>`;
}

function buildSingleBarcodeLabelHtml(item) {
  const codeValue = item.valueMode === "sku" ? item.sku : item.barcode;
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>M&M SuperMart Barcode Label</title>
        <style>${barcodeLabelPrintCss}</style>
      </head>
      <body>
        <section class="thermal-barcode-label">
          <div class="thermal-label-inner">
            <div class="thermal-product-name">${escapePrintHtml(item.name)}</div>
            <div class="thermal-barcode-block">
              <div class="thermal-barcode-slot">
                <div class="thermal-barcode">${String(item.barcodeSvg || "")}</div>
              </div>
              <div class="thermal-barcode-number">${escapePrintHtml(codeValue)}</div>
            </div>
            <div class="thermal-price">Price: ${escapePrintHtml(formatLabelPrice(item.price))}</div>
          </div>
        </section>
      </body>
    </html>`;
}

function normalizePrinter(printer) {
  return {
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: Boolean(printer.isDefault),
    status: String(printer.status ?? "")
  };
}

async function listDesktopPrinters() {
  const sourceWindow = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!sourceWindow) return [];
  const printers = await sourceWindow.webContents.getPrintersAsync();
  return printers.map(normalizePrinter);
}

function chooseQrLabelPrinter(printers, requestedName) {
  const requested = String(requestedName || "").toLowerCase();
  const tvs = printers.find((printer) => printer.name.toLowerCase().includes("tvs lp46 dlite") || String(printer.displayName || "").toLowerCase().includes("tvs lp46 dlite"));
  if (requested) {
    return printers.find((printer) => printer.name.toLowerCase() === requested || String(printer.displayName || "").toLowerCase() === requested) || tvs || printers.find((printer) => printer.isDefault) || printers[0];
  }
  return tvs || printers.find((printer) => printer.isDefault) || printers[0];
}

function validateQrLabelItem(item) {
  if (!item || typeof item !== "object") return null;
  const labelHtml = String(item.labelHtml || "");
  if (item.labelType === "inventory") {
    if (!labelHtml.includes("barcode-label") && !labelHtml.includes("inventory-master-label")) return null;
    return {
      labelType: "inventory",
      labelHtml,
      name: String(item.name || "").trim(),
      sku: String(item.sku || "").trim(),
      barcode: String(item.barcode || "").trim(),
      valueMode: item.valueMode === "sku" ? "sku" : "barcode",
      price: Number(item.price) || 0
    };
  }
  const name = String(item.name || "").trim();
  const sku = String(item.sku || "").trim();
  const barcode = String(item.barcode || "").trim();
  const qrSvg = String(item.qrSvg || "");
  const barcodeSvg = String(item.barcodeSvg || "");
  const labelType = item.labelType === "barcode" ? "barcode" : "qr";
  const valueMode = item.valueMode === "sku" ? "sku" : "barcode";
  const payloadValue = valueMode === "sku" ? sku : barcode;
  if (!name || !payloadValue) return null;
  if (labelType === "qr" && !qrSvg.includes("<svg")) return null;
  if (labelType === "barcode" && !barcodeSvg.includes("<svg")) return null;
  return {
    labelType,
    name,
    sku,
    barcode,
    qrSvg,
    barcodeSvg,
    valueMode,
    price: Number(item.price) || 0
  };
}

async function printOneQrLabel(item, printerName) {
  const printWindow = new BrowserWindow({
    width: 420,
    height: 260,
    show: false,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try {
    const labelHtml = item.labelType === "inventory" ? item.labelHtml : item.labelType === "barcode" ? buildSingleBarcodeLabelHtml(item) : buildSingleQrLabelHtml(item);
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(labelHtml)}`);
    await new Promise((resolvePrint, rejectPrint) => {
      printWindow.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: printerName,
        margins: { marginType: "none" },
        pageSize: { width: 50000, height: 25000 },
        landscape: false,
        scaleFactor: 100
      }, (success, failureReason) => {
        if (success) {
          resolvePrint();
          return;
        }
        rejectPrint(new Error(failureReason || "Label print failed"));
      });
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
}

async function createMainWindow() {
  logBoot("creating main window");
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    title: "M&M POS",
    show: false,
    backgroundColor: "#f8fafc",
    icon: join(appRoot(), "build", "icon.ico"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost:3000")) {
      mainWindow.loadURL(url);
      return { action: "deny" };
    }
    if (url && url !== "about:blank") shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://localhost:3000")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(APP_URL);
  splashWindow?.close();
  mainWindow.show();
  logBoot("main window visible");
}

app.whenReady().then(async () => {
  const bootStartedAt = Date.now();
  Menu.setApplicationMenu(null);
  prepareRuntimeFolders();
  await prepareLocalDatabase();
  scheduleDailyBackup();
  startSyncService();
  createSplashWindow();
  startBackend();
  startFrontend();
  await waitFor(APP_URL);
  await createMainWindow();
  logBoot(`[desktop] ready in ${Date.now() - bootStartedAt}ms`);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backupTimer) clearTimeout(backupTimer);
  try {
    localDatabase?.persist();
  } catch {
    // Shutdown must continue even if a final database flush fails.
  }
  syncService?.stop();
  apiProcess?.kill();
  webServer?.close();
});

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("print:receipt", () => {
  BrowserWindow.getFocusedWindow()?.webContents.print({ silent: false, printBackground: true });
  return { ok: true };
});
ipcMain.handle("database:sale:save", (_event, sale) => localDatabase.saveSale(sale));
ipcMain.handle("database:product:barcode", (_event, barcode) => localDatabase.findProductByBarcode(barcode));
ipcMain.handle("database:products:search", (_event, query) => localDatabase.searchProducts(query));
ipcMain.handle("sync:queue:list", (_event, limit) => localDatabase.getSyncQueue(limit));
ipcMain.handle("sync:queue:status", (_event, input) => localDatabase.markSyncStatus(input.id, input.status, input.error));
ipcMain.handle("sync:summary", () => localDatabase.getSyncSummary());
ipcMain.handle("sync:run", () => syncService.runOnce());
ipcMain.handle("backup:now", async () => {
  const backup = await backupService.createBackup();
  const upload = await googleDriveService.uploadBackup(backup.path, backup).catch((error) => ({ ok: false, message: error.message }));
  return { ...backup, googleDrive: upload };
});
ipcMain.handle("backup:list", () => backupService.listBackups());
ipcMain.handle("backup:verify", (_event, backupPath) => backupService.validateBackup(backupPath));
ipcMain.handle("backup:delete", (_event, backupPath) => backupService.deleteBackup(backupPath));
ipcMain.handle("backup:restore", (_event, backupPath) => recoveryService.validateAndRestoreLocalBackup(backupPath));
ipcMain.handle("backup:export", (_event, backupPath, targetPath) => backupService.exportBackup(backupPath, targetPath));
ipcMain.handle("drive:upload-backup", async (_event, backupPath) => {
  const validation = await backupService.validateBackup(backupPath);
  if (!validation.ok) return validation;
  return googleDriveService.uploadBackup(backupPath, validation);
});
ipcMain.handle("drive:list-backups", () => googleDriveService.listBackups());
ipcMain.handle("drive:storage", () => googleDriveService.storageUsage());
ipcMain.handle("recovery:status", () => recoveryService.getRecoveryStatus());
ipcMain.handle("recovery:cloud-rebuild", () => recoveryService.rebuildFromCloud());
ipcMain.handle("archive:create-year-end", () => yearEndArchiveService.createArchive());
ipcMain.handle("printer:receipt", () => {
  BrowserWindow.getFocusedWindow()?.webContents.print({ silent: false, printBackground: true, margins: { marginType: "none" } });
  return { ok: true };
});
ipcMain.handle("printer:open-settings", async () => {
  await shell.openExternal("ms-settings:printers");
  return { ok: true };
});
ipcMain.handle("printer:list", async () => {
  const printers = await listDesktopPrinters();
  return printers.sort((a, b) => {
    const aScore = a.name.toLowerCase().includes("tvs lp46 dlite") ? -2 : a.isDefault ? -1 : 0;
    const bScore = b.name.toLowerCase().includes("tvs lp46 dlite") ? -2 : b.isDefault ? -1 : 0;
    return aScore - bScore || a.name.localeCompare(b.name);
  });
});
ipcMain.handle("printer:qr-labels", async (_event, payload) => {
  const requestedItems = Array.isArray(payload?.items) ? payload.items : [];
  const items = requestedItems.map(validateQrLabelItem).filter(Boolean);
  if (!items.length) return { ok: false, message: "No valid QR labels to print." };

  const printers = await listDesktopPrinters();
  const selectedPrinter = chooseQrLabelPrinter(printers, payload?.printerName);
  if (!selectedPrinter) return { ok: false, message: "No installed Windows printer found." };

  for (const item of items) {
    await printOneQrLabel(item, selectedPrinter.name);
  }

  return {
    ok: true,
    printed: items.length,
    printerName: selectedPrinter.name,
    calibration: {
      pageWidthMm: 50,
      pageHeightMm: 25,
      gapMm: 2,
      marginMm: 0,
      paddingMm: 0,
      dpi: 203,
      method: "Direct Thermal",
      gapDetection: true
    }
  };
});
