import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { config } from '../config';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { incrementWindow } from '../lib/redis';

/** Wraps an async handler so rejections reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('VALIDATION', 'Some fields are invalid.', {
      details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

/**
 * Rejects cross-site state-changing requests. Session cookies are SameSite=Lax,
 * and we additionally require a matching Origin (when sent) and a JSON body.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const allowed = new Set([config.appUrl, `http://localhost:${config.port}`]);
    if (!allowed.has(origin)) return next(new AppError('FORBIDDEN', 'Cross-origin request blocked.'));
  }
  const len = parseInt(req.get('content-length') || '0', 10);
  if (len > 0 && !req.is('application/json')) {
    return next(new AppError('VALIDATION', 'Requests must use application/json.'));
  }
  next();
}

export function rateLimit(opts: { name: string; windowSeconds: number; max: number; by?: 'ip' | 'user' }): RequestHandler {
  return (req, res, next) => {
    // Tests register many users from one IP; rate limiting is tested separately.
    if (config.isTest && process.env.TEST_RATE_LIMIT !== '1') return next();
    const who = opts.by === 'user' && req.user ? `u:${req.user.id}` : `ip:${req.ip}`;
    const bucket = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    incrementWindow(`rl:${opts.name}:${who}:${bucket}`, opts.windowSeconds)
      .then((count) => {
        res.setHeader('X-RateLimit-Limit', String(opts.max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, opts.max - count)));
        if (count > opts.max) {
          return next(new AppError('RATE_LIMITED', 'Too many requests. Please slow down and try again shortly.'));
        }
        next();
      })
      .catch(() => next()); // never block traffic because the limiter store is down
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.warn('Request failed', { path: req.path, code: err.code, error: err.message });
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, provider: err.provider, details: err.details },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid input', details: err.issues } });
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Malformed JSON body.' } });
  }
  logger.error('Unhandled error', { path: req.path, method: req.method, error: err as Error });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
}
