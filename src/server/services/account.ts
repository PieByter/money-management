import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { budgets, categories, transactions, wallets } from '../db/schema';

/**
 * Menghapus seluruh data milik user (hard delete, bukan soft delete) — dipakai
 * untuk fitur hapus akun. Urutan penting karena `transactions.wallet_id`
 * tidak memakai on delete cascade.
 */
export async function wipeUserData(db: AppDb, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx.delete(budgets).where(eq(budgets.userId, userId));
    await tx.delete(wallets).where(eq(wallets.userId, userId));
    await tx.delete(categories).where(eq(categories.userId, userId));
  });
}
