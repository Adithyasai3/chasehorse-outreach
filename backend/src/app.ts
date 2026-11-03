import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppError } from './lib/errors';
import { csrfGuard, errorHandler } from './middleware/common';
import routes from './routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // The frontend proxies /api to us, so trust one proxy hop for req.ip.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use('/api', csrfGuard, routes);
  app.use((_req, _res, next) => next(new AppError('NOT_FOUND', 'Route not found')));
  app.use(errorHandler);
  return app;
}
