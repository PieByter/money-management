export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Supabase menerima kunci "publishable" baru (sb_publishable_…) maupun
 * anon key gaya lama. Terima keduanya; publishable diprioritaskan.
 */
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isPlaceholder(value: string | undefined): boolean {
  return Boolean(value && (value.includes('<') || value.includes('>')));
}

/**
 * Supabase aktif hanya bila URL + kunci terisi dan bukan placeholder.
 * Tanpa env, aplikasi berjalan dalam mode lokal satu pengguna (PGlite).
 */
export function isSupabaseConfigured(): boolean {
  return (
    Boolean(SUPABASE_URL && !isPlaceholder(SUPABASE_URL)) &&
    Boolean(SUPABASE_KEY && !isPlaceholder(SUPABASE_KEY))
  );
}
