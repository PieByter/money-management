/**
 * Seed kategori default (idempotent).
 * Pemakaian: npm run db:seed        → untuk user mode lokal
 *            npm run db:seed -- <user-id>  → untuk user Supabase tertentu
 */
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { AppDb } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';
import { ensureDefaults } from '../src/server/services/defaults';

const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';

async function main() {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  const userId = process.argv[2] ?? LOCAL_USER_ID;
  const url = process.env.DATABASE_URL;

  if (url) {
    const client = postgres(url, { max: 1, prepare: false });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    await ensureDefaults(db as unknown as AppDb, userId);
    await client.end();
    console.log(`Seed kategori selesai (Postgres) untuk user ${userId}.`);
    return;
  }

  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite');
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  await ensureDefaults(db as unknown as AppDb, userId);
  await client.close();
  console.log(`Seed kategori selesai (PGlite) untuk user ${userId} di ${dataDir}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
