import express from 'express';
import cors from 'cors';
import { config } from './config';
import routes from './routes';
import { scheduleGmailSyncJob } from './lib/queue';

const app = express();

// Middleware
app.use(
  cors({
    origin: '*', // Allow frontend development requests
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount API routes
app.use('/api', routes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    stack: config.env === 'development' ? err.stack : undefined,
  });
});

const PORT = config.port;

app.listen(PORT, () => {
  console.log('================================================================');
  console.log(`🚀 ChaseHorse AI Outreach Platform API running on port ${PORT}`);
  console.log(`   Frontend expected at: ${config.frontendUrl}`);
  console.log(`   Environment: ${config.env}`);
  console.log('================================================================');

  // Schedule periodic background synchronization
  const intervalMs = config.gmail.syncIntervalMinutes * 60 * 1000;
  setInterval(() => {
    scheduleGmailSyncJob().catch((err) => console.warn('Periodic sync notice:', err));
  }, intervalMs);
});

export default app;
