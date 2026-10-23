import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  DebtActionsMenu,
  DebtPaymentActions,
  DebtPaymentDeleteButton,
  type DebtTarget,
} from '@/components/app/debt-manager';
import { Badge } from '@/components/ui/badge';
import { dayLabel, jakartaYmd, longDateLabel } from '@/lib/dates';
import { formatIdr, formatIdrSigned } from '@/lib/money';
import { uuidSchema } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { getDebt } from '@/server/services/debts';
import { listWallets } from '@/server/services/wallets';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { title: 'Hutang & Piutang' };
  const user = await requireUser();
  const db = await getDb();
  const debt = await getDebt(db, user.id, parsed.data);
  return { title: debt ? debt.counterparty : 'Hutang & Piutang' };
}

export default async function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) notFound();

  const user = await requireUser();
  const db = await getDb();
  const debt = await getDebt(db, user.id, parsed.data);
  if (!debt) notFound();

  const wallets = await listWallets(db, user.id);
  const walletOptions = wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    icon: wallet.icon,
  }));

  const isPayable = debt.direction === 'payable';
  const target: DebtTarget = {
    id: debt.id,
    direction: debt.direction,
    counterparty: debt.counterparty,
    purpose: debt.purpose,
    principal: debt.principal,
    paid: debt.paid,
    remaining: debt.remaining,
    status: debt.status,
    paymentWalletId: debt.paymentWallet.id,
    dueDate: debt.dueAt ? jakartaYmd(debt.dueAt) : null,
    note: debt.note,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/debts"
          aria-label="Kembali ke daftar pinjaman"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{debt.counterparty}</h1>
        <DebtActionsMenu debt={target} wallets={walletOptions} />
      </div>

      <div className="rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={isPayable ? 'expense' : 'income'}>
            {isPayable ? 'Hutang' : 'Piutang'}
          </Badge>
          {debt.status === 'paid' ? <Badge variant="muted">Lunas</Badge> : null}
          {debt.overdue ? <Badge variant="destructive">Lewat jatuh tempo</Badge> : null}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {debt.purpose ?? 'Tanpa keterangan'}
          {debt.dueAt ? ` · jatuh tempo ${longDateLabel(jakartaYmd(debt.dueAt))}` : ''}
        </p>

        <p className="mt-2 text-2xl font-semibold tabular-nums">{formatIdr(debt.remaining)}</p>
        <p className="text-xs text-muted-foreground">
          sisa dari pokok {formatIdr(debt.principal)} · sudah {formatIdr(debt.paid)}
        </p>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', isPayable ? 'bg-expense' : 'bg-income')}
            style={{ width: `${Math.min(Math.round(debt.progress * 100), 100)}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-1">
            {debt.fundingWallet.icon ?? '💳'} {debt.fundingWallet.name}
          </span>
          <span aria-hidden>→</span>
          <span className="rounded-full bg-muted px-2 py-1">
            {debt.paymentWallet.icon ?? '💳'} {debt.paymentWallet.name}
          </span>
        </div>

        {debt.note ? <p className="mt-3 text-xs text-muted-foreground">{debt.note}</p> : null}

        <div className="mt-4">
          <DebtPaymentActions debt={target} wallets={walletOptions} />
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Alur uang</h2>
        <ol className="space-y-0 rounded-2xl border border-border bg-card px-4 py-3">
          {debt.flow.map((event, index) => {
            // Untuk hutang: dana masuk (funding) = +, pembayaran = −.
            const inflow = isPayable === (event.type === 'funding');
            const isLast = index === debt.flow.length - 1;
            return (
              <li key={`${event.type}-${index}`} className="flex gap-3">
                <span className="flex flex-col items-center pt-1.5">
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      inflow ? 'bg-income' : 'bg-expense',
                    )}
                  />
                  {!isLast ? <span className="w-px flex-1 bg-border" /> : null}
                </span>
                <span className={cn('min-w-0 flex-1 pb-3', isLast && 'pb-0')}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {event.type === 'funding'
                        ? isPayable
                          ? `Pinjaman masuk`
                          : `Uang dipinjamkan`
                        : isPayable
                          ? 'Pembayaran'
                          : 'Penerimaan'}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-sm font-semibold tabular-nums',
                        inflow ? 'text-income' : 'text-expense',
                      )}
                    >
                      {inflow ? '+' : '−'}
                      {formatIdr(event.amount)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {event.wallet.icon ?? '💳'} {event.wallet.name} ·{' '}
                    {dayLabel(jakartaYmd(event.occurredAt))}
                    {event.note ? ` · ${event.note}` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Riwayat pembayaran</h2>
          <span className="text-xs text-muted-foreground">
            {debt.payments.length}× · {formatIdrSigned(isPayable ? -debt.paid : debt.paid)}
          </span>
        </div>
        {debt.payments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            Belum ada pembayaran. Tekan {isPayable ? '"Lunas"' : '"Lunas"'} saat{' '}
            {isPayable ? 'kamu membayar' : 'kamu menerima uangnya'} — sisa otomatis masuk/keluar
            kantong.
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {[...debt.payments].reverse().map((payment) => (
              <div key={payment.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium tabular-nums">
                    {formatIdr(payment.amount)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {payment.wallet.icon ?? '💳'} {payment.wallet.name} ·{' '}
                    {dayLabel(jakartaYmd(payment.occurredAt))}
                    {payment.note ? ` · ${payment.note}` : ''}
                  </span>
                </span>
                <DebtPaymentDeleteButton paymentId={payment.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
