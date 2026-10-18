'use server';

import { z } from 'zod';
import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { categoryFormSchema, uuidSchema } from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  createCategory,
  deleteCategory,
  setCategoryArchived,
  updateCategory,
} from '@/server/services/categories';
import { errorMessage, revalidateAppLayout } from './shared';

export async function createCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const values = categoryFormSchema.parse(input);
    const db = await getDb();
    const category = await createCategory(db, user.id, {
      name: values.name,
      kind: values.kind,
      icon: values.icon ?? null,
      color: values.color ?? null,
    });
    revalidateAppLayout();
    return { ok: true, data: { id: category.id } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

const updateCategorySchema = categoryFormSchema.partial().extend({ categoryId: uuidSchema });

export async function updateCategoryAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = updateCategorySchema.parse(input);
    const db = await getDb();
    await updateCategory(db, user.id, values.categoryId, {
      name: values.name,
      icon: values.icon,
      color: values.color,
    });
    revalidateAppLayout();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

const archiveSchema = z.object({ categoryId: uuidSchema, archived: z.boolean() });

export async function setCategoryArchivedAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = archiveSchema.parse(input);
    const db = await getDb();
    await setCategoryArchived(db, user.id, values.categoryId, values.archived);
    revalidateAppLayout();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function deleteCategoryAction(
  categoryId: string,
): Promise<ActionResult<{ deleted: boolean; reason?: string }>> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(categoryId);
    const db = await getDb();
    const result = await deleteCategory(db, user.id, id);
    revalidateAppLayout();
    if (!result.deleted) {
      return { ok: true, data: { deleted: false, reason: result.reason } };
    }
    return { ok: true, data: { deleted: true } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
