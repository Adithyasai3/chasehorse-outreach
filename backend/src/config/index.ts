import dotenv from 'dotenv';
import path from 'path';

// Load backend/.env first, then repo-root .env (values already set win).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const env = process.env.NODE_ENV || 'development';
const isTest = env === 'test';
const isProd = env === 'production';

function required(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (!isProd && devFallback !== undefined) return devFallback;
  throw new Error(`Missing required environment variable ${name}`);
}

const encryptionKey = required(
  'ENCRYPTION_KEY',
  isTest ? '0'.repeat(64) : undefined
);
if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
  throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

const jwtSecret = required('JWT_SECRET', isTest ? 'test-jwt-secret-not-for-production-use' : undefined);
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters.');
}

const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export const config = {
  env,
  isProd,
  isTest,
  port: parseInt(process.env.PORT || '5000', 10),
  // Public URL of the web app. The frontend proxies /api/* to this backend, so
  // OAuth redirect URIs live under the app origin and share its session cookie.
  appUrl,
  databaseUrl: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5434/chasehorse?schema=public'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6381',
  security: {
    encryptionKey,
    jwtSecret,
    sessionCookie: 'ch_session',
    sessionTtlHours: 24 * 7,
    cookieSecure: appUrl.startsWith('https://'),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: `${appUrl}/api/integrations/google/callback`,
  },
  enricho: {
    // Enricho (https://enricho.co) MCP server, Streamable HTTP transport.
    mcpUrl: process.env.ENRICHO_MCP_URL || 'https://mcp.enricho.co/mcp',
    oauthRedirectUri: `${appUrl}/api/integrations/enricho/oauth/callback`,
  },
  gmailSyncIntervalMinutes: parseInt(process.env.GMAIL_SYNC_INTERVAL_MINUTES || '10', 10),
};

export const googleConfigured = () => Boolean(config.google.clientId && config.google.clientSecret);
