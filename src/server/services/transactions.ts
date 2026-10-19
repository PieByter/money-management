import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  categories,
  transactions,
  wallets,
  walletBalances,
  type Transaction,
  type TransactionKind,
} from '../db/schema';
import { monthRangeFromKey } from '@/lib/dates';

export class ServiceError extends Error {}

const SIMPLE_KIND_SET = new Set(['income', 'expense']);
export type SimpleKind = 'income' | 'expense';

export function isSimpleKind(value: string): value is SimpleKind {
  return SIMPLE_KIND_SET.has(value);
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

async function findByIdempotencyKey(
  db: AppDb,
  userId: string,
  clientRequestId?: string | null,
): Promise<Transaction | null> {
  if (!clientRequestId) return null;
  const [row] = await db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), eq(transactions.clientRequestId, clientRequestId)),
    )
    .limit(1);
  return row ?? null;
}

async function assertWallet(db: AppDb, userId: string, walletId: string): Promise<void> {
  const [row] = await db
    .select({ id: wallets.id, archivedAt: wallets.archivedAt })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.id, walletId)))
    .limit(1);
  if (!row) throw new ServiceError('Kantong tidak ditemukan');
  if (row.archivedAt) throw new ServiceError('Kantong sudah diarsipkan');
}

async function assertCategory(
  db: AppDb,
  userId: string,
  categoryId: string,
  kind: SimpleKind,
): Promise<void> {
  const [row] = await db
    .select({ kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
    .limit(1);
  if (!row) throw new ServiceError('Kategori tidak ditemukan');
  if (row.kind !== kind) throw new ServiceError('Jenis kategori tidak sesuai tipe transaksi');
}

export interface SimpleTransactionInput {
  kind: SimpleKind;
  amount: number;
  walletId: string;
  categoryId?: string | null;
  occurredAt: Date;
  note?: string | null;
  tags?: string[];
  clientRequestId?: string | null;
  source?: 'web' | 'telegram' | 'whatsapp' | 'import';
}

export async function createTransaction(
  db: AppDb,
  userId: string,
  input: SimpleTransactionInput,
): Promise<Transaction> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new ServiceError('Nominal tidak valid');
  }
  await assertWallet(db, userId, input.walletId);
  if (input.categoryId) await assertCategory(db, userId, input.categoryId, input.kind);

  const existing = await findByIdempotencyKey(db, userId, input.clientRequestId);
  if (existing) return existing;

  try {
    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        walletId: input.walletId,
        kind: input.kind,
        amount: input.amount,
        categoryId: input.categoryId ?? null,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
        tags: input.tags ?? [],
        source: input.source ?? 'web',
        clientRequestId: input.clientRequestId ?? null,
      })
      .returning();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await findByIdempotencyKey(db, userId, input.clientRequestId);
      if (row) return row;
    }
    throw error;
  }
}

export interface TransferInput {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  feeAmount?: number;
  feeCategoryId?: string | null;
  occurredAt: Date;
  note?: string | null;
  clientRequestId?: string | null;
  source?: 'web' | 'telegram' | 'whatsapp' | 'import';
}

/**
 * Transfer = dua leg ledger (transfer_out + transfer_in) dengan group_id sama,
 * dibuat dalam satu transaksi database. Biaya admin opsional menjadi expense
 * terpisah di group yang sama (PRD 4).
 */
export async function createTransfer(
  db: AppDb,
  userId: string,
  input: TransferInput,
): Promise<{ groupId: string }> {
  if (input.fromWalletId === input.toWalletId) {
    throw new ServiceError('Kantong asal dan tujuan tidak boleh sama');
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new ServiceError('Nominal tidak valid');
  }
  const fee = input.feeAmount ?? 0;
  if (!Number.isSafeInteger(fee) || fee < 0) throw new ServiceError('Biaya admin tidak valid');

  await assertWallet(db, userId, input.fromWalletId);
  await assertWallet(db, userId, input.toWalletId);
  if (fee > 0 && input.feeCategoryId) {
    await assertCategory(db, userId, input.feeCategoryId, 'expense');
  }

  const existing = await findByIdempotencyKey(db, userId, input.clientRequestId);
  if (existing?.groupId) return { groupId: existing.groupId };

  const groupId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      const base = {
        userId,
        groupId,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
        source: input.source ?? 'web',
        status: 'confirmed' as const,
      };
      await tx.insert(transactions).values([
        {
          ...base,
          walletId: input.fromWalletId,
          kind: 'transfer_out',
          amount: input.amount,
          clientRequestId: input.clientRequestId ?? null,
        },
        {
          ...base,
          walletId: input.toWalletId,
          kind: 'transfer_in',
          amount: input.amount,
        },
      ]);
      if (fee > 0) {
        await tx.insert(transactions).values({
          ...base,
          walletId: input.fromWalletId,
          kind: 'expense',
          amount: fee,
          categoryId: input.feeCategoryId ?? null,
          note: 'Biaya admin',
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await findByIdempotencyKey(db, userId, input.clientRequestId);
      if (row?.groupId) return { groupId: row.groupId };
    }
    throw error;
  }

  return { groupId };
}

export interface UpdateSimpleInput {
  transactionId: string;
  kind?: SimpleKind;
  amount?: number;
  walletId?: string;
  categoryId?: string | null;
  occurredAt?: Date;
  note?: string | null;
  tags?: string[];
}

export async function updateTransaction(
  db: AppDb,
  userId: string,
  input: UpdateSimpleInput,
): Promise<Transaction> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, input.transactionId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new ServiceError('Transaksi tidak ditemukan');
  if (row.kind === 'transfer_in' || row.kind === 'transfer_out') {
    throw new ServiceError('Gunakan updateTransfer untuk transaksi transfer');
  }
  if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount <= 0)) {
    throw new ServiceError('Nominal tidak valid');
  }

  const nextKind: SimpleKind = input.kind ?? (row.kind as SimpleKind);
  if (input.walletId && input.walletId !== row.walletId) {
    await assertWallet(db, userId, input.walletId);
  }
  if (input.categoryId) await assertCategory(db, userId, input.categoryId, nextKind);

  const [updated] = await db
    .update(transactions)
    .set({
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.walletId !== undefined ? { walletId: input.walletId } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.userId, userId), eq(transactions.id, row.id)))
    .returning();
  return updated;
}

export interface UpdateTransferInput {
  transactionId: string;
  fromWalletId?: string;
  toWalletId?: string;
  amount?: number;
  feeAmount?: number;
  feeCategoryId?: string | null;
  occurredAt?: Date;
  note?: string | null;
}

/** Edit transfer mengubah kedua leg (dan baris fee) secara atomik. */
export async function updateTransfer(
  db: AppDb,
  userId: string,
  input: UpdateTransferInput,
): Promise<{ groupId: string }> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, input.transactionId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new ServiceError('Transaksi tidak ditemukan');
  if ((row.kind !== 'transfer_in' && row.kind !== 'transfer_out') || !row.groupId) {
    throw new ServiceError('Transaksi bukan bagian dari transfer');
  }
  if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount <= 0)) {
    throw new ServiceError('Nominal tidak valid');
  }
  if (input.feeAmount !== undefined && (!Number.isSafeInteger(input.feeAmount) || input.feeAmount < 0)) {
    throw new ServiceError('Biaya admin tidak valid');
  }

  return db.transaction(async (tx) => {
    const groupRows = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.groupId, row.groupId as string),
          isNull(transactions.deletedAt),
        ),
      );
    const outLeg = groupRows.find((r) => r.kind === 'transfer_out');
    const inLeg = groupRows.find((r) => r.kind === 'transfer_in');
    const feeRow = groupRows.find((r) => r.kind === 'expense');
    if (!outLeg || !inLeg) throw new ServiceError('Leg transfer tidak lengkap');

    const fromWalletId = input.fromWalletId ?? outLeg.walletId;
    const toWalletId = input.toWalletId ?? inLeg.walletId;
    if (fromWalletId === toWalletId) {
      throw new ServiceError('Kantong asal dan tujuan tidak boleh sama');
    }
    await assertWallet(tx as AppDb, userId, fromWalletId);
    await assertWallet(tx as AppDb, userId, toWalletId);

    const amount = input.amount ?? outLeg.amount;
    const occurredAt = input.occurredAt ?? outLeg.occurredAt;
    const note = input.note !== undefined ? input.note : outLeg.note;

    await tx
      .update(transactions)
      .set({ walletId: fromWalletId, amount, occurredAt, note, updatedAt: new Date() })
      .where(eq(transactions.id, outLeg.id));
    await tx
      .update(transactions)
      .set({ walletId: toWalletId, amount, occurredAt, note, updatedAt: new Date() })
      .where(eq(transactions.id, inLeg.id));

    if (input.feeAmount !== undefined) {
      if (input.feeAmount > 0) {
        if (input.feeCategoryId) {
          await assertCategory(tx as AppDb, userId, input.feeCategoryId, 'expense');
        }
        if (feeRow) {
          await tx
            .update(transactions)
            .set({
              amount: input.feeAmount,
              occurredAt,
              categoryId: input.feeCategoryId ?? feeRow.categoryId,
              updatedAt: new Date(),
            })
            .where(eq(transactions.id, feeRow.id));
        } else {
          await tx.insert(transactions).values({
            userId,
            walletId: fromWalletId,
            kind: 'expense',
            amount: input.feeAmount,
            categoryId: input.feeCategoryId ?? null,
            groupId: row.groupId,
            occurredAt,
            note: 'Biaya admin',
          });
        }
      } else if (feeRow) {
        const now = new Date();
        await tx
          .update(transactions)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(transactions.id, feeRow.id));
      }
    }

    return { groupId: row.groupId as string };
  });
}

export interface DeleteResult {
  /** Semua id baris yang ikut terhapus (transfer = kedua leg + fee). */
  ids: string[];
}

export async function deleteTransaction(
  db: AppDb,
  userId: string,
  transactionId: string,
): Promise<DeleteResult> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new ServiceError('Transaksi tidak ditemukan');

  const now = new Date();
  const isTransferLeg = row.kind === 'transfer_in' || row.kind === 'transfer_out';
  if (isTransferLeg && row.groupId) {
    // Menghapus transfer harus menghapus kedua leg + fee (satu group).
    const removed = await db
      .update(transactions)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.groupId, row.groupId),
          isNull(transactions.deletedAt),
        ),
      )
      .returning({ id: transactions.id });
    return { ids: removed.map((entry) => entry.id) };
  }
  await db
    .update(transactions)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(transactions.userId, userId), eq(transactions.id, row.id)));
  return { ids: [row.id] };
}

/** Membatalkan penghapusan (undo). Baris harus milik user yang sama. */
export async function restoreTransactions(
  db: AppDb,
  userId: string,
  transactionIds: string[],
): Promise<number> {
  const ids = [...new Set(transactionIds)];
  if (ids.length === 0) return 0;
  const restored = await db
    .update(transactions)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(transactions.userId, userId),
        inArray(transactions.id, ids),
        sql`${transactions.deletedAt} is not null`,
      ),
    )
    .returning({ id: transactions.id });
  return restored.length;
}

export interface TransactionFilter {
  month?: string;
  walletId?: string;
  categoryId?: string;
  kind?: SimpleKind | 'transfer' | 'adjustment';
  tag?: string;
  search?: string;
}

export interface TransactionListItem {
  id: string;
  kind: TransactionKind;
  amount: number;
  occurredAt: Date;
  note: string | null;
  tags: string[];
  groupId: string | null;
  walletId: string;
  walletName: string;
  walletIcon: string | null;
  walletColor: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  source: string;
  status: string;
}

function encodeCursor(item: { occurredAt: Date; id: string }): string {
  return `${item.occurredAt.toISOString()}|${item.id}`;
}

function decodeCursor(cursor: string): { occurredAt: Date; id: string } {
  const [iso, id] = cursor.split('|');
  return { occurredAt: new Date(iso), id };
}

const listSelection = {
  id: transactions.id,
  kind: transactions.kind,
  amount: transactions.amount,
  occurredAt: transactions.occurredAt,
  note: transactions.note,
  tags: transactions.tags,
  groupId: transactions.groupId,
  walletId: transactions.walletId,
  walletName: wallets.name,
  walletIcon: wallets.icon,
  walletColor: wallets.color,
  categoryId: transactions.categoryId,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  categoryColor: categories.color,
  source: transactions.source,
  status: transactions.status,
};

export async function listTransactions(
  db: AppDb,
  userId: string,
  opts: {
    filter?: TransactionFilter;
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<{ items: TransactionListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const filter = opts.filter ?? {};
  const conditions = [eq(transactions.userId, userId), isNull(transactions.deletedAt)];

  if (filter.month) {
    const { start, end } = monthRangeFromKey(filter.month);
    conditions.push(gte(transactions.occurredAt, start), lt(transactions.occurredAt, end));
  }
  if (filter.walletId) conditions.push(eq(transactions.walletId, filter.walletId));
  if (filter.categoryId) conditions.push(eq(transactions.categoryId, filter.categoryId));
  if (filter.kind === 'transfer') {
    conditions.push(inArray(transactions.kind, ['transfer_in', 'transfer_out']));
  } else if (filter.kind === 'adjustment') {
    conditions.push(inArray(transactions.kind, ['adjustment_in', 'adjustment_out']));
  } else if (filter.kind) {
    conditions.push(eq(transactions.kind, filter.kind));
  }
  if (filter.tag) conditions.push(sql`${filter.tag} = any(${transactions.tags})`);
  if (filter.search) {
    const pattern = `%${filter.search}%`;
    conditions.push(
      or(
        ilike(transactions.note, pattern),
        ilike(categories.name, pattern),
        sql`array_to_string(${transactions.tags}, ' ') ilike ${pattern}`,
      )!,
    );
  }
  if (opts.cursor) {
    const cursor = decodeCursor(opts.cursor);
    conditions.push(
      or(
        lt(transactions.occurredAt, cursor.occurredAt),
        and(eq(transactions.occurredAt, cursor.occurredAt), lt(transactions.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select(listSelection)
    .from(transactions)
    .innerJoin(wallets, eq(wallets.id, transactions.walletId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conditions))
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

export interface TagUsage {
  tag: string;
  usage: number;
}

/** Tag yang pernah dipakai user (urut paling sering) — untuk chip/select filter. */
export async function listTags(db: AppDb, userId: string, limit = 40): Promise<TagUsage[]> {
  const rows = await db
    .select({
      tag: sql<string>`tag_name`,
      usage: sql<number>`count(*)::int`,
    })
    .from(sql`${transactions}, unnest(${transactions.tags}) as tag_name`)
    .where(sql`${transactions.userId} = ${userId} and ${transactions.deletedAt} is null`)
    .groupBy(sql`tag_name`)
    .orderBy(sql`count(*) desc, tag_name asc`)
    .limit(limit);
  return rows.map((row) => ({ tag: row.tag, usage: Number(row.usage) }));
}

export interface TransferDetail {
  groupId: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  feeAmount: number;
  feeCategoryId: string | null;
  occurredAt: Date;
  note: string | null;
}

export interface TransactionDetail {
  transaction: Transaction;
  transfer: TransferDetail | null;
}

export async function getTransactionDetail(
  db: AppDb,
  userId: string,
  transactionId: string,
): Promise<TransactionDetail | null> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  let transfer: TransferDetail | null = null;
  if ((row.kind === 'transfer_in' || row.kind === 'transfer_out') && row.groupId) {
    const groupRows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.groupId, row.groupId),
          isNull(transactions.deletedAt),
        ),
      );
    const outLeg = groupRows.find((r) => r.kind === 'transfer_out');
    const inLeg = groupRows.find((r) => r.kind === 'transfer_in');
    const feeRow = groupRows.find((r) => r.kind === 'expense');
    if (outLeg && inLeg) {
      transfer = {
        groupId: row.groupId,
        fromWalletId: outLeg.walletId,
        toWalletId: inLeg.walletId,
        amount: outLeg.amount,
        feeAmount: feeRow?.amount ?? 0,
        feeCategoryId: feeRow?.categoryId ?? null,
        occurredAt: outLeg.occurredAt,
        note: outLeg.note,
      };
    }
  }

  return { transaction: row, transfer };
}

export async function getWalletBalance(
  db: AppDb,
  userId: string,
  walletId: string,
): Promise<number> {
  const [row] = await db
    .select({ balance: walletBalances.balance })
    .from(walletBalances)
    .where(and(eq(walletBalances.userId, userId), eq(walletBalances.walletId, walletId)))
    .limit(1);
  return Number(row?.balance ?? 0);
}

export interface ReconcileResult {
  previousBalance: number;
  actualBalance: number;
  diff: number;
  transactionId: string | null;
}

/** Bandingkan saldo ledger dengan saldo riil; selisih disimpan sebagai adjustment. */
export async function reconcileWallet(
  db: AppDb,
  userId: string,
  input: { walletId: string; actualBalance: number; note?: string | null },
): Promise<ReconcileResult> {
  if (!Number.isSafeInteger(input.actualBalance)) {
    throw new ServiceError('Saldo tidak valid');
  }
  await assertWallet(db, userId, input.walletId);
  const previousBalance = await getWalletBalance(db, userId, input.walletId);
  const diff = input.actualBalance - previousBalance;
  if (diff === 0) {
    return { previousBalance, actualBalance: input.actualBalance, diff, transactionId: null };
  }
  const [created] = await db
    .insert(transactions)
    .values({
      userId,
      walletId: input.walletId,
      kind: diff > 0 ? 'adjustment_in' : 'adjustment_out',
      amount: Math.abs(diff),
      occurredAt: new Date(),
      note: input.note?.trim() ? input.note : 'Penyesuaian rekonsiliasi',
    })
    .returning();
  return {
    previousBalance,
    actualBalance: input.actualBalance,
    diff,
    transactionId: created.id,
  };
}

/** Verifikasi invariant ledger: total saldo = Σ masuk − Σ keluar (+adjust). */
export async function ledgerInvariant(
  db: AppDb,
  userId: string,
): Promise<{ totalBalances: number; expected: number }> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(case ${transactions.kind}
        when 'income' then ${transactions.amount}
        when 'transfer_in' then ${transactions.amount}
        when 'adjustment_in' then ${transactions.amount}
        when 'expense' then -${transactions.amount}
        when 'transfer_out' then -${transactions.amount}
        when 'adjustment_out' then -${transactions.amount}
        else 0 end), 0)::bigint`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, 'confirmed'),
      ),
    );
  const [balances] = await db
    .select({ total: sql<number>`coalesce(sum(${walletBalances.balance}), 0)::bigint` })
    .from(walletBalances)
    .where(eq(walletBalances.userId, userId));
  return { totalBalances: Number(balances?.total ?? 0), expected: Number(row?.total ?? 0) };
}
