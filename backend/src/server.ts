import { createApp } from './app';
import { config, googleConfigured } from './config';
import { startReplySync } from './jobs/replySync';
import { logger } from './lib/logger';
import { getRedis } from './lib/redis';

const app = createApp();
getRedis();

app.listen(config.port, () => {
  logger.info('ChaseHorse Outreach API listening', {
    port: config.port,
    env: config.env,
    appUrl: config.appUrl,
    googleOAuth: googleConfigured() ? 'configured' : 'not configured',
  });
  startReplySync().catch((err) => logger.error('Could not start reply sync', { error: err as Error }));
});
