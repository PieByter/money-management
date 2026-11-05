'use client';

import { ChevronRight, ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTransactionSheet } from './transaction-sheet-provider';

/** CTA scan struk yang terlihat di dashboard mobile. */
export function ScanReceiptButton({ className }: { className?: string }) {
  const { openScan } = useTransactionSheet();

  return (
    <button
      type="button"
      onClick={openScan}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-3.5 py-3 text-left transition-colors hover:bg-primary/10',
        className,
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ScanLine className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Scan struk</span>
        <span className="block text-xs text-muted-foreground">
          Foto struk → form pengeluaran terisi otomatis
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
