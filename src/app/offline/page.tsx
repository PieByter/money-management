import Link from 'next/link';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-4xl" aria-hidden>
        📶
      </span>
      <h1 className="text-lg font-semibold">Kamu sedang offline</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Halaman ini belum tersimpan di perangkat. Periksa koneksi, lalu buka kembali
        aplikasi.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
      >
        Coba lagi
      </Link>
    </div>
  );
}
