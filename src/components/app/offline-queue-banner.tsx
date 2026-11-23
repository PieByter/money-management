'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloudOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  flushOfflineQueue,
  OFFLINE_QUEUE_EVENT,
  queueCount,
} from '@/lib/offline-queue';

export function OfflineQueueBanner() {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void queueCount().then((next) => {
        if (active) setCount(next);
      });
    };
    refresh();
    window.addEventListener(OFFLINE_QUEUE_EVENT, refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    const interval = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  async function sendNow() {
    setBusy(true);
    const result = await flushOfflineQueue();
    setBusy(false);
    if (result.sent > 0) {
      toast.success(`${result.sent} transaksi terkirim`);
      router.refresh();
    } else if (result.remaining > 0) {
      toast.error('Masih offline atau server belum bisa dijangkau. Coba lagi nanti.');
    }
    if (result.dropped > 0) {
      toast.error(`${result.dropped} transaksi ditolak server`);
    }
  }

  if (count === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm">
      <CloudOff className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-xs">
        <span className="font-medium">{count} transaksi</span> menunggu koneksi dan akan dikirim
        otomatis saat online.
      </p>
      <button
        type="button"
        onClick={() => void sendNow()}
        disabled={busy}
        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
      >
        <RefreshCw className={busy ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        Kirim
      </button>
    </div>
  );
}
