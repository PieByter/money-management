import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/app/login-form';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const metadata = { title: 'Masuk' };

export default function LoginPage() {
  // Mode lokal tidak butuh login.
  if (!isSupabaseConfigured()) redirect('/dashboard');
  return <LoginForm />;
}
