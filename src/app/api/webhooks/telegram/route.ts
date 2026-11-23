import { NextResponse, type NextRequest } from 'next/server';
import { captureError } from '@/lib/observability';
import { getDb } from '@/server/db/client';
import { handleTelegramUpdate, type TelegramUpdate } from '@/server/services/telegram';

export const dynamic = 'force-dynamic';

/**
 * Webhook Telegram. Verifikasi secret token (bila diatur), lalu proses pesan.
 * Selalu balas 200 setelah update diterima agar Telegram tidak membanjiri
 * retry; kegagalan internal dicatat di `ingest_events` dan dibalas ke chat.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret) {
    const header = request.headers.get('x-telegram-bot-api-secret-token');
    if (header !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const db = await getDb();
    const result = await handleTelegramUpdate(db, update);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    captureError(error, { area: 'webhooks.telegram' });
    return NextResponse.json({ ok: true, error: true });
  }
}
