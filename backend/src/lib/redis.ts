import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

let client: Redis | null = null;
let ready = false;

/** Shared Redis connection. Returns null when Redis is unavailable (callers degrade gracefully). */
export function getRedis(): Redis | null {
  if (config.isTest && !process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    client.on('ready', () => {
      ready = true;
      logger.info('Redis connected');
    });
    client.on('end', () => (ready = false));
    client.on('error', (err) => {
      if (ready) logger.warn('Redis error', { error: err.message });
      ready = false;
    });
  }
  return client;
}

export const redisReady = () => ready;

// --- Small cache helpers with in-memory fallback -----------------------------

const memory = new Map<string, { value: string; expires: number }>();

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const json = JSON.stringify(value);
  const redis = getRedis();
  if (redis && ready) {
    await redis.set(key, json, 'EX', ttlSeconds);
    return;
  }
  memory.set(key, { value: json, expires: Date.now() + ttlSeconds * 1000 });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis && ready) {
    const raw = await redis.get(key);
    if (raw) return JSON.parse(raw) as T;
    // fall through: the value may have been written before Redis became ready
  }
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    memory.delete(key);
    return null;
  }
  return JSON.parse(hit.value) as T;
}

/** Fixed-window counter used by the rate limiter. */
export async function incrementWindow(key: string, windowSeconds: number): Promise<number> {
  const redis = getRedis();
  if (redis && ready) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count;
  }
  const now = Date.now();
  const hit = memory.get(key);
  if (!hit || hit.expires < now) {
    memory.set(key, { value: '1', expires: now + windowSeconds * 1000 });
    return 1;
  }
  const next = parseInt(hit.value, 10) + 1;
  hit.value = String(next);
  return next;
}
