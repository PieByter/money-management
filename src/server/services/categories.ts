import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { categories, transactions, type Category, type CategoryKind } from '../db/schema';

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  icon?: string | null;
  color?: string | null;
}

export async function listCategories(
  db: AppDb,
  userId: string,
  opts: { kind?: CategoryKind; includeArchived?: boolean } = {},
): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        opts.kind ? eq(categories.kind, opts.kind) : undefined,
        opts.includeArchived ? undefined : isNull(categories.archivedAt),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

async function nextSortOrder(db: AppDb, userId: string, kind: CategoryKind): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${categories.sortOrder}), 0) + 1` })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, kind)));
  return Number(row?.value ?? 1);
}

export async function createCategory(
  db: AppDb,
  userId: string,
  input: CategoryInput,
): Promise<Category> {
  const [row] = await db
    .insert(categories)
    .values({
      userId,
      name: input.name,
      kind: input.kind,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: await nextSortOrder(db, userId, input.kind),
    })
    .returning();
  return row;
}

export interface CategoryPatch {
  name?: string;
  icon?: string | null;
  color?: string | null;
}

export async function updateCategory(
  db: AppDb,
  userId: string,
  categoryId: string,
  patch: CategoryPatch,
): Promise<Category> {
  const [row] = await db
    .update(categories)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    })
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
    .returning();
  if (!row) throw new Error('Kategori tidak ditemukan');
  return row;
}

export async function setCategoryArchived(
  db: AppDb,
  userId: string,
  categoryId: string,
  archived: boolean,
): Promise<Category> {
  const [row] = await db
    .update(categories)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
    .returning();
  if (!row) throw new Error('Kategori tidak ditemukan');
  return row;
}

export type DeleteCategoryResult = { deleted: true } | { deleted: false; reason: 'in_use' };

export async function deleteCategory(
  db: AppDb,
  userId: string,
  categoryId: string,
): Promise<DeleteCategoryResult> {
  const [used] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.categoryId, categoryId),
        isNull(transactions.deletedAt),
      ),
    );
  if (Number(used?.value ?? 0) > 0) {
    return { deleted: false, reason: 'in_use' };
  }
  await db
    .delete(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)));
  return { deleted: true };
}

/** Id kategori "Biaya Admin" (untuk fee transfer), bila ada. */
export async function findFeeCategoryId(db: AppDb, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.kind, 'expense'),
        eq(categories.name, 'Biaya Admin'),
        isNull(categories.archivedAt),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
