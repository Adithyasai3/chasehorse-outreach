import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend or root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/chasehorse?schema=public',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  security: {
    encryptionSecret:
      process.env.ENCRYPTION_SECRET || '4f9c8d2e1a3b5c7e9f0a2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e',
    jwtSecret: process.env.JWT_SECRET || 'chasehorse-super-secret-jwt-key-2026',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },

  enricho: {
    mcpUrl: process.env.ENRICHO_MCP_URL || 'https://mcp.enricho.co/mcp',
    apiKey: process.env.ENRICHO_API_KEY || '',
    simulationMode: process.env.ENRICHO_SIMULATION_MODE === 'true',
  },

  gmail: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/gmail/oauth/callback',
    syncIntervalMinutes: parseInt(process.env.GMAIL_SYNC_INTERVAL_MINUTES || '5', 10),
  },
};
