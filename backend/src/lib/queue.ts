import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config';
import { syncGmailReplies } from './gmail';

let redisClient: Redis | null = null;
let syncQueue: Queue | null = null;
let isRedisAvailable = false;

try {
  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 2) {
        console.warn('⚠️ Redis not reachable. Background workers running in in-process fallback mode.');
        return null; // Stop retrying Redis
      }
      return 1000;
    },
  });

  redisClient.on('connect', () => {
    isRedisAvailable = true;
    console.log('✅ Connected to Redis successfully.');
  });

  redisClient.on('error', (err) => {
    isRedisAvailable = false;
    // Suppress spammy log
  });

  syncQueue = new Queue('chasehorse-sync-queue', { connection: redisClient as any });

  new Worker(
    'chasehorse-sync-queue',
    async (job: Job) => {
      if (job.name === 'sync-gmail-replies') {
        return await syncGmailReplies();
      }
    },
    { connection: redisClient as any }
  );
} catch (e) {
  console.warn('Could not initialize BullMQ Redis queue. In-memory queue fallback activated.');
}

/**
 * Schedule or immediately trigger background Gmail reply synchronization
 */
export async function scheduleGmailSyncJob() {
  if (isRedisAvailable && syncQueue) {
    await syncQueue.add('sync-gmail-replies', {}, { removeOnComplete: true });
  } else {
    // In-memory fallback
    setTimeout(async () => {
      try {
        await syncGmailReplies();
      } catch (err) {
        console.warn('In-memory Gmail sync job completed with notice:', err);
      }
    }, 100);
  }
}
