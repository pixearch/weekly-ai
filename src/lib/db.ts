import { Pool } from 'pg';

// Prefer Vercel Postgres managed URLs, fall back to DATABASE_URL
const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  '';

const needsSSL =
  process.env.PGSSL === 'require' ||
  (connectionString.includes('sslmode=require'));

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pg =
  globalForPg.pgPool ??
  new Pool({
    connectionString,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
  });

if (!globalForPg.pgPool) globalForPg.pgPool = pg;

export const query = (text: string, params?: any[]) => pg.query(text, params);
