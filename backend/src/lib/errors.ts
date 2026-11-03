export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED' // integration not set up by this user
  | 'PROVIDER_AUTH' // provider rejected credentials
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_CREDITS' // out of credits / payment required
  | 'PROVIDER_ERROR' // upstream failure
  | 'UNSUPPORTED' // provider lacks the capability
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 412,
  PROVIDER_AUTH: 424,
  PROVIDER_RATE_LIMIT: 429,
  PROVIDER_CREDITS: 402,
  PROVIDER_ERROR: 502,
  UNSUPPORTED: 501,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly provider?: string;

  constructor(code: ErrorCode, message: string, opts: { details?: unknown; provider?: string } = {}) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = opts.details;
    this.provider = opts.provider;
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`);
export const badRequest = (msg: string, details?: unknown) => new AppError('VALIDATION', msg, { details });

/** Maps an HTTP status from a provider into a typed AppError. */
export function providerHttpError(provider: string, status: number, body: string): AppError {
  const snippet = body.slice(0, 300);
  if (status === 401 || status === 403)
    return new AppError('PROVIDER_AUTH', `${provider} rejected the credentials (HTTP ${status}). Check the key in Integrations.`, { provider });
  if (status === 402)
    return new AppError('PROVIDER_CREDITS', `${provider} reports insufficient credits or a billing problem (HTTP 402).`, { provider });
  if (status === 429)
    return new AppError('PROVIDER_RATE_LIMIT', `${provider} rate limit reached. Wait a minute and retry.`, { provider });
  if (status === 400 || status === 422)
    return new AppError('VALIDATION', `${provider} rejected the request: ${snippet}`, { provider });
  if (status === 404) return new AppError('NOT_FOUND', `${provider} has no record for that request.`, { provider });
  return new AppError('PROVIDER_ERROR', `${provider} returned HTTP ${status}.`, { provider, details: snippet });
}
