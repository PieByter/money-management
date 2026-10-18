import { jakartaYmd, timeLabel } from '@/lib/dates';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listTransactions, type TransactionListItem } from '@/server/services/transactions';

export const dynamic = 'force-dynamic';

function escapeCsv(value: string): string {
  return /["\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET() {
  const user = await requireUser();
  const db = await getDb();

  const rows: TransactionListItem[] = [];
  let cursor: string | null = null;
  do {
    const page = await listTransactions(db, user.id, { cursor, limit: 100 });
    rows.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && rows.length < 20_000);

  const header = ['tanggal', 'waktu', 'tipe', 'kantong', 'kategori', 'nominal', 'catatan', 'group_id'];
  const lines = rows.map((row) => {
    const occurredAt = new Date(row.occurredAt);
    return [
      jakartaYmd(occurredAt),
      timeLabel(occurredAt),
      row.kind,
      row.walletName,
      row.categoryName ?? '',
      String(row.amount),
      row.note ?? '',
      row.groupId ?? '',
    ];
  });

  // Pemisah titik-koma + BOM agar rapi dibuka dengan Excel locale Indonesia.
  const csv = [header, ...lines]
    .map((columns) => columns.map((value) => escapeCsv(String(value))).join(';'))
    .join('\r\n');

  const filename = `money-tracker-${jakartaYmd(new Date())}.csv`;
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
