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

async function main() {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  const url = process.env.DATABASE_URL;

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
  console.error(error);
  process.exit(1);
});
