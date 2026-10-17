import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolves to /server both from src/lib (tsx) and dist/lib (node).
const serverRoot = fileURLToPath(new URL('../..', import.meta.url));

const envFile = path.join(serverRoot, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  dbPath: path.resolve(serverRoot, process.env.DB_PATH ?? '../database/tree-monitor.db'),
  initSqlPath: path.resolve(serverRoot, '../database/init.sql'),
  uploadsDir: path.resolve(serverRoot, 'uploads'),
};
