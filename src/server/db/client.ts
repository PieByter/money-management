import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Dua mode koneksi:
 * - DATABASE_URL terisi (bukan placeholder) → Postgres/Supabase (produksi).
 * - Kosong → PGlite embedded di ./.data/pglite (mode lokal tanpa setup).
 * Service layer hanya bergantung pada tipe AppDb, bukan driver-nya.
 */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Abaikan nilai placeholder (<ref>/<region>) agar tidak crash saat query. */
function resolveDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (url.includes('<') || url.includes('>')) {
    console.warn(
      '[db] DATABASE_URL masih berisi placeholder (<ref>/<region>). ' +
        'Salin connection string asli dari Supabase → Connect, atau kosongkan untuk memakai PGlite.',
    );
    return null;
  }
  return url;
}

function migrationsFolder(): string {
  return path.join(process.cwd(), 'drizzle');
}

interface DbHandle {
  db: AppDb;
  ready: Promise<void>;
}

const globalForDb = globalThis as unknown as { __moneyDb?: DbHandle };

function createHandle(): DbHandle {
  const url = resolveDatabaseUrl();
  if (url) {
    // Supavisor transaction pooler tidak mendukung prepared statements.
    const client = postgres(url, { max: 10, prepare: false });
    const db = drizzlePostgres(client, { schema }) as unknown as AppDb;
    const ready = migratePostgres(db as never, {
      migrationsFolder: migrationsFolder(),
    });
    return { db, ready };
  }

  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite');
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema }) as unknown as AppDb;
  const ready = migratePglite(db as never, {
    migrationsFolder: migrationsFolder(),
  });
  return { db, ready };
}

export function getDbHandle(): DbHandle {
  if (!globalForDb.__moneyDb) {
    globalForDb.__moneyDb = createHandle();
  }
  return globalForDb.__moneyDb;
}

export async function getDb(): Promise<AppDb> {
  const handle = getDbHandle();
  await handle.ready;
  return handle.db;
}

export { schema };
