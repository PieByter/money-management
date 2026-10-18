'use server';

import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { jakartaYmd, resolveOccurredAt } from '@/lib/dates';
import {
  listTransactionsSchema,
  reconcileSchema,
  simpleTransactionSchema,
  transferSchema,
  updateTransactionSchema,
  updateTransferSchema,
  uuidSchema,
} from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { findFeeCategoryId } from '@/server/services/categories';
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  getTransactionDetail,
  listTransactions,
  reconcileWallet,
  updateTransaction,
  updateTransfer,
  type ReconcileResult,
  type TransactionDetail,
  type TransactionListItem,
} from '@/server/services/transactions';
import { errorMessage, revalidateAppData } from './shared';

/** Pertahankan jam asli bila tanggal dipilih masih hari yang sama. */
function occurredAtForEdit(original: Date, ymd?: string | null): Date | undefined {
  if (!ymd) return undefined;
  if (jakartaYmd(original) === ymd) return original;
  return resolveOccurredAt(ymd);
}

export async function createTransactionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const values = simpleTransactionSchema.parse(input);
    const db = await getDb();
    const row = await createTransaction(db, user.id, {
      kind: values.kind,
      amount: values.amount,
      walletId: values.walletId,
      categoryId: values.categoryId ?? null,
      occurredAt: resolveOccurredAt(values.date),
      note: values.note?.trim() ? values.note : null,
      tags: values.tags,
      clientRequestId: values.clientRequestId ?? null,
    });
    revalidateAppData();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function createTransferAction(
  input: unknown,
): Promise<ActionResult<{ groupId: string }>> {
  try {
    const user = await requireUser();
    const values = transferSchema.parse(input);
    const db = await getDb();
    const feeAmount = values.feeAmount ?? 0;
    const feeCategoryId =
      feeAmount > 0 ? (values.feeCategoryId ?? (await findFeeCategoryId(db, user.id))) : null;
    const result = await createTransfer(db, user.id, {
      fromWalletId: values.fromWalletId,
      toWalletId: values.toWalletId,
      amount: values.amount,
      feeAmount,
      feeCategoryId,
      occurredAt: resolveOccurredAt(values.date),
      note: values.note?.trim() ? values.note : null,
      clientRequestId: values.clientRequestId ?? null,
    });
    revalidateAppData();
    return { ok: true, data: result };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function updateTransactionAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = updateTransactionSchema.parse(input);
    const db = await getDb();
    const detail = await getTransactionDetail(db, user.id, values.transactionId);
    if (!detail) return fail('Transaksi tidak ditemukan');
    await updateTransaction(db, user.id, {
      transactionId: values.transactionId,
      kind: values.kind,
      amount: values.amount,
      walletId: values.walletId,
      categoryId: values.categoryId,
      occurredAt: occurredAtForEdit(detail.transaction.occurredAt, values.date),
      note: values.note?.trim() ? values.note : values.note,
      tags: values.tags,
    });
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function updateTransferAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = updateTransferSchema.parse(input);
    const db = await getDb();
    const detail = await getTransactionDetail(db, user.id, values.transactionId);
    if (!detail?.transfer) return fail('Transfer tidak ditemukan');
    const feeAmount = values.feeAmount;
    const feeCategoryId =
      feeAmount && feeAmount > 0
        ? (values.feeCategoryId ?? (await findFeeCategoryId(db, user.id)))
        : (values.feeCategoryId ?? null);
    await updateTransfer(db, user.id, {
      transactionId: values.transactionId,
      fromWalletId: values.fromWalletId,
      toWalletId: values.toWalletId,
      amount: values.amount,
      feeAmount,
      feeCategoryId,
      occurredAt: occurredAtForEdit(detail.transfer.occurredAt, values.date),
      note: values.note?.trim() ? values.note : values.note,
    });
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function deleteTransactionAction(transactionId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(transactionId);
    const db = await getDb();
    await deleteTransaction(db, user.id, id);
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function listTransactionsAction(
  input: unknown,
): Promise<ActionResult<{ items: TransactionListItem[]; nextCursor: string | null }>> {
  try {
    const user = await requireUser();
    const values = listTransactionsSchema.parse(input);
    const db = await getDb();
    const result = await listTransactions(db, user.id, {
      filter: {
        month: values.month ?? undefined,
        walletId: values.walletId ?? undefined,
        categoryId: values.categoryId ?? undefined,
        kind: values.kind ?? undefined,
        search: values.search ?? undefined,
      },
      cursor: values.cursor ?? null,
      limit: values.limit,
    });
    return { ok: true, data: result };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function getTransactionDetailAction(
  transactionId: string,
): Promise<ActionResult<TransactionDetail>> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(transactionId);
    const db = await getDb();
    const detail = await getTransactionDetail(db, user.id, id);
    if (!detail) return fail('Transaksi tidak ditemukan');
    return { ok: true, data: detail };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function reconcileWalletAction(
  input: unknown,
): Promise<ActionResult<ReconcileResult>> {
  try {
    const user = await requireUser();
    const values = reconcileSchema.parse(input);
    const db = await getDb();
    const result = await reconcileWallet(db, user.id, {
      walletId: values.walletId,
      actualBalance: values.actualBalance,
      note: values.note?.trim() ? values.note : null,
    });
    revalidateAppData();
    return { ok: true, data: result };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
