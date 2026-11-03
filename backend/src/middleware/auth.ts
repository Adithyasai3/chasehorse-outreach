import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface SessionClaims {
  sub: string;
  ver: number;
}

export function issueSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId, ver: 1 } satisfies SessionClaims, config.security.jwtSecret, {
    expiresIn: `${config.security.sessionTtlHours}h`,
    algorithm: 'HS256',
  });
  res.cookie(config.security.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.security.cookieSecure,
    path: '/',
    maxAge: config.security.sessionTtlHours * 3600 * 1000,
  });
}

export function clearSession(res: Response) {
  res.clearCookie(config.security.sessionCookie, { path: '/' });
}

function readToken(req: Request): string | null {
  const cookie = req.cookies?.[config.security.sessionCookie];
  if (typeof cookie === 'string' && cookie) return cookie;
  return null;
}

/** Resolves the session user; rejects with 401 when absent or invalid. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    let claims: SessionClaims;
    try {
      claims = jwt.verify(token, config.security.jwtSecret, { algorithms: ['HS256'] }) as unknown as SessionClaims;
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    }
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new AppError('UNAUTHENTICATED', 'Account no longer exists.');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Typed accessor for handlers mounted behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
  return req.user;
}
