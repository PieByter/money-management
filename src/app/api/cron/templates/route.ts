import { NextResponse, type NextRequest } from 'next/server';
import { captureError } from '@/lib/observability';
import { getDb } from '@/server/db/client';
import { cleanupTelegramTokens } from '@/server/services/telegram';
import { runDueTemplatesForAll } from '@/server/services/templates';

export const dynamic = 'force-dynamic';

/**
 * Cron harian: posting template transaksi yang jatuh tempo untuk semua user.
 * Vercel Cron mengirim `Authorization: Bearer <CRON_SECRET>` bila env diisi.
 * Tanpa secret, endpoint hanya boleh dipanggil di lingkungan non-Vercel agar
 * tidak menjadi pintu terbuka di produksi.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const authorization = request.headers.get('authorization');
    const fromQuery = request.nextUrl.searchParams.get('secret');
    if (authorization !== `Bearer ${secret}` && fromQuery !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.VERCEL) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET belum diatur di environment Vercel' },
      { status: 500 },
    );
  }

  try {
    const db = await getDb();
    const result = await runDueTemplatesForAll(db);
    const telegramTokensCleaned = await cleanupTelegramTokens(db);
    return NextResponse.json({ ok: true, ...result, telegramTokensCleaned });
  } catch (error) {
    captureError(error, { area: 'cron.templates' });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Gagal memproses template' },
      { status: 500 },
    );
  }
}
