import type { AuthType, CredentialStatus, Prisma, Provider } from '@prisma/client';
import { decrypt, encrypt, encryptJson, decryptJson, maskSecret } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

/** Public, secret-free view of a credential for API responses. */
export interface CredentialView {
  provider: Provider;
  authType: AuthType;
  configured: boolean;
  maskedHint: string | null;
  status: CredentialStatus;
  lastTestedAt: Date | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
  updatedAt: Date | null;
}

export async function getCredentialView(userId: string, provider: Provider): Promise<CredentialView | null> {
  const row = await prisma.integrationCredential.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!row) return null;
  return {
    provider: row.provider,
    authType: row.authType,
    configured: Boolean(row.secretEncrypted),
    maskedHint: row.maskedHint,
    status: row.status,
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
    metadata: (row.metadata as Record<string, unknown>) || {},
    updatedAt: row.updatedAt,
  };
}

export async function saveApiKey(
  userId: string,
  provider: Provider,
  apiKey: string,
  opts: { status: CredentialStatus; metadata?: Prisma.InputJsonValue; lastError?: string | null }
) {
  const data = {
    authType: 'API_KEY' as const,
    secretEncrypted: encrypt(apiKey),
    maskedHint: maskSecret(apiKey),
    status: opts.status,
    lastTestedAt: new Date(),
    lastError: opts.lastError ?? null,
    metadata: opts.metadata ?? {},
  };
  await prisma.integrationCredential.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, ...data },
    update: data,
  });
}

export async function getApiKey(userId: string, provider: Provider): Promise<string> {
  const row = await prisma.integrationCredential.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!row || row.authType !== 'API_KEY' || !row.secretEncrypted) {
    throw new AppError('NOT_CONFIGURED', `${label(provider)} is not configured. Add your API key in Settings → Integrations.`, {
      provider,
    });
  }
  return decrypt(row.secretEncrypted);
}

export async function saveOAuthBundle<T>(
  userId: string,
  provider: Provider,
  bundle: T,
  opts: { metadata?: Prisma.InputJsonValue; status?: CredentialStatus; maskedHint?: string | null }
) {
  const data = {
    authType: 'OAUTH' as const,
    secretEncrypted: encryptJson(bundle),
    maskedHint: opts.maskedHint ?? null,
    status: opts.status ?? 'CONNECTED',
    lastTestedAt: new Date(),
    lastError: null,
    ...(opts.metadata !== undefined ? { metadata: opts.metadata } : {}),
  };
  await prisma.integrationCredential.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, ...data, metadata: opts.metadata ?? {} },
    update: data,
  });
}

export async function getOAuthBundle<T>(userId: string, provider: Provider): Promise<T | null> {
  const row = await prisma.integrationCredential.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!row || row.authType !== 'OAUTH' || !row.secretEncrypted) return null;
  try {
    return decryptJson<T>(row.secretEncrypted);
  } catch (err) {
    logger.error('Could not decrypt OAuth bundle', { provider, error: err as Error });
    return null;
  }
}

export async function getAuthType(userId: string, provider: Provider): Promise<AuthType | null> {
  const row = await prisma.integrationCredential.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { authType: true, secretEncrypted: true },
  });
  return row?.secretEncrypted ? row.authType : null;
}

export async function updateCredentialStatus(
  userId: string,
  provider: Provider,
  status: CredentialStatus,
  lastError: string | null,
  metadataPatch?: Record<string, unknown>
) {
  const row = await prisma.integrationCredential.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!row) return;
  const metadata = metadataPatch
    ? ({ ...((row.metadata as Record<string, unknown>) || {}), ...metadataPatch } as Prisma.InputJsonValue)
    : undefined;
  await prisma.integrationCredential.update({
    where: { id: row.id },
    data: { status, lastError, lastTestedAt: new Date(), ...(metadata ? { metadata } : {}) },
  });
}

export async function deleteCredential(userId: string, provider: Provider) {
  await prisma.integrationCredential.deleteMany({ where: { userId, provider } });
}

export function label(provider: Provider): string {
  return provider === 'GEMINI' ? 'Google Gemini' : provider === 'ENRICHO' ? 'Enricho' : 'Google account';
}

// --- Provider call log (no payloads, no secrets) -------------------------------

export async function logProviderCall(params: {
  userId: string;
  provider: Provider;
  operation: string;
  status: string;
  startedAt: number;
  detail?: string;
}) {
  try {
    await prisma.providerCallLog.create({
      data: {
        userId: params.userId,
        provider: params.provider,
        operation: params.operation,
        status: params.status,
        durationMs: Date.now() - params.startedAt,
        detail: params.detail?.slice(0, 500),
      },
    });
  } catch (err) {
    logger.warn('Could not write provider call log', { error: err as Error });
  }
}
