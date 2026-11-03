import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function getSettings(userId: string) {
  const existing = await prisma.userSettings.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.userSettings.create({ data: { userId } });
}

export async function updateSettings(userId: string, data: Prisma.UserSettingsUpdateInput) {
  await getSettings(userId);
  return prisma.userSettings.update({ where: { userId }, data });
}
