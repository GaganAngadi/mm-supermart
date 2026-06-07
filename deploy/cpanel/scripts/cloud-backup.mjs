import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { google } from "googleapis";

const backupDir = path.resolve(process.env.CLOUD_BACKUP_DIR || "./backups/postgres");
const retentionDays = Number(process.env.CLOUD_BACKUP_RETENTION_DAYS || 90);

function timestamp() {
  return new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
}

async function fileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function runPgDump(outputFile) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL backup.");
  await fs.mkdir(backupDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", process.env.DATABASE_URL, "--file", outputFile], {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => stderr += chunk.toString());
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `pg_dump failed with exit code ${code}`));
    });
  });
}

async function uploadToGoogleDrive(filePath, fileName) {
  if (process.env.GOOGLE_DRIVE_ENABLED !== "true") return null;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) {
    throw new Error("Google Drive backup enabled but credentials or folder id are missing.");
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"]
  });
  const drive = google.drive({ version: "v3", auth });
  const result = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID]
    },
    media: {
      mimeType: "application/octet-stream",
      body: createReadStream(filePath)
    },
    fields: "id,name,size"
  });
  return result.data;
}

async function pruneOldBackups() {
  const files = await fs.readdir(backupDir).catch(() => []);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const file of files) {
    if (!file.endsWith(".dump")) continue;
    const fullPath = path.join(backupDir, file);
    const stat = await fs.stat(fullPath);
    if (stat.mtimeMs < cutoff) await fs.unlink(fullPath);
  }
}

async function main() {
  const storeId = process.env.STORE_ID || "mmsupermart";
  const fileName = `${storeId}-postgres-backup-${timestamp()}.dump`;
  const outputFile = path.join(backupDir, fileName);

  await runPgDump(outputFile);
  const stat = await fs.stat(outputFile);
  if (stat.size < 1024) throw new Error("Backup verification failed: backup file is too small.");
  const checksum = await fileSha256(outputFile);
  const driveFile = await uploadToGoogleDrive(outputFile, fileName);
  await pruneOldBackups();

  console.log(JSON.stringify({
    ok: true,
    file: outputFile,
    sizeBytes: stat.size,
    checksumSha256: checksum,
    googleDriveFileId: driveFile?.id || null
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
