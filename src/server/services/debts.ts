import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { formatIdr } from '@/lib/money';
import type { AppDb } from '../db/client';
import {
  categories,
  debtPayments,
  debts,
  transactions,
  wallets,
  type Debt,
  type DebtDirection,
} from '../db/schema';
import { ServiceError } from './errors';

/**
 * Hutang & piutang.
 *
 * Aturan uang (lihat PRD bagian 4): setiap perubahan pinjaman selalu jadi satu
 * baris ledger sungguhan, sehingga saldo kantong dan laporan masuk/keluar
 * otomatis ikut benar. Tidak ada kolom saldo yang diedit manual.
 *
 *   hutang  (payable)    : menerima pinjaman = income, membayar = expense
 *   piutang (receivable) : memberi pinjaman  = expense, menerima = income
 *
 * Status lunas diturunkan dari total pembayaran, bukan disimpan.
 */

const fundingWallet = alias(wallets, 'funding_wallet');
const paymentWallet = alias(wallets, 'payment_wallet');

interface DebtCategoryPreset {
  name: string;
  kind: 'income' | 'expense';
  icon: string;
}

const DEBT_CATEGORIES: Record<DebtDirection, { funding: DebtCategoryPreset; payment: DebtCategoryPreset }> = {
  payable: {
    funding: { name: 'Pinjaman Masuk', kind: 'income', icon: '🏦' },
    payment: { name: 'Bayar Hutang', kind: 'expense', icon: '💳' },
  },
  receivable: {
    funding: { name: 'Beri Pinjaman', kind: 'expense', icon: '🤝' },
    payment: { name: 'Terima Piutang', kind: 'income', icon: '🪙' },
  },
};

export interface DebtWalletRef {
  id: string;
  name: string;
  icon: string | null;
}

export interface DebtEntry {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  purpose: string | null;
  principal: number;
  paid: number;
  remaining: number;
  /** 0..1 — untuk progress bar. */
  progress: number;
  status: 'open' | 'paid';
  overdue: boolean;
  fundingWallet: DebtWalletRef;
  paymentWallet: DebtWalletRef;
  startedAt: Date;
  dueAt: Date | null;
  note: string | null;
}

export interface DebtPaymentEntry {
  id: string;
  amount: number;
  occurredAt: Date;
  note: string | null;
  transactionId: string | null;
  wallet: DebtWalletRef;
}

export interface DebtFlowEvent {
  type: 'funding' | 'payment';
  amount: number;
  occurredAt: Date;
  wallet: DebtWalletRef;
  transactionId: string | null;
  note: string | null;
}

export interface DebtDetail extends DebtEntry {
  payments: DebtPaymentEntry[];
  flow: DebtFlowEvent[];
}

export interface DebtSummary {
  payableOutstanding: number;
  receivableOutstanding: number;
  payablePrincipal: number;
  receivablePrincipal: number;
  openCount: number;
  paidCount: number;
}

export interface DebtInput {
  direction: DebtDirection;
  counterparty: string;
  purpose?: string | null;
  principal: number;
  /** Kantong tempat uang pinjaman masuk (hutang) / keluar (piutang). */
  fundingWalletId: string;
  /** Kantong default untuk angsuran & pelunasan. */
  paymentWalletId: string;
  startedAt: Date;
  dueAt?: Date | null;
  note?: string | null;
}

export interface DebtPaymentInput {
  amount: number;
  walletId: string;
  occurredAt: Date;
  note?: string | null;
}

export interface DebtPatch {
  counterparty?: string;
  purpose?: string | null;
  paymentWalletId?: string;
  dueAt?: Date | null;
  note?: string | null;
}

/** Total pembayaran yang ledger-nya masih aktif (belum dihapus dari Riwayat). */
const paidAmountExpression = sql<number>`coalesce((
  select sum(dp.amount) from debt_payments dp
  left join transactions dt on dt.id = dp.transaction_id
  where dp.debt_id = ${debts.id}
    and (dp.transaction_id is null or dt.deleted_at is null)
), 0)::bigint`;

const debtSelection = {
  id: debts.id,
  direction: debts.direction,
  counterparty: debts.counterparty,
  purpose: debts.purpose,
  principal: debts.principal,
  startedAt: debts.startedAt,
  dueAt: debts.dueAt,
  note: debts.note,
  fundingWalletId: fundingWallet.id,
  fundingWalletName: fundingWallet.name,
  fundingWalletIcon: fundingWallet.icon,
  paymentWalletId: paymentWallet.id,
  paymentWalletName: paymentWallet.name,
  paymentWalletIcon: paymentWallet.icon,
  paid: paidAmountExpression,
  fundingTransactionId: debts.fundingTransactionId,
};

type DebtRow = {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  purpose: string | null;
  principal: number;
  startedAt: Date;
  dueAt: Date | null;
  note: string | null;
  fundingWalletId: string | null;
  fundingWalletName: string | null;
  fundingWalletIcon: string | null;
  paymentWalletId: string | null;
  paymentWalletName: string | null;
  paymentWalletIcon: string | null;
  paid: number;
  fundingTransactionId?: string | null;
};

function mapDebtRow(row: DebtRow, now = Date.now()): DebtEntry {
  const principal = Number(row.principal);
  const paid = Math.min(Number(row.paid ?? 0), principal);
  const remaining = Math.max(principal - paid, 0);
  return {
    id: row.id,
    direction: row.direction,
    counterparty: row.counterparty,
    purpose: row.purpose,
    principal,
    paid,
    remaining,
    progress: principal > 0 ? paid / principal : 0,
    status: remaining === 0 ? 'paid' : 'open',
    overdue: remaining > 0 && row.dueAt !== null && row.dueAt.getTime() < now,
    fundingWallet: {
      id: row.fundingWalletId ?? '',
      name: row.fundingWalletName ?? 'Kantong terhapus',
      icon: row.fundingWalletIcon,
    },
    paymentWallet: {
      id: row.paymentWalletId ?? '',
      name: row.paymentWalletName ?? 'Kantong terhapus',
      icon: row.paymentWalletIcon,
    },
    startedAt: row.startedAt,
    dueAt: row.dueAt,
    note: row.note,
  };
}

function validateAmount(amount: number, message: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ServiceError(message);
}

async function assertWallet(db: AppDb, userId: string, walletId: string): Promise<DebtWalletRef> {
  const [row] = await db
    .select({ id: wallets.id, name: wallets.name, icon: wallets.icon, archivedAt: wallets.archivedAt })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.id, walletId)))
    .limit(1);
  if (!row) throw new ServiceError('Kantong tidak ditemukan');
  if (row.archivedAt) throw new ServiceError('Kantong sudah diarsipkan');
  return { id: row.id, name: row.name, icon: row.icon };
}

/**
 * Cari kategori khusus hutang/piutang; buat bila belum ada. Kategori dibuat
 * sekali per user supaya laporan otomatis memisahkan arus pinjaman.
 */
async function ensureDebtCategory(
  db: AppDb,
  userId: string,
  preset: DebtCategoryPreset,
): Promise<string> {
  const find = async (): Promise<string | null> => {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.kind, preset.kind),
          isNull(categories.archivedAt),
          sql`lower(${categories.name}) = lower(${preset.name})`,
        ),
      )
      .limit(1);
    return row?.id ?? null;
  };

  const existing = await find();
  if (existing) return existing;

  await db
    .insert(categories)
    .values({
      userId,
      name: preset.name,
      kind: preset.kind,
      icon: preset.icon,
      sortOrder: 900,
    })
    .onConflictDoNothing();
  const created = await find();
  if (!created) throw new ServiceError('Gagal menyiapkan kategori pinjaman');
  return created;
}

async function loadDebt(db: AppDb, userId: string, debtId: string): Promise<Debt> {
  const [row] = await db
    .select()
    .from(debts)
    .where(and(eq(debts.userId, userId), eq(debts.id, debtId)))
    .limit(1);
  if (!row) throw new ServiceError('Hutang/piutang tidak ditemukan');
  return row;
}

async function sumPaid(db: AppDb, userId: string, debtId: string): Promise<number> {
  const [row] = await db
    .select({ paid: sql<number>`coalesce(sum(${debtPayments.amount}), 0)::bigint` })
    .from(debtPayments)
    .leftJoin(transactions, eq(transactions.id, debtPayments.transactionId))
    .where(
      and(
        eq(debtPayments.userId, userId),
        eq(debtPayments.debtId, debtId),
        or(isNull(debtPayments.transactionId), isNull(transactions.deletedAt)),
      ),
    );
  return Number(row?.paid ?? 0);
}

function sortDebts(entries: DebtEntry[]): DebtEntry[] {
  return [...entries].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    const dueA = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const dueB = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return b.startedAt.getTime() - a.startedAt.getTime();
  });
}

export async function listDebts(
  db: AppDb,
  userId: string,
  opts: { direction?: DebtDirection } = {},
): Promise<DebtEntry[]> {
  const rows = await db
    .select(debtSelection)
    .from(debts)
    .leftJoin(fundingWallet, eq(fundingWallet.id, debts.fundingWalletId))
    .leftJoin(paymentWallet, eq(paymentWallet.id, debts.paymentWalletId))
    .where(
      and(
        eq(debts.userId, userId),
        opts.direction ? eq(debts.direction, opts.direction) : undefined,
      ),
    )
    .orderBy(desc(debts.startedAt));

  return sortDebts(rows.map((row) => mapDebtRow(row as DebtRow)));
}

/** Ringkasan sisa hutang/piutang dari daftar yang sudah dimuat (tanpa query tambahan). */
export function summarizeDebts(entries: DebtEntry[]): DebtSummary {
  const summary: DebtSummary = {
    payableOutstanding: 0,
    receivableOutstanding: 0,
    payablePrincipal: 0,
    receivablePrincipal: 0,
    openCount: 0,
    paidCount: 0,
  };
  for (const entry of entries) {
    if (entry.direction === 'payable') summary.payablePrincipal += entry.principal;
    else summary.receivablePrincipal += entry.principal;
    if (entry.status === 'open') {
      summary.openCount += 1;
      if (entry.direction === 'payable') summary.payableOutstanding += entry.remaining;
      else summary.receivableOutstanding += entry.remaining;
    } else {
      summary.paidCount += 1;
    }
  }
  return summary;
}

export async function getDebtSummary(db: AppDb, userId: string): Promise<DebtSummary> {
  return summarizeDebts(await listDebts(db, userId));
}

export async function getDebt(
  db: AppDb,
  userId: string,
  debtId: string,
): Promise<DebtDetail | null> {
  const [row] = await db
    .select(debtSelection)
    .from(debts)
    .leftJoin(fundingWallet, eq(fundingWallet.id, debts.fundingWalletId))
    .leftJoin(paymentWallet, eq(paymentWallet.id, debts.paymentWalletId))
    .where(and(eq(debts.userId, userId), eq(debts.id, debtId)))
    .limit(1);
  if (!row) return null;

  const paymentRows = await db
    .select({
      id: debtPayments.id,
      amount: debtPayments.amount,
      occurredAt: debtPayments.occurredAt,
      note: debtPayments.note,
      transactionId: debtPayments.transactionId,
      walletId: wallets.id,
      walletName: wallets.name,
      walletIcon: wallets.icon,
      transactionDeletedAt: transactions.deletedAt,
    })
    .from(debtPayments)
    .innerJoin(wallets, eq(wallets.id, debtPayments.walletId))
    .leftJoin(transactions, eq(transactions.id, debtPayments.transactionId))
    .where(and(eq(debtPayments.userId, userId), eq(debtPayments.debtId, debtId)))
    .orderBy(asc(debtPayments.occurredAt), asc(debtPayments.createdAt));

  // Pembayaran yang transaksinya sudah dihapus dari Riwayat tidak dihitung
  // sebagai pelunasan (ledger tetap sumber kebenaran).
  const activePayments = paymentRows.filter((payment) => payment.transactionDeletedAt === null);

  const entry = mapDebtRow(row as DebtRow);
  const payments: DebtPaymentEntry[] = activePayments.map((payment) => ({
    id: payment.id,
    amount: Number(payment.amount),
    occurredAt: payment.occurredAt,
    note: payment.note,
    transactionId: payment.transactionId,
    wallet: { id: payment.walletId, name: payment.walletName, icon: payment.walletIcon },
  }));

  const flow: DebtFlowEvent[] = [
    {
      type: 'funding' as const,
      amount: entry.principal,
      occurredAt: entry.startedAt,
      wallet: entry.fundingWallet,
      transactionId: row.fundingTransactionId ?? null,
      note:
        entry.direction === 'payable'
          ? `Pinjaman masuk dari ${entry.counterparty}`
          : `Dipinjamkan ke ${entry.counterparty}`,
    },
    ...payments.map((payment) => ({
      type: 'payment' as const,
      amount: payment.amount,
      occurredAt: payment.occurredAt,
      wallet: payment.wallet,
      transactionId: payment.transactionId,
      note: payment.note,
    })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return { ...entry, payments, flow };
}

export async function createDebt(db: AppDb, userId: string, input: DebtInput): Promise<Debt> {
  validateAmount(input.principal, 'Nominal pokok tidak valid');
  const counterparty = input.counterparty.trim();
  if (!counterparty) throw new ServiceError('Nama pihak wajib diisi');

  await assertWallet(db, userId, input.fundingWalletId);
  await assertWallet(db, userId, input.paymentWalletId);

  return db.transaction(async (tx) => {
    const [debt] = await tx
      .insert(debts)
      .values({
        userId,
        direction: input.direction,
        counterparty,
        purpose: input.purpose?.trim() || null,
        principal: input.principal,
        fundingWalletId: input.fundingWalletId,
        paymentWalletId: input.paymentWalletId,
        startedAt: input.startedAt,
        dueAt: input.dueAt ?? null,
        note: input.note?.trim() || null,
      })
      .returning();

    const categoryId = await ensureDebtCategory(
      tx as AppDb,
      userId,
      DEBT_CATEGORIES[input.direction].funding,
    );
    const [fundingTx] = await tx
      .insert(transactions)
      .values({
        userId,
        walletId: input.fundingWalletId,
        kind: input.direction === 'payable' ? 'income' : 'expense',
        amount: input.principal,
        categoryId,
        occurredAt: input.startedAt,
        note:
          input.direction === 'payable'
            ? `Pinjaman dari ${counterparty}`
            : `Pinjaman untuk ${counterparty}`,
        tags: [input.direction === 'payable' ? 'hutang' : 'piutang'],
      })
      .returning({ id: transactions.id });

    const [updated] = await tx
      .update(debts)
      .set({ fundingTransactionId: fundingTx.id, updatedAt: new Date() })
      .where(and(eq(debts.userId, userId), eq(debts.id, debt.id)))
      .returning();

    return updated;
  });
}

export async function updateDebt(
  db: AppDb,
  userId: string,
  debtId: string,
  patch: DebtPatch,
): Promise<void> {
  await loadDebt(db, userId, debtId);
  if (patch.paymentWalletId) await assertWallet(db, userId, patch.paymentWalletId);

  await db
    .update(debts)
    .set({
      ...(patch.counterparty !== undefined ? { counterparty: patch.counterparty.trim() } : {}),
      ...(patch.purpose !== undefined ? { purpose: patch.purpose?.trim() || null } : {}),
      ...(patch.paymentWalletId !== undefined ? { paymentWalletId: patch.paymentWalletId } : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(debts.userId, userId), eq(debts.id, debtId)));
}

async function insertPayment(
  db: AppDb,
  userId: string,
  debt: Debt,
  input: DebtPaymentInput,
): Promise<DebtPaymentEntry> {
  const wallet = await assertWallet(db, userId, input.walletId);
  const categoryId = await ensureDebtCategory(
    db,
    userId,
    DEBT_CATEGORIES[debt.direction].payment,
  );

  const [transaction] = await db
    .insert(transactions)
    .values({
      userId,
      walletId: wallet.id,
      kind: debt.direction === 'payable' ? 'expense' : 'income',
      amount: input.amount,
      categoryId,
      occurredAt: input.occurredAt,
      note:
        debt.direction === 'payable'
          ? `Bayar hutang ke ${debt.counterparty}`
          : `Terima piutang dari ${debt.counterparty}`,
      tags: [debt.direction === 'payable' ? 'hutang' : 'piutang'],
    })
    .returning({ id: transactions.id });

  const [payment] = await db
    .insert(debtPayments)
    .values({
      userId,
      debtId: debt.id,
      walletId: wallet.id,
      amount: input.amount,
      occurredAt: input.occurredAt,
      note: input.note?.trim() || null,
      transactionId: transaction.id,
    })
    .returning({ id: debtPayments.id });

  return {
    id: payment.id,
    amount: input.amount,
    occurredAt: input.occurredAt,
    note: input.note?.trim() || null,
    transactionId: transaction.id,
    wallet,
  };
}

/** Catat angsuran/pelunasan. Nominal tidak boleh melebihi sisa pinjaman. */
export async function addDebtPayment(
  db: AppDb,
  userId: string,
  debtId: string,
  input: DebtPaymentInput,
): Promise<DebtPaymentEntry> {
  validateAmount(input.amount, 'Nominal pembayaran tidak valid');

  return db.transaction(async (tx) => {
    const debt = await loadDebt(tx as AppDb, userId, debtId);
    const paid = await sumPaid(tx as AppDb, userId, debtId);
    const remaining = Number(debt.principal) - paid;
    if (remaining <= 0) throw new ServiceError('Hutang/piutang ini sudah lunas');
    if (input.amount > remaining) {
      throw new ServiceError(`Nominal melebihi sisa ${formatIdr(remaining)}`);
    }
    return insertPayment(tx as AppDb, userId, debt, input);
  });
}

/**
 * Tombol "Lunas": sisa pinjaman langsung diposting ke kantong pembayaran.
 * Untuk piutang uangnya bertambah, untuk hutang uangnya berkurang.
 */
export async function settleDebt(
  db: AppDb,
  userId: string,
  debtId: string,
  input: { walletId: string; occurredAt: Date; note?: string | null },
): Promise<DebtPaymentEntry> {
  return db.transaction(async (tx) => {
    const debt = await loadDebt(tx as AppDb, userId, debtId);
    const paid = await sumPaid(tx as AppDb, userId, debtId);
    const remaining = Number(debt.principal) - paid;
    if (remaining <= 0) throw new ServiceError('Hutang/piutang ini sudah lunas');
    return insertPayment(tx as AppDb, userId, debt, {
      amount: remaining,
      walletId: input.walletId,
      occurredAt: input.occurredAt,
      note: input.note?.trim() || 'Pelunasan',
    });
  });
}

export async function deleteDebtPayment(
  db: AppDb,
  userId: string,
  paymentId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [payment] = await tx
      .select({ id: debtPayments.id, transactionId: debtPayments.transactionId })
      .from(debtPayments)
      .where(and(eq(debtPayments.userId, userId), eq(debtPayments.id, paymentId)))
      .limit(1);
    if (!payment) throw new ServiceError('Pembayaran tidak ditemukan');

    if (payment.transactionId) {
      const now = new Date();
      await tx
        .update(transactions)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.id, payment.transactionId),
            isNull(transactions.deletedAt),
          ),
        );
    }
    await tx
      .delete(debtPayments)
      .where(and(eq(debtPayments.userId, userId), eq(debtPayments.id, paymentId)));
  });
}

/** Hapus pinjaman beserta seluruh jejak uangnya di ledger. */
export async function deleteDebt(db: AppDb, userId: string, debtId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const debt = await loadDebt(tx as AppDb, userId, debtId);
    const payments = await tx
      .select({ transactionId: debtPayments.transactionId })
      .from(debtPayments)
      .where(and(eq(debtPayments.userId, userId), eq(debtPayments.debtId, debtId)));

    const transactionIds = [
      ...payments.map((payment) => payment.transactionId),
      debt.fundingTransactionId,
    ].filter((id): id is string => Boolean(id));

    if (transactionIds.length > 0) {
      const now = new Date();
      await tx
        .update(transactions)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(transactions.id, transactionIds),
            isNull(transactions.deletedAt),
          ),
        );
    }

    await tx.delete(debts).where(and(eq(debts.userId, userId), eq(debts.id, debtId)));
  });
}
