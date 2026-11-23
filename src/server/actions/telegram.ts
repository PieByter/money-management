'use server';

import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  createTelegramLinkToken,
  unlinkTelegram,
  type TelegramLinkToken,
} from '@/server/services/telegram';
import { enforceRateLimit, errorMessage, revalidateAppData } from './shared';

export async function createTelegramLinkAction(): Promise<ActionResult<TelegramLinkToken>> {
  try {
    const user = await requireUser();
    enforceRateLimit(`telegram:link:${user.id}`, 5, 15 * 60_000);
    const db = await getDb();
    const token = await createTelegramLinkToken(db, user.id);
    return { ok: true, data: token };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function unlinkTelegramAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const db = await getDb();
    await unlinkTelegram(db, user.id);
    revalidateAppData();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
