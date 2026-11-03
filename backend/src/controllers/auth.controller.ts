import type { Request, Response } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { clearSession, currentUser, issueSession } from '../middleware/auth';
import { parse } from '../middleware/common';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z.string().min(10, 'Use at least 10 characters').max(200);

const registerSchema = z.object({ name: z.string().trim().min(1, 'Enter your name').max(100), email, password });
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

export async function register(req: Request, res: Response) {
  const body = parse(registerSchema, req.body);
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new AppError('CONFLICT', 'An account with this email already exists.');
  const user = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name,
      passwordHash: await hashPassword(body.password),
      settings: { create: { senderName: body.name } },
    },
    select: { id: true, email: true, name: true },
  });
  issueSession(res, user.id);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response) {
  const body = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Same error and similar timing whether the account exists or not.
  const ok = user ? await verifyPassword(body.password, user.passwordHash) : await verifyPassword(body.password, 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !ok) throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect.');
  issueSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
}

export async function logout(_req: Request, res: Response) {
  clearSession(res);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  res.json({ user: currentUser(req) });
}

const profileSchema = z.object({ name: z.string().trim().min(1).max(100) });
export async function updateProfile(req: Request, res: Response) {
  const { id } = currentUser(req);
  const body = parse(profileSchema, req.body);
  const user = await prisma.user.update({ where: { id }, data: { name: body.name }, select: { id: true, email: true, name: true } });
  res.json({ user });
}

const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
export async function changePassword(req: Request, res: Response) {
  const { id } = currentUser(req);
  const body = parse(passwordSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw new AppError('VALIDATION', 'Current password is incorrect.');
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(body.newPassword) } });
  res.json({ ok: true });
}
