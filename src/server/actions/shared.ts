import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { ServiceError } from '@/server/services/transactions';

/** Purge cache halaman data agar RSC menampilkan angka terbaru. */
export function revalidateAppData(): void {
  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  revalidatePath('/wallets');
  revalidatePath('/wallets/[id]', 'page');
  revalidatePath('/reports');
  revalidatePath('/debts');
  revalidatePath('/debts/[id]', 'page');
}

/** Layout memuat daftar kantong/kategori untuk sheet; refresh saat daftar berubah. */
export function revalidateAppLayout(): void {
  revalidateAppData();
  revalidatePath('/', 'layout');
}

export function errorMessage(error: unknown): string {
  if (error instanceof ServiceError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Input tidak valid';
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') {
    return 'Nama itu sudah dipakai. Gunakan nama lain.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Terjadi kesalahan. Coba lagi.';
}
