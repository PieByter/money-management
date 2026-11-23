import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  budgetSettings,
  budgets,
  categories,
  channelLinkTokens,
  channelLinks,
  debtPayments,
  debts,
  goals,
  ingestEvents,
  items,
  transactionTemplates,
  transactions,
  wallets,
} from '../db/schema';

/**
 * Menghapus seluruh data milik user (hard delete, bukan soft delete) — dipakai
 * untuk fitur hapus akun. Urutan penting karena `transactions.wallet_id`
 * tidak memakai on delete cascade. `transaction_items` ikut terhapus lewat
 * cascade dari `transactions`.
 */
export async function wipeUserDataTx(tx: AppDb, userId: string): Promise<void> {
  // Kanal eksternal + anak-anak yang mereferensikan transaksi/kantong.
  await tx.delete(ingestEvents).where(eq(ingestEvents.userId, userId));
  await tx.delete(channelLinkTokens).where(eq(channelLinkTokens.userId, userId));
  await tx.delete(channelLinks).where(eq(channelLinks.userId, userId));
  await tx.delete(debtPayments).where(eq(debtPayments.userId, userId));
  await tx.delete(debts).where(eq(debts.userId, userId));
  await tx.delete(transactionTemplates).where(eq(transactionTemplates.userId, userId));
  await tx.delete(goals).where(eq(goals.userId, userId));
  await tx.delete(transactions).where(eq(transactions.userId, userId));
  await tx.delete(budgets).where(eq(budgets.userId, userId));
  await tx.delete(budgetSettings).where(eq(budgetSettings.userId, userId));
  await tx.delete(items).where(eq(items.userId, userId));
  await tx.delete(wallets).where(eq(wallets.userId, userId));
  await tx.delete(categories).where(eq(categories.userId, userId));
}

export async function wipeUserData(db: AppDb, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await wipeUserDataTx(tx as AppDb, userId);
  });
}
