import { execSync } from 'child_process';

/** Recreates the test schema once per run. Requires the docker-compose Postgres (port 5434). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/chasehorse_test?schema=public';
  execSync('npx prisma db push --force-reset --skip-generate --accept-data-loss', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
