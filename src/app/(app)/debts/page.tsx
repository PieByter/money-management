import Link from 'next/link';
import { ChevronRight, HandCoins } from 'lucide-react';
import { DebtCreateButton } from '@/components/app/debt-manager';
import { Badge } from '@/components/ui/badge';
import { dayLabel, jakartaYmd } from '@/lib/dates';
import { formatIdr } from '@/lib/money';
import { cn } from '@/lib/utils';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listDebts, summarizeDebts, type DebtEntry } from '@/server/services/debts';
import { listWallets } from '@/server/services/wallets';

export const metadata = { title: 'Hutang & Piutang' };

const FILTERS = [
  { value: 'semua', label: 'Semua' },
  { value: 'berjalan', label: 'Berjalan' },
  { value: 'lunas', label: 'Lunas' },
  { value: 'hutang', label: 'Hutang' },
  { value: 'piutang', label: 'Piutang' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

function parseFilter(raw: string | undefined): FilterValue {
  return FILTERS.some((filter) => filter.value === raw) ? (raw as FilterValue) : 'semua';
}

function matches(entry: DebtEntry, filter: FilterValue): boolean {
  switch (filter) {
    case 'berjalan':
      return entry.status === 'open';
    case 'lunas':
      return entry.status === 'paid';
    case 'hutang':
      return entry.direction === 'payable';
    case 'piutang':
      return entry.direction === 'receivable';
    default:
      return true;
  }
}

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.f);

  const user = await requireUser();
  const db = await getDb();
  const [debts, wallets] = await Promise.all([
    listDebts(db, user.id),
    listWallets(db, user.id),
  ]);
  const summary = summarizeDebts(debts);

  const walletOptions = wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    icon: wallet.icon,
  }));
  const visible = debts.filter((entry) => matches(entry, filter));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Hutang &amp; Piutang</h1>
        <DebtCreateButton wallets={walletOptions} label="Tambah" size="sm" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-card px-3.5 py-3">
          <p className="text-[11px] font-medium text-muted-foreground">Sisa hutang</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-expense">
            {formatIdr(summary.payableOutstanding)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            dari pokok {formatIdr(summary.payablePrincipal)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-3.5 py-3">
          <p className="text-[11px] font-medium text-muted-foreground">Sisa piutang</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-income">
            {formatIdr(summary.receivableOutstanding)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            dari pokok {formatIdr(summary.receivablePrincipal)}
          </p>
        </div>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((option) => (
          <Link
            key={option.value}
            href={option.value === 'semua' ? '/debts' : `/debts?f=${option.value}`}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              filter === option.value
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <span className="text-3xl" aria-hidden>
            🤝
          </span>
          <p className="text-sm font-medium">
            {debts.length === 0 ? 'Belum ada catatan pinjaman' : 'Tidak ada yang cocok'}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {debts.length === 0
              ? 'Catat pinjaman dari bank/aplikasi atau uang yang kamu pinjamkan. Uangnya otomatis masuk/keluar kantong, dan sisa serta pelunasan terlacak.'
              : 'Coba pilih filter lain.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {visible.map((entry) => (
            <DebtRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <HandCoins className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Penerimaan pinjaman dan pelunasannya dicatat sebagai transaksi asli, jadi saldo kantong
        selalu cocok dengan laporan.
      </p>
    </div>
  );
}

function DebtRow({ entry }: { entry: DebtEntry }) {
  const isPayable = entry.direction === 'payable';
  return (
    <Link
      href={`/debts/${entry.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{entry.counterparty}</span>
          <Badge variant={isPayable ? 'expense' : 'income'}>
            {isPayable ? 'Hutang' : 'Piutang'}
          </Badge>
          {entry.status === 'paid' ? <Badge variant="muted">Lunas</Badge> : null}
          {entry.overdue ? <Badge variant="destructive">Lewat jatuh tempo</Badge> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {entry.purpose ?? 'Tanpa keterangan'}
        </span>
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {entry.fundingWallet.icon ?? '💳'} {entry.fundingWallet.name} →{' '}
          {entry.paymentWallet.icon ?? '💳'} {entry.paymentWallet.name}
          {entry.dueAt ? ` · jatuh tempo ${dayLabel(jakartaYmd(entry.dueAt))}` : ''}
        </span>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className={cn('block h-full rounded-full', isPayable ? 'bg-expense' : 'bg-income')}
            style={{ width: `${Math.min(Math.round(entry.progress * 100), 100)}%` }}
          />
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">
          {formatIdr(entry.remaining)}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          sisa dari {formatIdr(entry.principal)}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
