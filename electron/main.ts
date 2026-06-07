import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const isDev = !app.isPackaged;
const appRoot = isDev ? resolve(__dirname, "..") : process.resourcesPath;
const preloadPath = join(__dirname, "preload.js");
const appUrl = "http://localhost:3000/login";
const apiUrl = "http://localhost:4000/api/health";
let apiProcess: ChildProcessWithoutNullStreams | null = null;
let webProcess: ChildProcessWithoutNullStreams | null = null;

function spawnProcess(command: string, args: string[], cwd: string) {
  const child = spawn(command, args, {
    cwd,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: args.includes("server.js") ? "3000" : process.env.PORT
    }
  });
  child.stdout.on("data", (data) => console.log(String(data)));
  child.stderr.on("data", (data) => console.error(String(data)));
  return child;
}

function startLocalServices() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const serverEntry = join(appRoot, "server", "dist", "server.js");
  const clientStart = join(appRoot, "client", "scripts", "start-standalone.mjs");

  if (existsSync(serverEntry)) {
    apiProcess = spawnProcess(process.execPath, [serverEntry], appRoot);
  } else {
    apiProcess = spawnProcess(npmCommand, ["--workspace", "server", "run", "start"], appRoot);
  }

  if (existsSync(clientStart)) {
    webProcess = spawnProcess(process.execPath, [clientStart, "-p", "3000"], appRoot);
  } else {
    webProcess = spawnProcess(npmCommand, ["--workspace", "client", "run", "start", "--", "-p", "3000"], appRoot);
  }
}

async function waitForServer(url: string, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Keep waiting while local services start.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return false;
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    title: "M&M POS",
    show: false,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await waitForServer(apiUrl);
  await waitForServer(appUrl);
  await window.loadURL(appUrl);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  startLocalServices();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  apiProcess?.kill();
  webProcess?.kill();
});

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("print:receipt", async () => {
  BrowserWindow.getFocusedWindow()?.webContents.print({ silent: false, printBackground: true });
  return { ok: true };
});
ipcMain.handle("backup:now", () => ({ ok: false, message: "Use Settings backup controls inside M&M POS." }));
