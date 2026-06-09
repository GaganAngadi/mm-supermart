import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const clientDir = join(root, "client");
const outDir = join(clientDir, "out");
const hostingDir = join(root, "dist-hosting");
const artifact = join(hostingDir, "mm-supermart-frontend.tar.gz");

function run(command, args, options = {}) {
  const useShell = process.platform === "win32" && command === "npm";
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "https://api.mmsupermart.in/api",
      NEXT_PRIVATE_BUILD_WORKER: process.env.NEXT_PRIVATE_BUILD_WORKER ?? "1"
    },
    shell: useShell,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

mkdirSync(hostingDir, { recursive: true });
if (existsSync(artifact)) {
  rmSync(artifact, { force: true });
}

run("npm", ["--workspace", "client", "run", "build"]);
run("tar", ["-czf", artifact, "-C", outDir, "."]);

console.log(`\nCreated ${artifact}`);
