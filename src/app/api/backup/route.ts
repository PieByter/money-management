import { jakartaYmd } from '@/lib/dates';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { exportBackup } from '@/server/services/backup';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  const db = await getDb();
  const backup = await exportBackup(db, user.id);
  const filename = `money-tracker-backup-${jakartaYmd(new Date())}.json`;

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
