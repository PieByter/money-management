'use server';

import { redirect } from 'next/navigation';
import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deleteSupabaseUser } from '@/lib/supabase/admin';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { wipeUserData } from '@/server/services/account';
import { errorMessage } from './shared';

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect('/login');
}

export interface DeleteAccountResult {
  /** false bila user auth Supabase tidak ikut terhapus (kunci admin belum diisi). */
  authUserDeleted: boolean;
}

/**
 * Hapus akun: seluruh baris data milik user dihapus permanen, lalu (bila kunci
 * admin tersedia) akun Supabase Auth-nya ikut dihapus dan sesi diakhiri.
 */
export async function deleteAccountAction(confirmation: string): Promise<ActionResult<DeleteAccountResult>> {
  try {
    const user = await requireUser();
    if (confirmation.trim() !== 'HAPUS') {
      return fail('Ketik HAPUS untuk mengonfirmasi');
    }

    const db = await getDb();
    await wipeUserData(db, user.id);

    let authUserDeleted = false;
    if (isSupabaseConfigured()) {
      authUserDeleted = await deleteSupabaseUser(user.id);
      const supabase = await createSupabaseServerClient();
      if (authUserDeleted) await supabase.auth.signOut();
    }

    return { ok: true, data: { authUserDeleted } };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

