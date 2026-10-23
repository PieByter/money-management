import Link from 'next/link';
import { CategoryDonut, DailyTrend } from '@/components/app/charts';
import { MonthPicker } from '@/components/app/month-picker';
import { QuickActions } from '@/components/app/quick-actions';
import { StaticTransactionList } from '@/components/app/transaction-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { eachDayInRange, jakartaYearMonth, monthKey, monthRangeFromKey } from '@/lib/dates';
import { formatIdr } from '@/lib/money';
import { cn } from '@/lib/utils';
import { monthKeySchema } from '@/lib/schemas';
import { WALLET_TYPE_LABELS } from '@/lib/view-types';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { getBudgetProgress } from '@/server/services/budgets';
import { getDebtSummary } from '@/server/services/debts';
import {
  getAssetOverview,
  getCategoryTotals,
  getDailyTotals,
  getMonthSummary,
  getRecentTransactions,
} from '@/server/services/reports';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const params = await searchParams;
  const monthParam = monthKeySchema.safeParse(params.m);
  const month = monthParam.success ? params.m! : monthKey(jakartaYearMonth());

  const user = await requireUser();
  const db = await getDb();
  const range = monthRangeFromKey(month);

  const [summary, assets, categoryTotals, daily, recent, budgetProgress, debtSummary] =
    await Promise.all([
      getMonthSummary(db, user.id, month),
      getAssetOverview(db, user.id),
      getCategoryTotals(db, user.id, range),
      getDailyTotals(db, user.id, range),
      getRecentTransactions(db, user.id, 5),
      getBudgetProgress(db, user.id, month),
      getDebtSummary(db, user.id),
    ]);

  const dailyData = eachDayInRange(range.start, range.end).map((ymd) => ({
    label: String(Number(ymd.slice(8, 10))),
    expense: daily.find((entry) => entry.ymd === ymd)?.expense ?? 0,
  }));

  return (
    <div className="space-y-5">
      <MonthPicker month={month} />
      <QuickActions className="hidden lg:block" />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryCard label="Masuk" prefix="+" value={summary.income} tone="text-income" />
        <SummaryCard label="Keluar" prefix="−" value={summary.expense} tone="text-expense" />
        <SummaryCard
          label="Selisih"
          prefix={summary.net > 0 ? '+' : summary.net < 0 ? '−' : ''}
          value={summary.net}
          tone={summary.net < 0 ? 'text-expense' : 'text-foreground'}
        />
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Kantong</h2>
          <Link href="/wallets" className="text-xs font-medium text-primary hover:underline">
            Kelola kantong
          </Link>
        </div>

        <div className="mb-3 flex items-baseline justify-between rounded-2xl border border-border bg-card px-4 py-3.5">
          <div>
            <p className="text-xs text-muted-foreground">Total aset</p>
            <p className="text-2xl font-semibold tabular-nums">{formatIdr(assets.total)}</p>
          </div>
          <p className="text-xs text-muted-foreground">{assets.wallets.length} kantong aktif</p>
        </div>

        {assets.wallets.length === 0 ? (
          <Link
            href="/wallets"
            className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border px-6 py-8 text-center transition-colors hover:bg-muted/50"
          >
            <span className="text-2xl" aria-hidden>
              👛
            </span>
            <p className="text-sm font-medium">Belum ada kantong</p>
            <p className="text-xs text-muted-foreground">
              Buat yang pertama: Cash, rekening bank, atau dompet digital.
            </p>
          </Link>
        ) : (
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
            {assets.wallets.map((wallet) => (
              <Link
                key={wallet.id}
                href={`/wallets/${wallet.id}`}
                className="w-40 shrink-0 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:bg-muted lg:w-auto"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    {wallet.icon ?? '💳'}
                  </span>
                  <span className="truncate text-sm font-medium">{wallet.name}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {WALLET_TYPE_LABELS[wallet.type] ?? wallet.type}
                </p>
                <p className="mt-2 text-base font-semibold tabular-nums">
                  {formatIdr(wallet.balance)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Hutang &amp; piutang</h2>
          <Link href="/debts" className="text-xs font-medium text-primary hover:underline">
            Kelola
          </Link>
        </div>
        {debtSummary.openCount + debtSummary.paidCount === 0 ? (
          <Link
            href="/debts"
            className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm transition-colors hover:bg-muted/50"
          >
            <span className="text-muted-foreground">
              Catat pinjaman supaya tahu pinjam dari siapa, untuk apa, dan sisa pembayarannya.
            </span>
            <span className="shrink-0 font-medium text-primary">Mulai</span>
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/debts?f=hutang"
              className="rounded-2xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/60"
            >
              <p className="text-[11px] font-medium text-muted-foreground">Sisa hutang</p>
              <p className="mt-1 truncate text-sm font-semibold tabular-nums text-expense">
                {formatIdr(debtSummary.payableOutstanding)}
              </p>
            </Link>
            <Link
              href="/debts?f=piutang"
              className="rounded-2xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/60"
            >
              <p className="text-[11px] font-medium text-muted-foreground">Sisa piutang</p>
              <p className="mt-1 truncate text-sm font-semibold tabular-nums text-income">
                {formatIdr(debtSummary.receivableOutstanding)}
              </p>
            </Link>
          </div>
        )}
      </section>

      {budgetProgress.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Budget</h2>
            <Link href="/settings#budget" className="text-xs font-medium text-primary hover:underline">
              Kelola budget
            </Link>
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {budgetProgress.map((budget) => (
              <div key={budget.categoryId}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {budget.icon ? `${budget.icon} ` : ''}
                    {budget.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatIdr(budget.spent)} / {formatIdr(budget.limit)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      budget.over ? 'bg-expense' : budget.ratio >= 0.8 ? 'bg-primary/70' : 'bg-primary',
                    )}
                    style={{ width: `${Math.min(Math.round(budget.ratio * 100), 100)}%` }}
                  />
                </div>
                <p
                  className={cn(
                    'mt-1 text-[11px]',
                    budget.over ? 'font-medium text-expense' : 'text-muted-foreground',
                  )}
                >
                  {budget.over
                    ? `Lewat ${formatIdr(budget.spent - budget.limit)} dari batas`
                    : `Sisa ${formatIdr(budget.remaining)}`}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pengeluaran per kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDonut
              data={categoryTotals.expense.map((item) => ({
                name: item.name,
                value: item.total,
                color: item.color,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tren harian</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyTrend data={dailyData} />
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Transaksi terbaru</h2>
          <Link href="/transactions" className="text-xs font-medium text-primary hover:underline">
            Lihat semua
          </Link>
        </div>
        <StaticTransactionList
          items={recent}
          emptyTitle="Belum ada transaksi"
          emptyHint="Catat pengeluaran pertama lewat tombol + di bawah."
        />
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  prefix,
  tone,
}: {
  label: string;
  value: number;
  prefix: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold tabular-nums sm:text-base ${tone}`}>
        {prefix}
        {formatIdr(Math.abs(value))}
      </p>
    </div>
  );
}
