import { createClient } from "redis";
let client = null;
let connecting = null;
async function getClient() {
    if (!process.env.REDIS_URL)
        return null;
    if (client?.isOpen)
        return client;
    if (connecting)
        return connecting;
    connecting = (async () => {
        try {
            const redis = createClient({ url: process.env.REDIS_URL });
            redis.on("error", (error) => {
                console.warn("Redis cache unavailable:", error.message);
            });
            await redis.connect();
            client = redis;
            return client;
        }
        catch (error) {
            console.warn("Redis cache disabled:", error instanceof Error ? error.message : error);
            client = null;
            return null;
        }
        finally {
            connecting = null;
        }
    })();
    return connecting;
}
export async function getCachedJson(key) {
    const redis = await getClient();
    if (!redis)
        return null;
    try {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
    }
    catch {
        return null;
    }
}
export async function setCachedJson(key, value, ttlSeconds = 60) {
    const redis = await getClient();
    if (!redis)
        return;
    try {
        await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
    }
    catch {
        // Cache failures must never block POS API responses.
    }
}
