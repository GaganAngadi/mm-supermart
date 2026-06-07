import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const clientDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildDir = join(clientDir, ".next");
const standaloneDir = join(buildDir, "standalone");

function findServerFile(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      const found = findServerFile(fullPath);
      if (found) return found;
    }
    if (entry === "server.js" && existsSync(join(dir, "package.json"))) return fullPath;
  }
  return null;
}

function readPort() {
  const portFlagIndex = process.argv.findIndex((arg) => arg === "-p" || arg === "--port");
  if (portFlagIndex >= 0 && process.argv[portFlagIndex + 1]) return process.argv[portFlagIndex + 1];
  return process.env.PORT ?? "3000";
}

if (!existsSync(standaloneDir)) {
  console.error("Production build not found. Run `npm --workspace client run build` first.");
  process.exit(1);
}

const serverFile = findServerFile(standaloneDir);
if (!serverFile) {
  console.error("Standalone server.js not found inside .next/standalone.");
  process.exit(1);
}

const runtimeDir = resolve(serverFile, "..");
cpSync(join(buildDir, "static"), join(runtimeDir, ".next", "static"), { recursive: true, force: true });
if (existsSync(join(clientDir, "public"))) {
  cpSync(join(clientDir, "public"), join(runtimeDir, "public"), { recursive: true, force: true });
}

const child = spawn(process.execPath, [serverFile], {
  cwd: runtimeDir,
  stdio: "inherit",
  env: { ...process.env, PORT: readPort() }
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
