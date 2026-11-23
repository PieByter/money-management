'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Link2, Send, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  createTelegramLinkAction,
  unlinkTelegramAction,
} from '@/server/actions/telegram';

export interface TelegramStatusView {
  linked: boolean;
  chatId: string | null;
  verifiedAt: string | null;
  configured: boolean;
  botUsername: string | null;
}

interface LinkTokenView {
  token: string;
  expiresAt: string;
  command: string;
  deepLink: string | null;
}

export function TelegramCard({ status }: { status: TelegramStatusView }) {
  const router = useRouter();
  const [token, setToken] = useState<LinkTokenView | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createLink() {
    setBusy(true);
    const result = await createTelegramLinkAction();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setToken({
      ...result.data,
      expiresAt: new Date(result.data.expiresAt).toISOString(),
    });
    toast.success('Kode tautan dibuat — berlaku 15 menit');
  }

  async function unlink() {
    if (!window.confirm('Putuskan tautan Telegram? Chat tidak bisa mencatat lagi sampai ditautkan ulang.')) {
      return;
    }
    setBusy(true);
    const result = await unlinkTelegramAction();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Tautan Telegram diputus');
    router.refresh();
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success('Perintah disalin');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Gagal menyalin. Salin manual dari layar.');
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Catat transaksi lewat chat Telegram, mis. <code>makan siang 25rb gopay</code>. Hanya chat
        yang sudah ditautkan yang bisa menulis ke akun ini.
      </p>

      {!status.configured ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Bot belum aktif. Isi <code>TELEGRAM_BOT_TOKEN</code> (dan opsional{' '}
          <code>TELEGRAM_BOT_USERNAME</code>) di environment, lalu restart aplikasi.
        </div>
      ) : null}

      {status.linked ? (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-income" /> Chat terhubung
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Chat ID: <span className="font-mono">{status.chatId}</span>
            {status.verifiedAt
              ? ` · sejak ${new Date(status.verifiedAt).toLocaleDateString('id-ID')}`
              : ''}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Coba kirim <code>/saldo</code> atau <code>/help</code> ke bot.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-expense text-expense"
            disabled={busy}
            onClick={() => void unlink()}
          >
            <Unlink className="h-4 w-4" /> Putuskan tautan
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">
            Buat kode sekali pakai, lalu kirim perintah di bawah ke bot Telegram.
          </p>
          <Button
            size="sm"
            className="mt-2"
            disabled={busy || !status.configured}
            onClick={() => void createLink()}
          >
            <Send className="h-4 w-4" /> {busy ? 'Membuat…' : 'Buat kode tautan'}
          </Button>

          {token ? (
            <div className="mt-3 space-y-2 rounded-lg bg-muted/60 p-3">
              {token.deepLink ? (
                <a
                  href={token.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm font-medium text-primary hover:underline"
                >
                  Buka bot Telegram →
                </a>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Atau kirim perintah ini ke bot:
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-card px-2 py-1.5 text-xs">
                  {token.command}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void copyCommand(token.command)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Salin
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Berlaku sampai{' '}
                {new Date(token.expiresAt).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                . Setelah terhubung, kode langsung hangus.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
