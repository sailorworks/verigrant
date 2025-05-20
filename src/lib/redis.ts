// src/lib/redis.ts
import { Redis } from "@upstash/redis";
import { logger } from "./logger"; // Adjust path

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      logger.error(
        "Redis KV_REST_API_URL or KV_REST_API_TOKEN environment variables are not set."
      );
      throw new Error("Redis configuration missing.");
    }
    redisClient = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return redisClient;
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    const data = await client.get<T>(key); // Specify type for .get()
    return data; // .get() already returns T | null
  } catch (error) {
    logger.warn({ err: error, key }, "[upstash] Redis cache get error");
    return null;
  }
}

export async function setCachedData(
  key: string,
  data: unknown,
  ttlSeconds = 3600 * 24 * 14
): Promise<void> {
  // 2 weeks TTL
  try {
    const client = getRedisClient();
    await client.set(key, data, { ex: ttlSeconds });
  } catch (error) {
    logger.warn({ err: error, key }, "[upstash] Redis cache set error");
  }
}
