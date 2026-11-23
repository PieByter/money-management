import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { resolveOccurredAt } from '@/lib/dates';
import { captureError } from '@/lib/observability';
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit';
import { simpleTransactionSchema, transferSchema } from '@/lib/schemas';
import { getSessionUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { findFeeCategoryId } from '@/server/services/categories';
import { createTransaction, createTransfer, ServiceError } from '@/server/services/transactions';

export const dynamic = 'force-dynamic';

function message(error: unknown): string {
  if (error instanceof ServiceError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Input tidak valid';
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') return 'Transaksi ini sudah tersimpan';
  if (error instanceof Error && error.message) return error.message;
  return 'Gagal menyimpan transaksi';
}

/**
 * Endpoint tulis untuk antrean offline. Payload identik dengan server action,
 * jadi validasi dan idempotensi (`client_request_id`) tetap sama.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Sesi berakhir. Masuk lagi.' }, { status: 401 });
  }

  const limit = checkRateLimit(`api:tx:${user.id}`, 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: rateLimitMessage(limit.retryAfterMs) },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  let body: { kind?: unknown; payload?: unknown };
  try {
    body = (await request.json()) as { kind?: unknown; payload?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: 'Body JSON tidak valid' }, { status: 400 });
  }

  try {
    const db = await getDb();

    if (body.kind === 'transfer') {
      const values = transferSchema.parse(body.payload);
      const feeAmount = values.feeAmount ?? 0;
      const feeCategoryId =
        feeAmount > 0 ? (values.feeCategoryId ?? (await findFeeCategoryId(db, user.id))) : null;
      const result = await createTransfer(db, user.id, {
        fromWalletId: values.fromWalletId,
        toWalletId: values.toWalletId,
        amount: values.amount,
        feeAmount,
        feeCategoryId,
        occurredAt: resolveOccurredAt(values.date),
        note: values.note?.trim() ? values.note : null,
        clientRequestId: values.clientRequestId ?? null,
      });
      return NextResponse.json({ ok: true, data: result });
    }

    if (body.kind === 'simple') {
      const values = simpleTransactionSchema.parse(body.payload);
      const row = await createTransaction(db, user.id, {
        kind: values.kind,
        amount: values.amount,
        walletId: values.walletId,
        categoryId: values.categoryId ?? null,
        occurredAt: resolveOccurredAt(values.date),
        note: values.note?.trim() ? values.note : null,
        tags: values.tags,
        items: values.kind === 'expense' ? values.items : undefined,
        clientRequestId: values.clientRequestId ?? null,
        source: values.source,
        rawInput: values.rawInput?.trim() ? values.rawInput : null,
      });
      return NextResponse.json({ ok: true, data: { id: row.id } });
    }

    return NextResponse.json({ ok: false, error: 'Jenis antrean tidak dikenal' }, { status: 400 });
  } catch (error) {
    const status = error instanceof ZodError || error instanceof ServiceError ? 400 : 500;
    if (status === 500) captureError(error, { area: 'api.transactions', userId: user.id });
    return NextResponse.json({ ok: false, error: message(error) }, { status });
  }
}
