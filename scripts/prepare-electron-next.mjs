import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const nextRoot = join(root, "client", ".next");
const standaloneRoot = join(nextRoot, "standalone");

const staticSource = join(nextRoot, "static");
const staticTarget = join(standaloneRoot, ".next", "static");
const publicSource = join(root, "client", "public");
const publicTarget = join(standaloneRoot, "public");

if (existsSync(staticSource)) {
  mkdirSync(join(standaloneRoot, ".next"), { recursive: true });
  cpSync(staticSource, staticTarget, { recursive: true, force: true });
}

if (existsSync(publicSource)) {
  cpSync(publicSource, publicTarget, { recursive: true, force: true });
}

console.log("Prepared Next.js standalone assets for Electron.");
