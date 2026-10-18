import { redirect } from 'next/navigation';
import { ResetPasswordForm } from '@/components/app/reset-password-form';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const metadata = { title: 'Password baru' };

export default function ResetPasswordPage() {
  // Mode lokal tidak memakai password.
  if (!isSupabaseConfigured()) redirect('/dashboard');
  return <ResetPasswordForm />;
}
