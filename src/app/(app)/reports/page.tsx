import Link from 'next/link';
import { CategoryDonut, MonthlyTrend } from '@/components/app/charts';
import { MonthPicker } from '@/components/app/month-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { jakartaYearMonth, monthKey, monthLabel, monthRangeFromKey, parseMonthKey, shiftMonthKey } from '@/lib/dates';
import { formatIdr, formatIdrSigned } from '@/lib/money';
import { cn } from '@/lib/utils';
import { monthKeySchema } from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { getCategoryTotals, getMonthSummary, getMonthlyTrend, getTagTotals } from '@/server/services/reports';

export const metadata = { title: 'Laporan' };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const params = await searchParams;
  const monthParam = monthKeySchema.safeParse(params.m);
  const month = monthParam.success ? params.m! : monthKey(jakartaYearMonth());
  const prevMonth = shiftMonthKey(month, -1);

  const user = await requireUser();
  const db = await getDb();
  const range = monthRangeFromKey(month);

  const [current, previous, trend, categoryTotals, tagTotals] = await Promise.all([
    getMonthSummary(db, user.id, month),
    getMonthSummary(db, user.id, prevMonth),
    getMonthlyTrend(db, user.id, { endMonth: month, months: 6 }),
    getCategoryTotals(db, user.id, range),
    getTagTotals(db, user.id, range),
  ]);

  const rows = [
    { label: 'Masuk', current: current.income, previous: previous.income, tone: 'text-income' },
    { label: 'Keluar', current: current.expense, previous: previous.expense, tone: 'text-expense' },
    { label: 'Selisih', current: current.net, previous: previous.net, tone: current.net < 0 ? 'text-expense' : 'text-foreground' },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Laporan</h1>
      <MonthPicker month={month} />

      <Card>
        <CardHeader>
          <CardTitle>
            {monthLabel(parseMonthKey(month))} vs {monthLabel(parseMonthKey(prevMonth))}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Pos</th>
                  <th className="px-3 py-2 text-right font-medium">Bulan ini</th>
                  <th className="px-3 py-2 text-right font-medium">Bulan lalu</th>
                  <th className="px-3 py-2 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const delta = row.current - row.previous;
                  return (
                    <tr key={row.label}>
                      <td className="px-3 py-2.5 font-medium">{row.label}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${row.tone}`}>
                        {formatIdr(row.current)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatIdr(row.previous)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums ${
                          delta === 0 ? 'text-muted-foreground' : delta > 0 ? 'text-income' : 'text-expense'
                        }`}
                      >
                        {delta === 0 ? '—' : formatIdrSigned(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tren 6 bulan</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyTrend
            data={trend.map((point) => ({
              label: monthLabel(parseMonthKey(point.month)),
              income: point.income,
              expense: point.expense,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pengeluaran per kategori — {monthLabel(parseMonthKey(month))}</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryDonut
            data={categoryTotals.expense.map((item) => ({
              name: item.name,
              value: item.total,
              color: item.color,
            }))}
            emptyLabel="Belum ada pengeluaran bulan ini"
          />
        </CardContent>
      </Card>

      {tagTotals.expense.length > 0 || tagTotals.income.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Per tag — {monthLabel(parseMonthKey(month))}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TagBarList
              items={tagTotals.expense.map((item) => ({ tag: item.tag, total: item.total }))}
              tone="expense"
              emptyLabel="Belum ada pengeluaran bertag bulan ini"
            />
            {tagTotals.income.length > 0 ? (
              <TagBarList
                items={tagTotals.income.map((item) => ({ tag: item.tag, total: item.total }))}
                tone="income"
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {categoryTotals.income.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pemasukan per kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {categoryTotals.income.map((item) => {
                const max = Math.max(...categoryTotals.income.map((entry) => entry.total), 1);
                const width = Math.max(Math.round((item.total / max) * 100), 4);
                return (
                  <li key={`${item.categoryId}-${item.name}`} className="text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {item.icon ? `${item.icon} ` : ''}
                        {item.name}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-income">
                        +{formatIdr(item.total)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-income" style={{ width: `${width}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function TagBarList({
  items,
  tone,
  emptyLabel,
}: {
  items: { tag: string; total: number }[];
  tone: 'income' | 'expense';
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return emptyLabel ? <p className="text-xs text-muted-foreground">{emptyLabel}</p> : null;
  }
  const max = Math.max(...items.map((item) => item.total), 1);
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const width = Math.max(Math.round((item.total / max) * 100), 4);
        return (
          <li key={item.tag} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/transactions?tag=${encodeURIComponent(item.tag)}`}
                className="min-w-0 truncate font-medium text-primary hover:underline"
              >
                #{item.tag}
              </Link>
              <span
                className={cn(
                  'shrink-0 font-medium tabular-nums',
                  tone === 'income' ? 'text-income' : 'text-expense',
                )}
              >
                {tone === 'income' ? '+' : '−'}
                {formatIdr(item.total)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', tone === 'income' ? 'bg-income' : 'bg-expense')}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
