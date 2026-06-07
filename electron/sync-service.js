const defaultIntervalMs = 60_000;

function groupByEntity(items) {
  return items.reduce((groups, item) => {
    const key = String(item.entity_type || "unknown");
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function parseQueueItem(item) {
  return {
    id: item.id,
    entityType: item.entity_type,
    entityId: item.entity_id,
    action: item.action,
    payload: JSON.parse(item.payload_json)
  };
}

class SyncService {
  constructor({ database, baseUrl, token, logger }) {
    this.database = database;
    this.baseUrl = (baseUrl || "http://localhost:4000/api").replace(/\/$/, "");
    this.token = token || "";
    this.logger = logger || (() => undefined);
    this.timer = null;
    this.running = false;
  }

  start(intervalMs = defaultIntervalMs) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
    void this.runOnce();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async hasInternet() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(`${this.baseUrl}/sync/status`, { signal: controller.signal });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  headers() {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { "X-Sync-Token": this.token, Authorization: `Bearer ${this.token}` } : {})
    };
  }

  async runOnce() {
    if (this.running) return { ok: false, skipped: "already_running" };
    this.running = true;
    try {
      if (!(await this.hasInternet())) return { ok: false, skipped: "offline" };
      const queue = this.database.getSyncQueue(100);
      if (!queue.length) return { ok: true, processed: 0 };

      for (const item of queue) this.database.markSyncStatus(item.id, "processing");
      const grouped = groupByEntity(queue);
      let processed = 0;

      for (const [entityType, items] of Object.entries(grouped)) {
        try {
          const payloadItems = items.map(parseQueueItem);
          const response = await fetch(`${this.baseUrl}/sync/bulk`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ entityType, items: payloadItems })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.message || `Cloud sync failed for ${entityType}`);

          const completedIds = new Set((body.completedIds || payloadItems.map((item) => item.id)).map(String));
          for (const item of items) {
            if (completedIds.has(String(item.id))) {
              this.database.markSyncStatus(item.id, "completed");
              processed += 1;
            } else {
              this.database.markSyncStatus(item.id, "failed", "Cloud did not confirm this queue item");
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown sync error";
          for (const item of items) this.database.markSyncStatus(item.id, "failed", message);
          this.logger(`sync failed for ${entityType}: ${message}`);
        }
      }

      await this.pullProducts();
      return { ok: true, processed };
    } finally {
      this.running = false;
    }
  }

  async pullProducts() {
    try {
      const response = await fetch(`${this.baseUrl}/products?take=100`, { headers: this.headers() });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      const products = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
      this.database.upsertCloudProducts(products);
    } catch (error) {
      this.logger(`product pull skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

module.exports = { SyncService };
