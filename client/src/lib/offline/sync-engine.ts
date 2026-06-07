"use client";

import { API_BASE_URL } from "@/lib/api";
import { createOfflineId, nowIso, offlineDb, type OfflineSyncQueueItem, type SyncEntity, type SyncOperation } from "@/lib/offline/offline-db";

const maxAttempts = 8;

function backoffDelayMs(attempts: number) {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
}

function authHeaders(idempotencyKey: string) {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("auth-token") : "";
  return {
    "Content-Type": "application/json",
    "X-Idempotency-Key": idempotencyKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function enqueueOfflineSync(input: {
  entity: SyncEntity;
  operation: SyncOperation;
  endpoint: string;
  method?: OfflineSyncQueueItem["method"];
  payload: unknown;
  idempotencyKey?: string;
}) {
  const timestamp = nowIso();
  const idempotencyKey = input.idempotencyKey ?? createOfflineId(`${input.entity}-${input.operation}`);
  const existing = await offlineDb.syncQueue.where("idempotencyKey").equals(idempotencyKey).first();
  if (existing) return existing;

  const item: OfflineSyncQueueItem = {
    id: createOfflineId("sync"),
    entity: input.entity,
    operation: input.operation,
    endpoint: input.endpoint,
    method: input.method ?? "POST",
    payload: input.payload,
    idempotencyKey,
    status: "pending",
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await offlineDb.syncQueue.put(item);
  await offlineDb.syncLogs.put({
    id: createOfflineId("log"),
    queueId: item.id,
    entity: item.entity,
    operation: item.operation,
    status: "pending",
    message: "Queued for cloud sync",
    createdAt: timestamp
  });
  return item;
}

export async function processOfflineSyncQueue() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { processed: 0, failed: 0, skipped: true };

  const now = nowIso();
  const dueItems = await offlineDb.syncQueue
    .where("status")
    .anyOf(["pending", "failed"])
    .filter((item) => !item.nextRetryAt || item.nextRetryAt <= now)
    .limit(25)
    .toArray();

  let processed = 0;
  let failed = 0;

  for (const item of dueItems) {
    const startedAt = nowIso();
    await offlineDb.syncQueue.update(item.id, { status: "syncing", updatedAt: startedAt });

    try {
      const response = await fetch(`${API_BASE_URL}${item.endpoint}`, {
        method: item.method,
        headers: authHeaders(item.idempotencyKey),
        body: item.method === "DELETE" ? undefined : JSON.stringify(item.payload)
      });

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseBody.message ?? `Sync failed with HTTP ${response.status}`);

      const syncedAt = nowIso();
      await offlineDb.syncQueue.update(item.id, { status: "synced", syncedAt, updatedAt: syncedAt, lastError: undefined, nextRetryAt: undefined });
      await offlineDb.syncLogs.put({
        id: createOfflineId("log"),
        queueId: item.id,
        entity: item.entity,
        operation: item.operation,
        status: "synced",
        message: "Synced to cloud",
        createdAt: syncedAt
      });
      processed += 1;
    } catch (error) {
      const attempts = item.attempts + 1;
      const retryAt = new Date(Date.now() + backoffDelayMs(attempts)).toISOString();
      const status = attempts >= maxAttempts ? "failed" : "pending";
      const message = error instanceof Error ? error.message : "Unknown sync error";
      await offlineDb.syncQueue.update(item.id, {
        attempts,
        status,
        lastError: message,
        nextRetryAt: status === "pending" ? retryAt : undefined,
        updatedAt: nowIso()
      });
      await offlineDb.syncLogs.put({
        id: createOfflineId("log"),
        queueId: item.id,
        entity: item.entity,
        operation: item.operation,
        status: "failed",
        message,
        createdAt: nowIso()
      });
      failed += 1;
    }
  }

  return { processed, failed, skipped: false };
}

export async function getOfflineSyncSummary() {
  const [pending, failed, synced, logs] = await Promise.all([
    offlineDb.syncQueue.where("status").equals("pending").count(),
    offlineDb.syncQueue.where("status").equals("failed").count(),
    offlineDb.syncQueue.where("status").equals("synced").count(),
    offlineDb.syncLogs.orderBy("createdAt").reverse().limit(20).toArray()
  ]);

  return { pending, failed, synced, logs };
}
