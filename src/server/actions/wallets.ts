'use server';

import { z } from 'zod';
import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { uuidSchema, walletFormSchema } from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  createWallet,
  deleteWallet,
  listWallets,
  setWalletArchived,
  updateWallet,
  type WalletWithBalance,
} from '@/server/services/wallets';
import { errorMessage, revalidateAppLayout } from './shared';

export async function listWalletsAction(): Promise<ActionResult<WalletWithBalance[]>> {
  try {
    const user = await requireUser();
    const db = await getDb();
    return { ok: true, data: await listWallets(db, user.id) };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function createWalletAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const values = walletFormSchema.parse(input);
    const db = await getDb();
    const wallet = await createWallet(db, user.id, {
      name: values.name,
      type: values.type,
      color: values.color ?? null,
      icon: values.icon ?? null,
      openingBalance: values.openingBalance ?? 0,
    });
    revalidateAppLayout();
    return { ok: true, data: { id: wallet.id } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

const updateWalletSchema = walletFormSchema
  .partial()
  .extend({ walletId: uuidSchema });

export async function updateWalletAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = updateWalletSchema.parse(input);
    const db = await getDb();
    await updateWallet(db, user.id, values.walletId, {
      name: values.name,
      type: values.type,
      color: values.color,
      icon: values.icon,
    });
    revalidateAppLayout();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

const archiveSchema = z.object({ walletId: uuidSchema, archived: z.boolean() });

export async function setWalletArchivedAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const values = archiveSchema.parse(input);
    const db = await getDb();
    await setWalletArchived(db, user.id, values.walletId, values.archived);
    revalidateAppLayout();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function deleteWalletAction(
  walletId: string,
): Promise<ActionResult<{ deleted: boolean; reason?: string }>> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(walletId);
    const db = await getDb();
    const result = await deleteWallet(db, user.id, id);
    revalidateAppLayout();
    if (!result.deleted) {
      return { ok: true, data: { deleted: false, reason: result.reason } };
    }
    return { ok: true, data: { deleted: true } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
