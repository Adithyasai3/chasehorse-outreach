import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Query logging is intentionally off: parameters can contain personal data.
export const prisma = global.__prisma || new PrismaClient({ log: ['error'] });

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;
