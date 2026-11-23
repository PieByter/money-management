'use server';

import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { goalArchiveSchema, goalFormSchema, uuidSchema } from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  createGoal,
  deleteGoal,
  setGoalArchived,
  updateGoal,
} from '@/server/services/goals';
import { errorMessage, revalidateAppData, revalidateAppLayout } from './shared';

export async function saveGoalAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const values = goalFormSchema.parse(input);
    const db = await getDb();
    const goal = values.id
      ? await updateGoal(db, user.id, values.id, {
          name: values.name,
          targetAmount: values.targetAmount,
          walletId: values.walletId,
          targetDate: values.targetDate ?? null,
          note: values.note ?? null,
        })
      : await createGoal(db, user.id, {
          name: values.name,
          targetAmount: values.targetAmount,
          walletId: values.walletId,
          targetDate: values.targetDate ?? null,
          note: values.note ?? null,
        });
    revalidateAppData();
    revalidateAppLayout();
    return { ok: true, data: { id: goal.id } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function setGoalArchivedAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = goalArchiveSchema.parse(input);
    const db = await getDb();
    await setGoalArchived(db, user.id, values.goalId, values.archived);
    revalidateAppData();
    revalidateAppLayout();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function deleteGoalAction(goalId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(goalId);
    const db = await getDb();
    await deleteGoal(db, user.id, id);
    revalidateAppData();
    revalidateAppLayout();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
