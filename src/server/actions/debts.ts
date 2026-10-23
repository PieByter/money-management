'use server';

import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { resolveOccurredAt } from '@/lib/dates';
import {
  debtFormSchema,
  debtPaymentSchema,
  debtSettleSchema,
  debtUpdateSchema,
  uuidSchema,
} from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  addDebtPayment,
  createDebt,
  deleteDebt,
  deleteDebtPayment,
  settleDebt,
  updateDebt,
} from '@/server/services/debts';
import { errorMessage, revalidateAppData } from './shared';

export async function createDebtAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const values = debtFormSchema.parse(input);
    const db = await getDb();
    const debt = await createDebt(db, user.id, {
      direction: values.direction,
      counterparty: values.counterparty,
      purpose: values.purpose ?? null,
      principal: values.principal,
      fundingWalletId: values.fundingWalletId,
      paymentWalletId: values.paymentWalletId,
      startedAt: resolveOccurredAt(values.date),
      dueAt: values.dueDate ? resolveOccurredAt(values.dueDate) : null,
      note: values.note ?? null,
    });
    revalidateAppData();
    return { ok: true, data: { id: debt.id } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function updateDebtAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = debtUpdateSchema.parse(input);
    const db = await getDb();
    await updateDebt(db, user.id, values.debtId, {
      ...(values.counterparty !== undefined ? { counterparty: values.counterparty } : {}),
      ...(values.purpose !== undefined ? { purpose: values.purpose } : {}),
      ...(values.paymentWalletId !== undefined ? { paymentWalletId: values.paymentWalletId } : {}),
      ...(values.dueDate !== undefined
        ? { dueAt: values.dueDate ? resolveOccurredAt(values.dueDate) : null }
        : {}),
      ...(values.note !== undefined ? { note: values.note } : {}),
    });
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function addDebtPaymentAction(
  input: unknown,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requireUser();
    const values = debtPaymentSchema.parse(input);
    const db = await getDb();
    const payment = await addDebtPayment(db, user.id, values.debtId, {
      amount: values.amount,
      walletId: values.walletId,
      occurredAt: resolveOccurredAt(values.date),
      note: values.note ?? null,
    });
    revalidateAppData();
    return { ok: true, data: { transactionId: payment.transactionId ?? '' } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function settleDebtAction(
  input: unknown,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requireUser();
    const values = debtSettleSchema.parse(input);
    const db = await getDb();
    const payment = await settleDebt(db, user.id, values.debtId, {
      walletId: values.walletId,
      occurredAt: resolveOccurredAt(values.date),
      note: values.note ?? null,
    });
    revalidateAppData();
    return { ok: true, data: { transactionId: payment.transactionId ?? '' } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function deleteDebtPaymentAction(paymentId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(paymentId);
    const db = await getDb();
    await deleteDebtPayment(db, user.id, id);
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function deleteDebtAction(debtId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(debtId);
    const db = await getDb();
    await deleteDebt(db, user.id, id);
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
