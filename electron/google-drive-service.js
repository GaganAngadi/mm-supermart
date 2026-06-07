const { createReadStream } = require("node:fs");
const { basename } = require("node:path");

class GoogleDriveService {
  constructor({ logger, storeId }) {
    this.logger = logger || (() => undefined);
    this.storeId = storeId || process.env.STORE_ID || "mmsupermart";
    this.drive = null;
    this.folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || "";
  }

  async init() {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!serviceAccountJson && (!clientEmail || !privateKey)) return this;

    const { google } = require("googleapis");
    const credentials = serviceAccountJson ? JSON.parse(serviceAccountJson) : { client_email: clientEmail, private_key: privateKey };
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/drive.file"]
    });
    await auth.authorize();
    this.drive = google.drive({ version: "v3", auth });
    if (!this.folderId) this.folderId = await this.ensureFolder();
    return this;
  }

  isConfigured() {
    return Boolean(this.drive);
  }

  async ensureFolder() {
    if (!this.drive) throw new Error("Google Drive is not configured");
    const existing = await this.drive.files.list({
      q: "name='MMSuperMart Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id,name)",
      spaces: "drive"
    });
    const folder = existing.data.files?.[0];
    if (folder?.id) return folder.id;
    const created = await this.drive.files.create({
      requestBody: { name: "MMSuperMart Backups", mimeType: "application/vnd.google-apps.folder" },
      fields: "id"
    });
    return created.data.id;
  }

  async uploadBackup(path, metadata = {}) {
    if (!this.drive) return { ok: false, configured: false, message: "Google Drive backup is not configured" };
    const date = new Date().toISOString().slice(0, 10);
    const name = `${this.storeId}-backup-${date}.db`;
    const response = await this.drive.files.create({
      requestBody: {
        name,
        parents: [this.folderId],
        appProperties: {
          storeId: this.storeId,
          sourceFile: basename(path),
          checksum: metadata.checksum || "",
          verifiedAt: metadata.verifiedAt || ""
        }
      },
      media: {
        mimeType: "application/x-sqlite3",
        body: createReadStream(path)
      },
      fields: "id,name,size,createdTime,modifiedTime"
    });
    return { ok: true, file: response.data };
  }

  async listBackups() {
    if (!this.drive) return { ok: false, configured: false, files: [] };
    const response = await this.drive.files.list({
      q: `'${this.folderId}' in parents and trashed=false`,
      fields: "files(id,name,size,createdTime,modifiedTime,appProperties)",
      orderBy: "modifiedTime desc",
      pageSize: 50
    });
    return { ok: true, configured: true, files: response.data.files || [] };
  }

  async storageUsage() {
    if (!this.drive) return { ok: false, configured: false };
    const response = await this.drive.about.get({ fields: "storageQuota" });
    return { ok: true, configured: true, storageQuota: response.data.storageQuota };
  }
}

module.exports = { GoogleDriveService };
