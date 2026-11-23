'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { flushOfflineQueue } from '@/lib/offline-queue';

/**
 * Mengirim antrean offline otomatis saat browser kembali online atau saat
 * aplikasi dibuka. Tetap memakai `client_request_id` sehingga aman dari
 * duplikasi bila pengiriman diulang.
 */
export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function flush() {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const result = await flushOfflineQueue();
      if (cancelled) return;
      if (result.sent > 0) {
        toast.success(
          result.sent === 1
            ? 'Transaksi offline terkirim'
            : `${result.sent} transaksi offline terkirim`,
        );
        router.refresh();
      }
      if (result.dropped > 0) {
        toast.error(
          result.dropped === 1
            ? 'Satu transaksi offline ditolak server — periksa datanya'
            : `${result.dropped} transaksi offline ditolak server`,
        );
      }
    }

    function onOnline() {
      void flush();
    }

    window.addEventListener('online', onOnline);
    // Beri jeda singkat agar halaman selesai hydrate dulu.
    const timer = window.setTimeout(() => void flush(), 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [router]);

  return children;
}
