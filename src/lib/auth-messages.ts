/**
 * Terjemahan pesan error Supabase Auth ke bahasa Indonesia yang jelas.
 */
export function translateAuthError(message: string): string {
  const text = message.toLowerCase();

  if (text.includes('invalid login credentials')) return 'Email atau password salah.';
  if (text.includes('email not confirmed')) {
    return 'Email belum dikonfirmasi. Matikan "Confirm email" di Supabase → Authentication → Sign In / Providers → Email, atau konfirmasi lewat tautan di emailmu.';
  }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'Email ini sudah terdaftar — pilih "Masuk".';
  }
  if (text.includes('password should be at least')) {
    return 'Password terlalu pendek (minimal 6 karakter).';
  }
  if (text.includes('different from the old password')) {
    return 'Password baru harus berbeda dari password sebelumnya.';
  }
  if (text.includes('auth session missing')) {
    return 'Sesi tidak ditemukan — tautan mungkin sudah kedaluwarsa atau telah dipakai. Minta tautan reset baru dari halaman masuk.';
  }
  if (text.includes('unable to validate email') || text.includes('invalid email')) {
    return 'Format email tidak valid.';
  }
  if (text.includes('rate limit') || text.includes('too many') || text.includes('security purposes')) {
    return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  }
  if (text.includes('provider is not enabled')) {
    return 'Provider Google belum diaktifkan di Supabase (Authentication → Providers → Google).';
  }
  if (text.includes('expired') || text.includes('invalid token') || text.includes('otp_expired')) {
    return 'Tautan sudah kedaluwarsa atau tidak valid. Minta tautan reset baru.';
  }
  return message;
}
