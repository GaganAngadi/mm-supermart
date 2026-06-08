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
  if (binPath.includes("/")) {
    resolved = require.resolve(binPath, { paths: searchPaths });
  } else {
    const packageJsonPath = require.resolve(`${binPath}/package.json`, { paths: searchPaths });
    const packageJson = require(packageJsonPath);
    const bin = typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.[binPath] ?? Object.values(packageJson.bin ?? {})[0];

    if (!bin) {
      throw new Error(`Package ${binPath} does not define a bin entry.`);
    }

    resolved = path.resolve(path.dirname(packageJsonPath), bin);
  }
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
