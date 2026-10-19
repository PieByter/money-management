'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LogIn, Send } from 'lucide-react';
import { toast } from 'sonner';
import { PasswordInput } from '@/components/app/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { translateAuthError } from '@/lib/auth-messages';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/config';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Mode = 'signin' | 'signup' | 'forgot';

export function LoginForm({
  initialNotice = null,
  initialMode = 'signin',
}: {
  initialNotice?: string | null;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
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
    if (!trimmedEmail) {
      toast.error('Isi email dulu.');
      return;
    }
    if (mode !== 'forgot' && !password) {
      toast.error('Isi password dulu.');
      return;
    }

    setBusy(true);
    setNotice(null);
    const supabase = createSupabaseBrowserClient();

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (error) {
          toast.error(translateAuthError(error.message));
          return;
        }
        setResetSentTo(trimmedEmail);
        return;
      }

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) {
          toast.error(translateAuthError(error.message));
          return;
        }
        toast.success('Berhasil masuk.');
        goToApp();
        return;
      }

      const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
      if (error) {
        toast.error(translateAuthError(error.message));
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
    if (error) toast.error(translateAuthError(error.message));
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <div className="text-4xl" aria-hidden>
            💰
          </div>
          <h1 className="mt-3 text-xl font-semibold">Money Tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'forgot'
              ? 'Masukkan emailmu, kami kirim tautan untuk membuat password baru.'
              : 'Masuk untuk mencatat dan melihat keuanganmu.'}
          </p>
        </div>

        {mode !== 'forgot' ? (
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
        ) : null}

        {mode === 'forgot' && resetSentTo ? (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-center">
            <p className="text-sm font-medium">Tautan reset dikirim 📬</p>
            <p className="text-xs text-muted-foreground">
              Cek inbox (dan folder spam) untuk <span className="font-medium">{resetSentTo}</span>,
              lalu buka tautannya di browser ini untuk membuat password baru.
            </p>
            <Button
              variant="ghost"
              className="gap-1.5"
              onClick={() => {
                setResetSentTo(null);
                setMode('signin');
              }}
            >
              <ArrowLeft className="h-4 w-4" /> Kembali ke halaman masuk
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
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

            {mode !== 'forgot' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="login-password" className="text-sm font-medium">
                    Password
                  </label>
                  {mode === 'signin' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setNotice(null);
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Lupa password?
                    </button>
                  ) : null}
                </div>
                <PasswordInput
                  id="login-password"
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'signin' ? 'Password kamu' : 'Minimal 6 karakter'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            ) : null}

            <Button type="submit" className="mt-3 w-full gap-2" disabled={busy}>
              {mode === 'forgot' ? <Send className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {busy
                ? 'Memproses…'
                : mode === 'signin'
                  ? 'Masuk'
                  : mode === 'signup'
                    ? 'Buat akun'
                    : 'Kirim tautan reset'}
            </Button>

            {mode === 'forgot' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setNotice(null);
                }}
                className="mx-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke halaman masuk
              </button>
            ) : null}
          </form>
        )}

        {notice ? (
          <p className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
            {notice}
          </p>
        ) : null}

        {googleEnabled && mode !== 'forgot' ? (
          <div className="mt-2 flex flex-col gap-6">
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
          </div>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          {mode === 'forgot' ? (
            <>
              Sudah ingat passwordnya?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Kembali masuk
              </Link>
            </>
          ) : (
            'Tanpa verifikasi email — cukup email dan password.'
          )}
        </p>
      </div>
    </div>
  );
}
