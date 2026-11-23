import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { formatIdr } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { UpcomingItem } from '@/server/services/upcoming';

function dateLabel(daysUntil: number): string {
  if (daysUntil < 0) return `Terlambat ${Math.abs(daysUntil)} hari`;
  if (daysUntil === 0) return 'Hari ini';
  if (daysUntil === 1) return 'Besok';
  return `${daysUntil} hari lagi`;
}

export function UpcomingCard({ items }: { items: UpcomingItem[] }) {
  if (items.length === 0) return null;
  const visible = items.slice(0, 6);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
          Akan datang
        </h2>
        <p className="text-xs text-muted-foreground">14 hari ke depan</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {visible.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/60"
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base',
                  item.overdue
                    ? 'bg-expense/10 text-expense'
                    : 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.subtitle}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span
                  className={cn(
                    'block text-sm font-semibold tabular-nums',
                    item.direction === 'payable' || item.kind === 'credit'
                      ? 'text-expense'
                      : item.direction === 'receivable'
                        ? 'text-income'
                        : undefined,
                  )}
                >
                  {formatIdr(item.amount)}
                </span>
                <span
                  className={cn(
                    'mt-0.5 block text-[11px]',
                    item.overdue ? 'font-medium text-expense' : 'text-muted-foreground',
                  )}
                >
                  {dateLabel(item.daysUntil)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > visible.length ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          +{items.length - visible.length} item lain. Buka Template atau Hutang untuk melihat semua.
        </p>
      ) : null}
    </section>
  );
}
