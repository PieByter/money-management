import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { RECOMMENDED_WALLETS } from '@/lib/wallet-presets';
import type { AppDb } from '../db/client';
import {
  debts,
  goals,
  transactions,
  wallets,
  walletBalances,
  type Wallet,
  type WalletType,
} from '../db/schema';

export interface WalletWithBalance {
  id: string;
  name: string;
  type: WalletType;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  currency: string;
  creditLimit: number | null;
  statementDay: number | null;
  dueDay: number | null;
  archivedAt: Date | null;
  balance: number;
}

export interface WalletInput {
  name: string;
  type: WalletType;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  creditLimit?: number | null;
  statementDay?: number | null;
  dueDay?: number | null;
  /**
   * Saldo awal; dicatat sebagai transaksi adjustment_in (bukan kolom saldo).
   * Untuk kartu kredit, angka ini adalah tagihan awal dan dicatat sebagai
   * adjustment_out sehingga saldo langsung negatif.
   */
  openingBalance?: number;
}

const walletSelection = {
  id: wallets.id,
  name: wallets.name,
  type: wallets.type,
  color: wallets.color,
  icon: wallets.icon,
  sortOrder: wallets.sortOrder,
  currency: wallets.currency,
  creditLimit: wallets.creditLimit,
  statementDay: wallets.statementDay,
  dueDay: wallets.dueDay,
  archivedAt: wallets.archivedAt,
  balance: sql<number>`coalesce(${walletBalances.balance}, 0)::bigint`,
};

export async function listWallets(
  db: AppDb,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<WalletWithBalance[]> {
  const rows = await db
    .select(walletSelection)
    .from(wallets)
    .leftJoin(walletBalances, eq(walletBalances.walletId, wallets.id))
    .where(
      and(
        eq(wallets.userId, userId),
        opts.includeArchived ? undefined : isNull(wallets.archivedAt),
      ),
    )
    .orderBy(asc(wallets.sortOrder), asc(wallets.createdAt));

  return rows.map((row) => ({ ...row, balance: Number(row.balance ?? 0) }));
}

export async function getWallet(
  db: AppDb,
  userId: string,
  walletId: string,
): Promise<WalletWithBalance | null> {
  const rows = await db
    .select(walletSelection)
    .from(wallets)
    .leftJoin(walletBalances, eq(walletBalances.walletId, wallets.id))
    .where(and(eq(wallets.userId, userId), eq(wallets.id, walletId)))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, balance: Number(row.balance ?? 0) } : null;
}

async function nextSortOrder(db: AppDb, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${wallets.sortOrder}), 0) + 1` })
    .from(wallets)
    .where(eq(wallets.userId, userId));
  return Number(row?.value ?? 1);
}

/**
 * Tambahkan kantong rekomendasi (Cash, OVO, GoPay, ShopeePay, Bank Mandiri,
 * Bank Permata, Bank Jago, Kartu e-Money) yang belum ada — idempotent
 * (ON CONFLICT DO NOTHING pada unique index nama per user).
 * @returns jumlah kantong yang benar-benar dibuat.
 */
export async function createRecommendedWallets(db: AppDb, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${wallets.sortOrder}), 0)::int` })
    .from(wallets)
    .where(eq(wallets.userId, userId));
  const startOrder = Number(row?.value ?? 0);

  const inserted = await db
    .insert(wallets)
    .values(
      RECOMMENDED_WALLETS.map((preset, index) => ({
        userId,
        name: preset.name,
        type: preset.type,
        icon: preset.icon,
        color: preset.color,
        sortOrder: startOrder + index + 1,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: wallets.id });

  return inserted.length;
}

function validateCreditFields(input: {
  type: WalletType;
  creditLimit?: number | null;
  statementDay?: number | null;
  dueDay?: number | null;
}): void {
  if (input.type !== 'credit') return;
  if (!input.creditLimit || !Number.isSafeInteger(input.creditLimit) || input.creditLimit <= 0) {
    throw new Error('Limit kartu kredit wajib diisi');
  }
  for (const day of [input.statementDay, input.dueDay]) {
    if (day !== null && day !== undefined && (!Number.isInteger(day) || day < 1 || day > 31)) {
      throw new Error('Tanggal statement/jatuh tempo harus 1-31');
    }
  }
}

export async function createWallet(db: AppDb, userId: string, input: WalletInput): Promise<Wallet> {
  validateCreditFields(input);
  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .insert(wallets)
      .values({
        userId,
        name: input.name,
        type: input.type,
        color: input.color ?? null,
        icon: input.icon ?? null,
        sortOrder: input.sortOrder ?? (await nextSortOrder(tx as AppDb, userId)),
        creditLimit: input.type === 'credit' ? (input.creditLimit ?? null) : null,
        statementDay: input.type === 'credit' ? (input.statementDay ?? null) : null,
        dueDay: input.type === 'credit' ? (input.dueDay ?? null) : null,
      })
      .returning();

    if (input.openingBalance && input.openingBalance > 0) {
      await tx.insert(transactions).values({
        userId,
        walletId: wallet.id,
        kind: input.type === 'credit' ? 'adjustment_out' : 'adjustment_in',
        amount: input.openingBalance,
        occurredAt: new Date(),
        note: input.type === 'credit' ? 'Tagihan awal kartu kredit' : 'Saldo awal',
      });
    }

    return wallet;
  });
}

export interface WalletPatch {
  name?: string;
  type?: WalletType;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  creditLimit?: number | null;
  statementDay?: number | null;
  dueDay?: number | null;
}

export async function updateWallet(
  db: AppDb,
  userId: string,
  walletId: string,
  patch: WalletPatch,
): Promise<Wallet> {
  const [current] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.id, walletId)))
    .limit(1);
  if (!current) throw new Error('Kantong tidak ditemukan');
  const nextType = patch.type ?? current.type;
  validateCreditFields({
    type: nextType,
    creditLimit: patch.creditLimit ?? current.creditLimit,
    statementDay: patch.statementDay ?? current.statementDay,
    dueDay: patch.dueDay ?? current.dueDay,
  });

  const [row] = await db
    .update(wallets)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.creditLimit !== undefined ? { creditLimit: patch.creditLimit } : {}),
      ...(patch.statementDay !== undefined ? { statementDay: patch.statementDay } : {}),
      ...(patch.dueDay !== undefined ? { dueDay: patch.dueDay } : {}),
      ...(nextType !== 'credit'
        ? { creditLimit: null, statementDay: null, dueDay: null }
        : {}),
    })
    .where(and(eq(wallets.userId, userId), eq(wallets.id, walletId)))
    .returning();
  if (!row) throw new Error('Kantong tidak ditemukan');
  return row;
}

export async function setWalletArchived(
  db: AppDb,
  userId: string,
  walletId: string,
  archived: boolean,
): Promise<Wallet> {
  const [row] = await db
    .update(wallets)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(wallets.userId, userId), eq(wallets.id, walletId)))
    .returning();
  if (!row) throw new Error('Kantong tidak ditemukan');
  return row;
}

export type DeleteWalletResult = { deleted: true } | { deleted: false; reason: 'has_transactions' };

export async function deleteWallet(
  db: AppDb,
  userId: string,
  walletId: string,
): Promise<DeleteWalletResult> {
  const [used] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.walletId, walletId)));
  if (Number(used?.value ?? 0) > 0) {
    return { deleted: false, reason: 'has_transactions' };
  }
  // Kantong yang masih dipakai catatan hutang/piutang tidak boleh dihapus
  // (FK akan menolak); arahkan user untuk mengarsipkan saja.
  const [debtRef] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(debts)
    .where(
      and(
        eq(debts.userId, userId),
        or(eq(debts.fundingWalletId, walletId), eq(debts.paymentWalletId, walletId)),
      ),
    );
  if (Number(debtRef?.value ?? 0) > 0) {
    return { deleted: false, reason: 'has_transactions' };
  }
  const [goalRef] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.walletId, walletId)));
  if (Number(goalRef?.value ?? 0) > 0) {
    return { deleted: false, reason: 'has_transactions' };
  }
  await db.delete(wallets).where(and(eq(wallets.userId, userId), eq(wallets.id, walletId)));
  return { deleted: true };
}
