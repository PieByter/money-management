import { eq } from 'drizzle-orm';
import { jakartaDateAtNoonUtc, jakartaInstantFromYmdTime } from '@/lib/dates';
import type { CsvImportRow } from '@/lib/schemas';
import type { AppDb } from '../db/client';
import { categories, transactions, wallets } from '../db/schema';
import { ServiceError } from './errors';

export interface ImportResult {
  imported: number;
  walletsCreated: number;
  categoriesCreated: number;
}

/**
 * Impor baris CSV ke ledger. Kantong/kategori dicocokkan berdasarkan nama
 * (case-insensitive); yang belum ada dibuat otomatis. Semua baris masuk dalam
 * satu transaksi DB, jadi kegagalan satu baris membatalkan seluruh impor.
 */
export async function importTransactions(
  db: AppDb,
  userId: string,
  rows: CsvImportRow[],
): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    const txDb = tx as AppDb;
    const walletRows = await txDb.select().from(wallets).where(eq(wallets.userId, userId));
    const categoryRows = await txDb
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));

    const walletByName = new Map(walletRows.map((wallet) => [wallet.name.toLowerCase(), wallet]));
    const categoryByName = new Map(
      categoryRows.map((category) => [`${category.kind}:${category.name.toLowerCase()}`, category]),
    );
    let maxWalletOrder = walletRows.reduce((max, wallet) => Math.max(max, wallet.sortOrder), 0);
    let maxExpenseOrder = categoryRows
      .filter((category) => category.kind === 'expense')
      .reduce((max, category) => Math.max(max, category.sortOrder), 0);
    let maxIncomeOrder = categoryRows
      .filter((category) => category.kind === 'income')
      .reduce((max, category) => Math.max(max, category.sortOrder), 0);

    let walletsCreated = 0;
    let categoriesCreated = 0;

    const values: (typeof transactions.$inferInsert)[] = [];
    for (const row of rows) {
      const walletKey = row.walletName.toLowerCase();
      let wallet = walletByName.get(walletKey);
      if (!wallet) {
        maxWalletOrder += 1;
        const [created] = await txDb
          .insert(wallets)
          .values({
            userId,
            name: row.walletName,
            type: 'other',
            icon: '📥',
            sortOrder: maxWalletOrder,
          })
          .returning();
        wallet = created;
        walletByName.set(walletKey, created);
        walletsCreated += 1;
      }

      let categoryId: string | null = null;
      const kind = row.kind === 'income' ? 'income' : row.kind === 'expense' ? 'expense' : null;
      const categoryName = row.categoryName?.trim();
      if (kind && categoryName) {
        const categoryKey = `${kind}:${categoryName.toLowerCase()}`;
        let category = categoryByName.get(categoryKey);
        if (!category) {
          if (kind === 'expense') maxExpenseOrder += 1;
          else maxIncomeOrder += 1;
          const [created] = await txDb
            .insert(categories)
            .values({
              userId,
              name: categoryName,
              kind,
              icon: '📥',
              sortOrder: kind === 'expense' ? maxExpenseOrder : maxIncomeOrder,
            })
            .returning();
          category = created;
          categoryByName.set(categoryKey, created);
          categoriesCreated += 1;
        }
        categoryId = category.id;
      }

      values.push({
        userId,
        walletId: wallet.id,
        kind: row.kind,
        amount: row.amount,
        categoryId,
        groupId: row.groupId ?? null,
        occurredAt: row.time
          ? jakartaInstantFromYmdTime(row.date, row.time)
          : jakartaDateAtNoonUtc(row.date),
        note: row.note?.trim() ? row.note.trim() : null,
        tags: row.tags ?? [],
        source: 'import',
        status: 'confirmed',
      });
    }

    if (values.length === 0) throw new ServiceError('Tidak ada baris untuk diimpor');
    await txDb.insert(transactions).values(values);

    return { imported: values.length, walletsCreated, categoriesCreated };
  });
}
