/**
 * Jalankan migrasi ke database yang dikonfigurasi:
 * - DATABASE_URL terisi → Postgres/Supabase direct connection.
 * - Kosong → PGlite lokal (./.data/pglite).
 * Penggunaan: npm run db:migrate
 */
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadEnvFiles } from './load-env';

loadEnvFiles();

async function main() {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  const rawUrl = process.env.DATABASE_URL?.trim();
  const url = rawUrl && !rawUrl.includes('<') && !rawUrl.includes('>') ? rawUrl : null;

  if (rawUrl && !url) {
    console.warn('[migrate] DATABASE_URL masih berisi placeholder — dilewati, memakai PGlite.');
  }

  if (url) {
    const client = postgres(url, { max: 1, prepare: false });
    const db = drizzlePostgres(client);
    await migratePostgres(db, { migrationsFolder });
    await client.end();
    console.log('Migrasi selesai (Postgres).');
    return;
  }

  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite');
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client);
  await migratePglite(db, { migrationsFolder });
  await client.close();
  console.log(`Migrasi selesai (PGlite) di ${dataDir}.`);
}

main().catch((error) => {
  const message = String(error?.message ?? error);
  if (/password authentication failed/i.test(message)) {
    console.error('\n[migrate] Password database ditolak oleh server.');
    console.error('  1. Supabase → Project Settings → Database → Reset database password.');
    console.error('  2. Supabase → Connect → salin Connection string terbaru.');
    console.error('  3. Tempel ke DATABASE_URL di .env, lalu jalankan lagi: npm run db:migrate\n');
  }
  console.error(error);
  process.exit(1);
});
