const { spawnSync } = require("node:child_process");
const path = require("node:path");

const [binPath, ...args] = process.argv.slice(2);

if (!binPath) {
  console.error("Missing package binary path.");
  process.exit(1);
}

const searchPaths = [
  process.cwd(),
  path.resolve(process.cwd(), "..")
];

let resolved;

try {
  resolved = require.resolve(binPath, { paths: searchPaths });
} catch (error) {
  console.error(`Unable to resolve ${binPath}. Run npm install first.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [resolved, ...args], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false
});

process.exit(result.status ?? 1);
