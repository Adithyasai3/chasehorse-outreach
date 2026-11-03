import { Queue, Worker } from 'bullmq';
import { config } from '../config';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getRedis, redisReady } from '../lib/redis';
import { syncReplies } from '../services/email.service';

/*
 * Periodically checks Gmail threads of sent outreach for replies (read-only).
 * Uses a BullMQ repeatable job when Redis is available so only one worker runs it;
 * falls back to an in-process timer otherwise. Nothing here sends email.
 */

const QUEUE = 'reply-sync';

async function syncAllUsers() {
  const users = await prisma.integrationCredential.findMany({
    where: { provider: 'GOOGLE', status: 'CONNECTED' },
    select: { userId: true, metadata: true },
  });
  for (const u of users) {
    const scopes = ((u.metadata as { scopes?: string[] } | null)?.scopes || []) as string[];
    if (!scopes.includes('https://www.googleapis.com/auth/gmail.readonly')) continue;
    try {
      await syncReplies(u.userId);
    } catch (err) {
      logger.warn('Reply sync failed for a user', { error: err as Error });
    }
  }
}

export async function startReplySync() {
  const everyMs = Math.max(1, config.gmailSyncIntervalMinutes) * 60 * 1000;
  const redis = getRedis();
  // Give Redis a moment to connect before choosing a mode.
  await new Promise((r) => setTimeout(r, 1500));
  if (redis && redisReady()) {
    const queue = new Queue(QUEUE, { connection: redis });
    await queue.upsertJobScheduler('reply-sync-every', { every: everyMs }, { name: 'sync', opts: { removeOnComplete: 50, removeOnFail: 50 } });
    new Worker(QUEUE, async () => syncAllUsers(), { connection: redis.duplicate(), concurrency: 1 });
    logger.info('Reply sync scheduled with BullMQ', { everyMinutes: config.gmailSyncIntervalMinutes });
  } else {
    setInterval(() => void syncAllUsers().catch(() => undefined), everyMs).unref();
    logger.warn('Redis unavailable: reply sync running on an in-process timer');
  }
}
