import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required for database backup.");
  process.exit(1);
}

const backupType = process.argv[2] || "daily";
if (!["daily", "weekly", "monthly"].includes(backupType)) {
  console.error("Backup type must be daily, weekly, or monthly.");
  process.exit(1);
}

const url = new URL(databaseUrl);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = join(root, "backups", backupType);
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

const dbName = url.pathname.replace(/^\//, "");
const host = url.hostname;
const port = url.port;
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const isPostgres = url.protocol.startsWith("postgres");
const isMysql = url.protocol.startsWith("mysql");
const extension = isPostgres ? "sql" : "sql";
const outputPath = join(backupDir, `${dbName}-${timestamp}.${extension}`);

let command;
let args;
let env = { ...process.env };

if (isPostgres) {
  command = "pg_dump";
  args = ["--host", host, "--username", user, "--dbname", dbName, "--file", outputPath, "--format", "plain"];
  if (port) args.splice(2, 0, "--port", port);
  env.PGPASSWORD = password;
} else if (isMysql) {
  command = "mysqldump";
  args = [`--host=${host}`, `--user=${user}`, `--result-file=${outputPath}`, dbName];
  if (port) args.splice(1, 0, `--port=${port}`);
  if (password) env.MYSQL_PWD = password;
} else {
  console.error(`Unsupported database protocol: ${url.protocol}`);
  process.exit(1);
}

const result = spawnSync(command, args, { env, stdio: "inherit" });
if (result.status !== 0) {
  console.error(`Backup failed. Ensure ${command} is installed and available in PATH.`);
  process.exit(result.status ?? 1);
}

console.log(`Backup created: ${outputPath}`);
