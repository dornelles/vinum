import { spawn, spawnSync } from 'node:child_process';

const configuredUrl = process.env.DATABASE_URL;
if (!configuredUrl) throw new Error('Configure DATABASE_URL no .env.');

// The .env URL is also used by tools running on the host. Inside Compose,
// reach the same database by its service name and container port.
const databaseUrl = new URL(configuredUrl);
databaseUrl.hostname = 'postgres';
databaseUrl.port = '5432';
process.env.DATABASE_URL = databaseUrl.toString();

const migration = spawnSync(process.execPath, ['--import', 'tsx', 'backend/scripts/deploy.ts'], {
  stdio: 'inherit',
  env: process.env,
});
if (migration.status !== 0) process.exit(migration.status ?? 1);

const backend = spawn('node', ['--import', 'tsx', 'backend/src/server.ts'], {
  stdio: 'inherit',
  env: process.env,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => backend.kill(signal));
}
backend.on('exit', (code, signal) => {
  if (signal) process.exit(0);
  process.exit(code ?? 1);
});
