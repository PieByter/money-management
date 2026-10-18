'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-expense" aria-hidden />
      <h1 className="text-lg font-semibold">Terjadi kesalahan saat memuat data</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Coba lagi. Jika terus berulang, periksa konfigurasi database (DATABASE_URL) — saat
        deploy di Vercel, gunakan connection string Supabase <b>Transaction pooler</b> (port
        6543).
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Kode kesalahan: {error.digest}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button onClick={reset}>Coba lagi</Button>
        <Link href="/api/health" className="text-sm font-medium text-primary hover:underline">
          Cek status sistem
        </Link>
      </div>
    </div>
  );
}
