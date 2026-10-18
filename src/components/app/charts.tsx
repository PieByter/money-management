'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatIdr, formatIdrCompact } from '@/lib/money';

const FALLBACK_COLORS = [
  '#10b981',
  '#0ea5e9',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#f97316',
  '#14b8a6',
  '#ef4444',
];

export interface CategoryDatum {
  name: string;
  value: number;
  color?: string | null;
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function CategoryDonut({
  data,
  emptyLabel = 'Belum ada data bulan ini',
}: {
  data: CategoryDatum[];
  emptyLabel?: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return <ChartEmpty label={emptyLabel} />;

  const colored = data.map((item, index) => ({
    ...item,
    fill: item.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
  }));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={colored}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
            >
              {colored.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatIdr(Number(value))}
              contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }}
              itemStyle={{ color: 'var(--foreground)' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-muted-foreground">Total</span>
          <span className="text-sm font-semibold tabular-nums">{formatIdrCompact(total)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {colored.slice(0, 6).map((item) => (
          <li key={item.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: item.fill }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round((item.value / total) * 100)}%
            </span>
            <span className="tabular-nums font-medium">{formatIdr(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface TrendDatum {
  label: string;
  income?: number;
  expense?: number;
}

export function DailyTrend({
  data,
  emptyLabel = 'Belum ada pengeluaran bulan ini',
}: {
  data: TrendDatum[];
  emptyLabel?: string;
}) {
  const hasData = data.some((item) => (item.expense ?? 0) > 0 || (item.income ?? 0) > 0);
  if (!hasData) return <ChartEmpty label={emptyLabel} />;

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip
            formatter={(value) => formatIdr(Number(value))}
            labelFormatter={(label) => `Tanggal ${label}`}
            contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }}
            itemStyle={{ color: 'var(--foreground)' }}
            cursor={{ fill: 'var(--muted)' }}
          />
          <Bar dataKey="expense" name="Keluar" fill="var(--expense)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="income" name="Masuk" fill="var(--income)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyTrend({
  data,
  emptyLabel = 'Belum ada data untuk dibandingkan',
}: {
  data: { label: string; income: number; expense: number }[];
  emptyLabel?: string;
}) {
  const hasData = data.some((item) => item.income > 0 || item.expense > 0);
  if (!hasData) return <ChartEmpty label={emptyLabel} />;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          />
          <YAxis
            width={52}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickFormatter={(value) => formatIdrCompact(Number(value))}
          />
          <Tooltip
            formatter={(value) => formatIdr(Number(value))}
            contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }}
            itemStyle={{ color: 'var(--foreground)' }}
            cursor={{ fill: 'var(--muted)' }}
          />
          <Bar dataKey="income" name="Masuk" fill="var(--income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Keluar" fill="var(--expense)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
