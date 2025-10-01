import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
// Reuse a single Pool across hot-reloads in dev
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pg =
  globalForPg.pgPool ??
  new Pool({
    connectionString,
    // Local dev usually no SSL; managed hosts may require it. We'll override per env later.
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
  });

if (!globalForPg.pgPool) globalForPg.pgPool = pg;

// Convenience helper
export const query = (text: string, params?: any[]) => pg.query(text, params);
