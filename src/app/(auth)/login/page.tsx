import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/app/login-form';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const metadata = { title: 'Masuk' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Mode lokal tidak butuh login.
  if (!isSupabaseConfigured()) redirect('/dashboard');

  const params = await searchParams;
  const linkError = Boolean(params.error);

  return (
    <LoginForm
      initialMode={linkError ? 'forgot' : 'signin'}
      initialNotice={
        linkError
          ? 'Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru lewat "Lupa password?".'
          : null
      }
    />
  );
}
