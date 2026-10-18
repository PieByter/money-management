'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    setBusy(false);
    if (error) {
      toast.error('Gagal mengirim tautan: ' + error.message);
      return;
    }
    setSent(true);
  }

  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error('Gagal masuk dengan Google: ' + error.message);
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

        {sent ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <p className="text-sm font-medium">Cek email kamu 📬</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tautan masuk sudah dikirim ke <span className="font-medium">{email}</span>. Buka
              tautan tersebut untuk masuk.
            </p>
            <Button variant="ghost" className="mt-3" onClick={() => setSent(false)}>
              Kirim ulang / ganti email
            </Button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-3">
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
            <Button type="submit" className="w-full gap-2" disabled={busy}>
              <Mail className="h-4 w-4" />
              {busy ? 'Mengirim…' : 'Kirim tautan masuk'}
            </Button>
          </form>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          atau
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full gap-2" onClick={() => void signInWithGoogle()}>
          <span aria-hidden>🔵</span> Lanjutkan dengan Google
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Tanpa password — kami hanya memakai tautan/kunci OAuth untuk masuk.
        </p>
      </div>
    </div>
  );
}
