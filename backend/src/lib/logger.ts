/* Minimal structured logger that never prints secrets. */

const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|refresh|access/i;
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /AIza[0-9A-Za-z_-]{20,}/g, // Google API keys
  /ya29\.[0-9A-Za-z_-]+/g, // Google OAuth access tokens
  /1\/\/[0-9A-Za-z_-]{20,}/g, // Google refresh tokens
];
const SECRET_QUERY_PARAM = /([?&](?:key|token|access_token|api_key|code)=)[^&\s]+/gi;

export function redactString(value: string): string {
  let out = value.replace(SECRET_QUERY_PARAM, '$1[REDACTED]');
  for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, '[REDACTED]');
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = {
    t: new Date().toISOString(),
    level,
    msg: redactString(message),
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const out = JSON.stringify(line);
  if (level === 'error' || level === 'warn') console.error(out);
  else console.log(out);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => process.env.LOG_LEVEL === 'debug' && emit('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};
