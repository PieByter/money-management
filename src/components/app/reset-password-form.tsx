'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PasswordInput } from '@/components/app/password-input';
import { Button, buttonVariants } from '@/components/ui/button';
import { translateAuthError } from '@/lib/auth-messages';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type SessionState = 'checking' | 'ready' | 'missing';

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, setState] = useState<SessionState>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setEmail(data.user?.email ?? null);
        setState(data.user ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setState('missing');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) {
      toast.error('Password minimal 6 karakter.');
      return;
    }
    if (password !== confirm) {
      toast.error('Konfirmasi password tidak sama.');
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    toast.success('Password baru tersimpan. Kamu sudah masuk.');
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-4xl" aria-hidden>
            🔑
          </div>
          <h1 className="mt-3 text-xl font-semibold">Buat password baru</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {email ? `Untuk akun ${email}` : 'Masukkan password baru untuk akunmu.'}
          </p>
        </div>

        {state === 'checking' ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memeriksa tautan…
          </p>
        ) : null}

        {state === 'missing' ? (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-center">
            <p className="text-sm font-medium">Tautan tidak valid atau sudah kedaluwarsa</p>
            <p className="text-xs text-muted-foreground">
              Minta tautan reset baru dari halaman masuk, lalu buka tautannya di browser yang
              sama.
            </p>
            <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
              Minta tautan reset baru
            </Link>
          </div>
        ) : null}

        {state === 'ready' ? (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-sm font-medium">
                Password baru
              </label>
              <PasswordInput
                id="new-password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="text-sm font-medium">
                Ulangi password baru
              </label>
              <PasswordInput
                id="confirm-password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Ketik ulang password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            <Button type="submit" className="w-full gap-2" disabled={busy}>
              <KeyRound className="h-4 w-4" />
              {busy ? 'Menyimpan…' : 'Simpan password baru'}
            </Button>
          </form>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Kembali ke halaman masuk
          </Link>
        </p>
      </div>
    </div>
  );
}
