import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';

/**
 * Kunci rahasia server (sb_secret_… / service role). Hanya dipakai untuk operasi
 * administratif seperti menghapus akun auth — jangan pernah diekspos ke client.
 */
export const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    SUPABASE_URL &&
      !SUPABASE_URL.includes('<') &&
      SUPABASE_SECRET_KEY &&
      !SUPABASE_SECRET_KEY.includes('<'),
  );
}

/** Hapus user Supabase Auth. Mengembalikan false bila kunci admin tidak diisi. */
export async function deleteSupabaseUser(userId: string): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) return false;
  const admin = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  return true;
}
