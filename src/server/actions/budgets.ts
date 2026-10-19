'use server';

import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { budgetFormSchema, budgetToggleSchema } from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { saveBudget, setBudgetEnabled } from '@/server/services/budgets';
import { errorMessage, revalidateAppData } from './shared';

export async function saveBudgetAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = budgetFormSchema.parse(input);
    const db = await getDb();
    await saveBudget(db, user.id, {
      categoryId: values.categoryId,
      amount: values.amount,
    });
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function setBudgetEnabledAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = budgetToggleSchema.parse(input);
    const db = await getDb();
    await setBudgetEnabled(db, user.id, values.categoryId, values.enabled);
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
