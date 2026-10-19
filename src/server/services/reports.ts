import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { categories, transactions, wallets, walletBalances } from '../db/schema';
import { monthRangeFromKey, shiftMonthKey } from '@/lib/dates';
import { listTransactions, type TransactionListItem } from './transactions';

function numberOrZero(value: unknown): number {
  return Number(value ?? 0);
}

export interface MonthSummary {
  income: number;
  expense: number;
  net: number;
}

export async function getMonthSummary(
  db: AppDb,
  userId: string,
  month: string,
): Promise<MonthSummary> {
  const { start, end } = monthRangeFromKey(month);
  const rows = await db
    .select({
      kind: transactions.kind,
      total: sql<number>`sum(${transactions.amount})::bigint`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, 'confirmed'),
        inArray(transactions.kind, ['income', 'expense']),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    )
    .groupBy(transactions.kind);

  const income = numberOrZero(rows.find((r) => r.kind === 'income')?.total);
  const expense = numberOrZero(rows.find((r) => r.kind === 'expense')?.total);
  return { income, expense, net: income - expense };
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  kind: 'income' | 'expense';
  total: number;
}

export async function getCategoryTotals(
  db: AppDb,
  userId: string,
  range: { start: Date; end: Date },
): Promise<{ expense: CategoryTotal[]; income: CategoryTotal[] }> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      name: sql<string>`coalesce(${categories.name}, 'Tanpa kategori')`,
      icon: categories.icon,
      color: categories.color,
      kind: transactions.kind,
      total: sql<number>`sum(${transactions.amount})::bigint`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, 'confirmed'),
        inArray(transactions.kind, ['income', 'expense']),
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
      ),
    )
    .groupBy(transactions.categoryId, categories.name, categories.icon, categories.color, transactions.kind)
    .orderBy(desc(sql`sum(${transactions.amount})`));

  const mapped = rows.map((row) => ({
    ...row,
    kind: row.kind as 'income' | 'expense',
    total: numberOrZero(row.total),
  }));
  return {
    expense: mapped.filter((r) => r.kind === 'expense'),
    income: mapped.filter((r) => r.kind === 'income'),
  };
}

export interface TagTotal {
  tag: string;
  total: number;
}

/** Total per tag dalam rentang tanggal — dihitung dari array `tags` transaksi. */
export async function getTagTotals(
  db: AppDb,
  userId: string,
  range: { start: Date; end: Date },
): Promise<{ expense: TagTotal[]; income: TagTotal[] }> {
  const rows = await db
    .select({
      tag: sql<string>`tag_name`,
      kind: sql<string>`kind`,
      total: sql<number>`sum(${transactions.amount})::bigint`,
    })
    .from(sql`${transactions}, unnest(${transactions.tags}) as tag_name`)
    .where(
      sql`${transactions.userId} = ${userId}
          and ${transactions.deletedAt} is null
          and ${transactions.status} = 'confirmed'
          and ${transactions.kind} in ('income','expense')
          and ${transactions.occurredAt} >= ${range.start}
          and ${transactions.occurredAt} < ${range.end}`,
    )
    .groupBy(sql`tag_name, kind`)
    .orderBy(sql`sum(${transactions.amount}) desc`);

  const mapped = rows.map((row) => ({
    tag: row.tag,
    kind: row.kind as 'income' | 'expense',
    total: numberOrZero(row.total),
  }));
  return {
    expense: mapped.filter((row) => row.kind === 'expense'),
    income: mapped.filter((row) => row.kind === 'income'),
  };
}

export interface DailyTotal {
  ymd: string;
  income: number;
  expense: number;
}

/** Pengelompokan hari memakai kalender WIB (+7 jam), bebas dari timezone sesi. */
const dayExpression = sql<string>`to_char((${transactions.occurredAt} + interval '7 hours') at time zone 'UTC', 'YYYY-MM-DD')`;

export async function getDailyTotals(
  db: AppDb,
  userId: string,
  range: { start: Date; end: Date },
): Promise<DailyTotal[]> {
  const rows = await db
    .select({
      ymd: dayExpression.as('ymd'),
      kind: transactions.kind,
      total: sql<number>`sum(${transactions.amount})::bigint`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, 'confirmed'),
        inArray(transactions.kind, ['income', 'expense']),
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
      ),
    )
    .groupBy(dayExpression, transactions.kind)
    .orderBy(asc(dayExpression));

  const byDay = new Map<string, DailyTotal>();
  for (const row of rows) {
    const entry = byDay.get(row.ymd) ?? { ymd: row.ymd, income: 0, expense: 0 };
    if (row.kind === 'income') entry.income = numberOrZero(row.total);
    else entry.expense = numberOrZero(row.total);
    byDay.set(row.ymd, entry);
  }
  return [...byDay.values()];
}

const monthExpression = sql<string>`to_char((${transactions.occurredAt} + interval '7 hours') at time zone 'UTC', 'YYYY-MM')`;

export interface MonthTrendPoint {
  month: string;
  income: number;
  expense: number;
}

export async function getMonthlyTrend(
  db: AppDb,
  userId: string,
  opts: { endMonth: string; months?: number },
): Promise<MonthTrendPoint[]> {
  const months = opts.months ?? 6;
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    keys.push(shiftMonthKey(opts.endMonth, -i));
  }
  const first = keys[0];
  const { start } = monthRangeFromKey(first);
  const { end } = monthRangeFromKey(opts.endMonth);

  const rows = await db
    .select({
      month: monthExpression.as('month'),
      kind: transactions.kind,
      total: sql<number>`sum(${transactions.amount})::bigint`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, 'confirmed'),
        inArray(transactions.kind, ['income', 'expense']),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    )
    .groupBy(monthExpression, transactions.kind);

  const byMonth = new Map<string, MonthTrendPoint>(
    keys.map((month) => [month, { month, income: 0, expense: 0 }]),
  );
  for (const row of rows) {
    const entry = byMonth.get(row.month);
    if (!entry) continue;
    if (row.kind === 'income') entry.income = numberOrZero(row.total);
    else entry.expense = numberOrZero(row.total);
  }
  return keys.map((key) => byMonth.get(key)!);
}

export interface AssetOverview {
  total: number;
  wallets: {
    id: string;
    name: string;
    type: string;
    icon: string | null;
    color: string | null;
    balance: number;
  }[];
}

export async function getAssetOverview(
  db: AppDb,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<AssetOverview> {
  const rows = await db
    .select({
      id: wallets.id,
      name: wallets.name,
      type: wallets.type,
      icon: wallets.icon,
      color: wallets.color,
      sortOrder: wallets.sortOrder,
      balance: sql<number>`coalesce(${walletBalances.balance}, 0)::bigint`,
    })
    .from(wallets)
    .leftJoin(walletBalances, eq(walletBalances.walletId, wallets.id))
    .where(
      and(
        eq(wallets.userId, userId),
        opts.includeArchived ? undefined : isNull(wallets.archivedAt),
      ),
    )
    .orderBy(asc(wallets.sortOrder), asc(wallets.createdAt));

  const mapped = rows.map((row) => ({ ...row, balance: numberOrZero(row.balance) }));
  return { total: mapped.reduce((sum, row) => sum + row.balance, 0), wallets: mapped };
}

/** Kategori yang paling sering dipakai (90 hari terakhir), untuk chip cepat. */
export async function getFrequentCategories(
  db: AppDb,
  userId: string,
  kind: 'income' | 'expense',
  limit = 8,
): Promise<{ id: string; name: string; icon: string | null; color: string | null; usage: number }[]> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      sortOrder: categories.sortOrder,
      usage: sql<number>`count(${transactions.id})::int`,
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(
        eq(transactions.categoryId, categories.id),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, 'confirmed'),
        gte(transactions.occurredAt, since),
      ),
    )
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.kind, kind),
        isNull(categories.archivedAt),
      ),
    )
    .groupBy(categories.id, categories.name, categories.icon, categories.color, categories.sortOrder)
    .orderBy(desc(sql`count(${transactions.id})`), asc(categories.sortOrder), asc(categories.name))
    .limit(limit);

  return rows.map((row) => ({ ...row, usage: numberOrZero(row.usage) }));
}

/** Kantong yang terakhir dipakai, untuk default smart di form. */
export async function getLastUsedWalletId(db: AppDb, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ walletId: transactions.walletId })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.occurredAt))
    .limit(1);
  return row?.walletId ?? null;
}

export async function getRecentTransactions(
  db: AppDb,
  userId: string,
  limit = 5,
): Promise<TransactionListItem[]> {
  const { items } = await listTransactions(db, userId, { limit });
  return items;
}
