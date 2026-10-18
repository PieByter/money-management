'use client';

import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';
import { useTransactionSheet } from './transaction-sheet-provider';

/** Aksi cepat input (tampil di desktop; di mobile sudah ada FAB). */
export function QuickActions({ className }: { className?: string }) {
  const { openCreate } = useTransactionSheet();
  return (
    <div className={className}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => openCreate('expense')}
          className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-expense transition-colors hover:bg-muted"
        >
          <ArrowUpRight className="h-4 w-4" /> Catat pengeluaran
        </button>
        <button
          type="button"
          onClick={() => openCreate('income')}
          className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-income transition-colors hover:bg-muted"
        >
          <ArrowDownLeft className="h-4 w-4" /> Catat pemasukan
        </button>
        <button
          type="button"
          onClick={() => openCreate('transfer')}
          className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Pindah kantong
        </button>
      </div>
    </div>
  );
}
