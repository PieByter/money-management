'use server';

import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { csvImportInputSchema } from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { restoreBackup, type RestoreResult } from '@/server/services/backup';
import { importTransactions, type ImportResult } from '@/server/services/imports';
import { enforceRateLimit, errorMessage, revalidateAppLayout } from './shared';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export async function importCsvAction(input: unknown): Promise<ActionResult<ImportResult>> {
  try {
    const user = await requireUser();
    enforceRateLimit(`data:import:${user.id}`, 5, 60 * 60_000);
    const values = csvImportInputSchema.parse(input);
    const db = await getDb();
    const result = await importTransactions(db, user.id, values.rows);
    revalidateAppLayout();
    return { ok: true, data: result };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function restoreBackupAction(raw: string): Promise<ActionResult<RestoreResult>> {
  try {
    const user = await requireUser();
    enforceRateLimit(`data:restore:${user.id}`, 3, 60 * 60_000);
    if (typeof raw !== 'string' || raw.length === 0) {
      return fail('File backup kosong');
    }
    if (Buffer.byteLength(raw, 'utf8') > MAX_BACKUP_BYTES) {
      return fail('File backup terlalu besar (maksimal 10 MB)');
    }
    const db = await getDb();
    const result = await restoreBackup(db, user.id, raw);
    revalidateAppLayout();
    return { ok: true, data: result };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
