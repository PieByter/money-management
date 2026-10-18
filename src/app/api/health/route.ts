import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * Diagnosa deployment (aman: hanya boolean/kode error, tanpa kredensial).
 * Buka /api/health setelah deploy untuk memastikan database tersambung.
 */
export async function GET() {
  const rawUrl = process.env.DATABASE_URL?.trim() ?? '';
  const placeholder = rawUrl.includes('<') || rawUrl.includes('>');
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  const databaseUrl: 'missing' | 'placeholder' | 'set' = !rawUrl
    ? 'missing'
    : placeholder
      ? 'placeholder'
      : 'set';

  const mode: 'postgres' | 'pglite' | 'unavailable' =
    databaseUrl === 'set' ? 'postgres' : serverless ? 'unavailable' : 'pglite';

  const report: Record<string, unknown> = {
    ok: mode === 'pglite',
    mode,
    serverless,
    supabaseConfigured: isSupabaseConfigured(),
    databaseUrl,
  };

  if (mode === 'postgres') {
    try {
      const { getDb } = await import('@/server/db/client');
      const { sql } = await import('drizzle-orm');
      await (await getDb()).execute(sql`select 1`);
      report.ok = true;
    } catch (error) {
      // Error dari driver sering dibungkus Drizzle: kode & pesan ada di `cause`.
      const root = error as { code?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } };
      const code = root.code ?? root.cause?.code;
      report.errorCode = typeof code === 'string' ? code : 'unknown';
      const message = String(root.cause?.message ?? root.message ?? '');
      if (message) {
        report.errorHint = message
          .replace(/\/\/[^@\s]+@/g, '//***@')
          .replace(/password[^,)\s]*/gi, 'password***')
          .slice(0, 140);
      }
    }
  } else if (mode === 'unavailable') {
    report.hint =
      'Isi DATABASE_URL dengan connection string Supabase "Transaction pooler" (port 6543) di Environment Variables Vercel.';
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
