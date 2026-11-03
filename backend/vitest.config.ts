import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/chasehorse_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      JWT_SECRET: 'test-jwt-secret-that-is-long-enough-123456',
      APP_URL: 'http://localhost:3000',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
    },
  },
});
