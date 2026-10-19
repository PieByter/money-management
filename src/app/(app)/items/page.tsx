import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dayLabel, jakartaYmd, timeLabel } from '@/lib/dates';
import { formatAmount, formatIdr } from '@/lib/money';
import { uuidSchema } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { getItemPriceHistory, listItems } from '@/server/services/items';

export const metadata = { title: 'Item & harga' };

function qtyLabel(qtyMilli: number): string {
  if (qtyMilli === 1000) return '';
  const whole = Math.trunc(qtyMilli / 1000);
  const fraction = qtyMilli % 1000;
  return fraction === 0
    ? ` ×${whole}`
    : ` ×${whole},${String(fraction).padStart(3, '0').replace(/0+$/, '')}`;
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const params = await searchParams;
  const parsedItem = uuidSchema.safeParse(params.item);

  const user = await requireUser();
  const db = await getDb();

  const items = await listItems(db, user.id, { limit: 200 });

  // Ringkasan per item: berapa kali dibeli + kapan terakhir.
  const result = await db.execute(sql`
    select ti.item_id, count(*)::int as times, max(t.occurred_at) as last_at
    from transaction_items ti
    join transactions t on t.id = ti.transaction_id
    where ti.user_id = ${user.id} and t.deleted_at is null and ti.item_id is not null
    group by ti.item_id
  `);
  const statRows = (
    Array.isArray(result) ? result : ((result as { rows?: unknown }).rows ?? [])
  ) as Record<string, unknown>[];
  const statById = new Map(
    statRows.map((row) => [
      String(row.item_id),
      { times: Number(row.times), lastAt: row.last_at ? new Date(String(row.last_at)) : null },
    ]),
  );

  const selected = parsedItem.success
    ? (items.find((item) => item.id === parsedItem.data) ?? null)
    : null;
  const history = selected ? await getItemPriceHistory(db, user.id, selected.id) : [];
  const historyAsc = [...history].reverse();
  const minPrice = historyAsc.length ? Math.min(...historyAsc.map((entry) => entry.unitPrice)) : 0;
  const maxPrice = historyAsc.length ? Math.max(...historyAsc.map((entry) => entry.unitPrice)) : 0;
  const firstPrice = historyAsc[0]?.unitPrice ?? 0;
  const lastPrice = historyAsc[historyAsc.length - 1]?.unitPrice ?? 0;
  const changePercent =
    firstPrice > 0 ? Math.round(((lastPrice - firstPrice) / firstPrice) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          aria-label="Kembali ke pengaturan"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">Item &amp; harga</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Katalog ini terisi otomatis dari rincian item yang kamu isi saat mencatat belanja. Ketuk
        satu item untuk melihat riwayat harganya.
      </p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <span className="text-3xl" aria-hidden>
            🧾
          </span>
          <p className="text-sm font-medium">Belum ada item</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Saat mencatat pengeluaran, buka bagian <b>Rincian item</b> lalu isi barang yang kamu
            beli (mis. Beras 5kg, Telur). Sesudah itu katalog ini terisi sendiri.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((item) => {
            const stat = statById.get(item.id);
            const active = selected?.id === item.id;
            return (
              <Link
                key={item.id}
                href={`/items?item=${item.id}`}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60',
                  active && 'bg-muted/60',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {stat ? `${stat.times}× beli` : 'belum ada riwayat'}
                    {stat?.lastAt ? ` · terakhir ${dayLabel(jakartaYmd(stat.lastAt))}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {item.lastPrice ? formatIdr(item.lastPrice) : '—'}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat harga — {selected.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {historyAsc.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada pembelian tercatat.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Terendah" value={minPrice} />
                  <Stat label="Tertinggi" value={maxPrice} />
                  <Stat
                    label="Terakhir"
                    value={lastPrice}
                    hint={
                      historyAsc.length > 1
                        ? `${changePercent > 0 ? '+' : ''}${changePercent}% dari awal`
                        : 'baru 1 pembelian'
                    }
                    tone={
                      changePercent > 0
                        ? 'text-expense'
                        : changePercent < 0
                          ? 'text-income'
                          : undefined
                    }
                  />
                </div>

                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {historyAsc.map((entry) => (
                    <li
                      key={entry.transactionId}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted-foreground">
                          {dayLabel(jakartaYmd(entry.occurredAt))} · {timeLabel(entry.occurredAt)}
                          {entry.walletName ? ` · ${entry.walletName}` : ''}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {qtyLabel(entry.qtyMilli)
                            ? `Total ${formatIdr(entry.lineAmount)}${qtyLabel(entry.qtyMilli)}`
                            : (entry.note ?? '—')}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">
                          {formatIdr(entry.unitPrice)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">per satuan</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  Harga satuan = total baris ÷ jumlah. Kalau biasanya beli per satuan, harga di
                  tabel ini sama dengan harga barangnya.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Belum bisa membandingkan harga antar toko karena aplikasi belum menyimpan nama
                  toko (jenis kantong = metode bayar, bukan tempat belanja).
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', tone)}>
        {formatAmount(value)}
      </p>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
