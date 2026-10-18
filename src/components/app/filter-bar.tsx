'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { jakartaYearMonth, monthKey, monthLabel, parseMonthKey, shiftMonthKey } from '@/lib/dates';
import { cn } from '@/lib/utils';

const KIND_CHIPS = [
  { value: '', label: 'Semua' },
  { value: 'expense', label: 'Keluar' },
  { value: 'income', label: 'Masuk' },
  { value: 'transfer', label: 'Pindah' },
] as const;

export function FilterBar({
  wallets,
  categories,
}: {
  wallets: { id: string; name: string; icon: string | null }[];
  categories: { id: string; name: string; kind: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // Debounce pencarian agar tidak spam navigasi.
  useEffect(() => {
    const current = searchParamsRef.current.get('q') ?? '';
    if (query === current) return;
    const timeout = setTimeout(() => update({ q: query || null }), 350);
    return () => clearTimeout(timeout);
  }, [query, update]);

  const kindValue = searchParams.get('jenis') ?? '';
  const walletValue = searchParams.get('kantong') ?? '';
  const categoryValue = searchParams.get('kategori') ?? '';
  const monthValue = searchParams.get('m') ?? '';
  const hasFilters = Boolean(kindValue || walletValue || categoryValue || monthValue || query);

  const currentMonthKey = monthKey(jakartaYearMonth());
  const monthOptions = Array.from({ length: 15 }, (_, index) =>
    shiftMonthKey(currentMonthKey, -index),
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari catatan atau kategori…"
          className="pl-9 pr-10"
          aria-label="Cari transaksi"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Hapus pencarian"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-0.5">
        {KIND_CHIPS.map((chip) => {
          const active = kindValue === chip.value;
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => update({ jenis: chip.value || null })}
              className={cn(
                'h-9 shrink-0 rounded-xl border px-3 text-sm transition-colors',
                active
                  ? 'border-primary bg-accent font-medium text-accent-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              {chip.label}
            </button>
          );
        })}

        <select
          value={walletValue}
          onChange={(event) => update({ kantong: event.target.value || null })}
          aria-label="Filter kantong"
          className="h-9 shrink-0 rounded-xl border border-border bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Semua kantong</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.icon ? `${wallet.icon} ` : ''}
              {wallet.name}
            </option>
          ))}
        </select>

        <select
          value={categoryValue}
          onChange={(event) => update({ kategori: event.target.value || null })}
          aria-label="Filter kategori"
          className="h-9 shrink-0 rounded-xl border border-border bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Semua kategori</option>
          <optgroup label="Pengeluaran">
            {categories
              .filter((category) => category.kind === 'expense')
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Pemasukan">
            {categories
              .filter((category) => category.kind === 'income')
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </optgroup>
        </select>

        <select
          value={monthValue}
          onChange={(event) => update({ m: event.target.value || null })}
          aria-label="Filter bulan"
          className="h-9 shrink-0 rounded-xl border border-border bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Semua bulan</option>
          {monthOptions.map((key) => (
            <option key={key} value={key}>
              {monthLabel(parseMonthKey(key))}
            </option>
          ))}
        </select>

        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              router.replace(pathname, { scroll: false });
            }}
            className="h-9 shrink-0 rounded-xl px-2.5 text-sm font-medium text-primary hover:bg-muted"
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
