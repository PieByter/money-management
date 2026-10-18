'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/config';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Mode = 'signin' | 'signup';

/** Terjemahkan pesan error Supabase ke bahasa Indonesia yang jelas. */
function translateError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'Email atau password salah.';
  if (text.includes('email not confirmed')) {
    return 'Email belum dikonfirmasi. Matikan "Confirm email" di Supabase → Authentication → Sign In / Providers → Email, atau konfirmasi lewat tautan di emailmu.';
  }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'Email ini sudah terdaftar — pilih "Masuk".';
  }
  if (text.includes('password should be at least')) return 'Password terlalu pendek (minimal 6 karakter).';
  if (text.includes('unable to validate email') || text.includes('invalid email')) {
    return 'Format email tidak valid.';
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  }
  if (text.includes('provider is not enabled')) {
    return 'Provider Google belum diaktifkan di Supabase (Authentication → Providers → Google).';
  }
  return message;
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Tombol Google hanya tampil bila providernya benar-benar aktif di Supabase.
  useEffect(() => {
    let cancelled = false;
    void fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY ?? '' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { external?: { google?: boolean } } | null) => {
        if (!cancelled && data?.external?.google) setGoogleEnabled(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function goToApp() {
    router.replace('/dashboard');
    router.refresh();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error('Isi email dan password.');
      return;
    }

    setBusy(true);
    setNotice(null);
    const supabase = createSupabaseBrowserClient();

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) {
          toast.error(translateError(error.message));
          return;
        }
        toast.success('Berhasil masuk.');
        goToApp();
        return;
      }

      const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
      if (error) {
        toast.error(translateError(error.message));
        return;
      }
      if (data.session) {
        toast.success('Akun dibuat — selamat datang!');
        goToApp();
        return;
      }
      setNotice(
        'Akun dibuat, tetapi Supabase masih meminta konfirmasi email. Matikan opsi "Confirm email" ' +
          '(Authentication → Sign In / Providers → Email) agar bisa langsung masuk tanpa email.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(translateError(error.message));
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-4xl" aria-hidden>
            💰
          </div>
          <h1 className="mt-3 text-xl font-semibold">Money Tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Masuk untuk mencatat dan melihat keuanganmu.
          </p>
        </div>

        <div className="flex rounded-xl bg-muted p-1" role="tablist" aria-label="Pilih mode">
          {(
            [
              { value: 'signin', label: 'Masuk' },
              { value: 'signup', label: 'Daftar' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={mode === option.value}
              onClick={() => {
                setMode(option.value);
                setNotice(null);
              }}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors',
                mode === option.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="login-password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signin' ? 'Password kamu' : 'Minimal 6 karakter'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={busy}>
            <LogIn className="h-4 w-4" />
            {busy ? 'Memproses…' : mode === 'signin' ? 'Masuk' : 'Buat akun'}
          </Button>
        </form>

        {mode === 'signup' ? (
          <p className="text-xs text-muted-foreground">
            Pendaftaran langsung aktif (tanpa verifikasi email) jika opsi <b>Confirm email</b>{' '}
            dimatikan di Supabase → Authentication → Sign In / Providers → Email.
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
            {notice}
          </p>
        ) : null}

        {googleEnabled ? (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              atau
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => void signInWithGoogle()}
            >
              <span aria-hidden>🔵</span> Lanjutkan dengan Google
            </Button>
          </>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          Tanpa verifikasi email — cukup email dan password.
        </p>
      </div>
    </div>
  );
}
