import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { jakartaYmd, monthRangeFromKey } from '@/lib/dates';
import type { AppDb } from '../db/client';
import { budgetSettings, budgets, categories, transactions } from '../db/schema';
import { ServiceError } from './transactions';

export interface BudgetEntry {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  amount: number;
  enabled: boolean;
}

export async function listBudgets(db: AppDb, userId: string): Promise<BudgetEntry[]> {
  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      amount: budgets.amount,
      enabled: budgets.enabled,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(eq(budgets.userId, userId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

/** Budget hanya untuk kategori pengeluaran milik user sendiri. */
async function assertExpenseCategory(db: AppDb, userId: string, categoryId: string): Promise<void> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.userId, userId),
        eq(categories.kind, 'expense'),
      ),
    )
    .limit(1);
  if (!row) throw new ServiceError('Kategori pengeluaran tidak ditemukan');
}

/** Simpan nominal budget dan sekaligus menyalakannya. */
export async function saveBudget(
  db: AppDb,
  userId: string,
  input: { categoryId: string; amount: number },
): Promise<void> {
  await assertExpenseCategory(db, userId, input.categoryId);
  const now = new Date();
  await db
    .insert(budgets)
    .values({ userId, categoryId: input.categoryId, amount: input.amount })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId],
      set: { amount: input.amount, enabled: true, updatedAt: now },
    });
}

export async function setBudgetEnabled(
  db: AppDb,
  userId: string,
  categoryId: string,
  enabled: boolean,
): Promise<void> {
  const updated = await db
    .update(budgets)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)))
    .returning({ id: budgets.id });
  if (updated.length === 0) {
    throw new ServiceError('Budget untuk kategori ini belum diatur');
  }
}

/** Pagu belanja total bulanan user, null bila belum diatur. */
export async function getMonthlyBudget(db: AppDb, userId: string): Promise<number | null> {
  const [row] = await db
    .select({ monthlyBudget: budgetSettings.monthlyBudget })
    .from(budgetSettings)
    .where(eq(budgetSettings.userId, userId))
    .limit(1);
  return row ? Number(row.monthlyBudget) : null;
}

export async function saveMonthlyBudget(
  db: AppDb,
  userId: string,
  amount: number,
): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ServiceError('Nominal budget tidak valid');
  }
  await db
    .insert(budgetSettings)
    .values({ userId, monthlyBudget: amount })
    .onConflictDoUpdate({
      target: budgetSettings.userId,
      set: { monthlyBudget: amount, updatedAt: new Date() },
    });
}

export async function clearMonthlyBudget(db: AppDb, userId: string): Promise<void> {
  await db.delete(budgetSettings).where(eq(budgetSettings.userId, userId));
}

export interface MonthlyBudgetProgress {
  limit: number;
  spent: number;
  remaining: number;
  ratio: number;
  over: boolean;
  daysInMonth: number;
  daysLeft: number;
  /** Sisa budget dibagi hari tersisa; 0 bila sudah lewat/over. */
  safePerDay: number;
}

/**
 * Progres pagu bulanan. Pengeluaran pinjaman (tag `hutang`/`piutang`) tidak
 * dihitung supaya angsuran tidak "memakan" budget belanja harian.
 */
export async function getMonthlyBudgetProgress(
  db: AppDb,
  userId: string,
  month: string,
): Promise<MonthlyBudgetProgress | null> {
  const limit = await getMonthlyBudget(db, userId);
  if (limit === null) return null;

  const { start, end } = monthRangeFromKey(month);
  const [row] = await db
    .select({ spent: sql<number>`coalesce(sum(${transactions.amount}), 0)::bigint` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, 'expense'),
        eq(transactions.status, 'confirmed'),
        isNull(transactions.deletedAt),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
        sql`not ('hutang' = any(${transactions.tags}) or 'piutang' = any(${transactions.tags}))`,
      ),
    );

  const spent = Number(row?.spent ?? 0);
  const remaining = limit - spent;
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const todayYmd = jakartaYmd(new Date());
  const todayMonth = todayYmd.slice(0, 7);
  let daysLeft: number;
  if (month < todayMonth) daysLeft = 0;
  else if (month > todayMonth) daysLeft = daysInMonth;
  else daysLeft = Math.max(daysInMonth - Number(todayYmd.slice(8, 10)) + 1, 1);

  return {
    limit,
    spent,
    remaining,
    ratio: limit > 0 ? spent / limit : 0,
    over: spent > limit,
    daysInMonth,
    daysLeft,
    safePerDay: daysLeft > 0 && remaining > 0 ? Math.floor(remaining / daysLeft) : 0,
  };
}

export interface BudgetProgress {
  categoryId: string;
  name: string;
  icon: string | null;
  color: string | null;
  limit: number;
  spent: number;
  remaining: number;
  ratio: number;
  over: boolean;
}

/** Pemakaian budget bulan tertentu (hanya budget yang aktif). */
export async function getBudgetProgress(
  db: AppDb,
  userId: string,
  month: string,
): Promise<BudgetProgress[]> {
  const { start, end } = monthRangeFromKey(month);
  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      sortOrder: categories.sortOrder,
      limit: budgets.amount,
      spent: sql<number>`coalesce(sum(${transactions.amount}), 0)::bigint`,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .leftJoin(
      transactions,
      and(
        eq(transactions.categoryId, budgets.categoryId),
        eq(transactions.userId, budgets.userId),
        eq(transactions.kind, 'expense'),
        eq(transactions.status, 'confirmed'),
        isNull(transactions.deletedAt),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    )
    .where(and(eq(budgets.userId, userId), eq(budgets.enabled, true)))
    .groupBy(
      budgets.categoryId,
      categories.name,
      categories.icon,
      categories.color,
      categories.sortOrder,
      budgets.amount,
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return rows.map((row) => {
    const limit = Number(row.limit);
    const spent = Number(row.spent);
    return {
      categoryId: row.categoryId,
      name: row.name,
      icon: row.icon,
      color: row.color,
      limit,
      spent,
      remaining: limit - spent,
      ratio: limit > 0 ? spent / limit : 0,
      over: spent > limit,
    };
  });
}
