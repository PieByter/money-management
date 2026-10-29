'use server';

import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { templateFormSchema, uuidSchema } from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  applyTemplate,
  createTemplate,
  deleteTemplate,
  updateTemplate,
} from '@/server/services/templates';
import { errorMessage, revalidateAppData, revalidateAppLayout } from './shared';

export async function createTemplateAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const values = templateFormSchema.parse(input);
    const db = await getDb();
    const row = await createTemplate(db, user.id, values);
    revalidateAppLayout();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function updateTemplateAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const values = templateFormSchema.parse(input);
    if (!values.id) return fail('Template tidak ditemukan');
    const db = await getDb();
    const row = await updateTemplate(db, user.id, values.id, values);
    revalidateAppLayout();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(templateId);
    const db = await getDb();
    await deleteTemplate(db, user.id, id);
    revalidateAppLayout();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

/** Catat template sebagai transaksi sekarang (tombol "Catat sekarang"). */
export async function applyTemplateAction(
  templateId: string,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(templateId);
    const db = await getDb();
    const result = await applyTemplate(db, user.id, id);
    revalidateAppData();
    return { ok: true, data: result };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
