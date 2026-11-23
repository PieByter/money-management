import Link from 'next/link';
import { cn } from '@/lib/utils';

export type FlowMode = 'all' | 'operational';

/**
 * Pemisah arus kas: semua uang yang bergerak vs operasional (tanpa pencairan
 * dan pelunasan pinjaman). Transaksi pinjaman ditandai tag `hutang`/`piutang`.
 */
export function FlowToggle({
  basePath,
  month,
  mode,
}: {
  basePath: string;
  month: string;
  mode: FlowMode;
}) {
  const items: { value: FlowMode; label: string; href: string; hint: string }[] = [
    {
      value: 'all',
      label: 'Semua',
      href: `${basePath}?m=${month}`,
      hint: 'Termasuk pencairan dan pelunasan pinjaman',
    },
    {
      value: 'operational',
      label: 'Operasional',
      href: `${basePath}?m=${month}&flow=operational`,
      hint: 'Tanpa pencairan dan pelunasan pinjaman',
    },
  ];

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[11px] text-muted-foreground">Arus kas</p>
      <div
        role="group"
        aria-label="Mode arus kas"
        className="flex rounded-xl border border-border bg-card p-0.5"
      >
        {items.map((item) => {
          const active = item.value === mode;
          return (
            <Link
              key={item.value}
              href={item.href}
              scroll={false}
              title={item.hint}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function flowModeFromParam(value: string | undefined): FlowMode {
  return value === 'operational' ? 'operational' : 'all';
}
