import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { AppDb } from '@/server/db/client';
import * as schema from '@/server/db/schema';

export interface TestDb {
  db: AppDb;
  client: PGlite;
}

/** PGlite in-memory + migrasi dari folder drizzle/ (sumber yang sama dengan produksi). */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const raw = drizzle(client, { schema });
  await migrate(raw, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  return { db: raw as unknown as AppDb, client };
}
