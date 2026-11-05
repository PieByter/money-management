'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ReceiptScanDraft } from '@/lib/receipt';
import type { SheetData, SheetMode, TransactionPrefill } from '@/lib/view-types';
import { ReceiptScanner } from './receipt-scanner';
import { TransactionSheet } from './transaction-sheet';

interface SheetController {
  openCreate: (mode?: SheetMode, prefill?: TransactionPrefill | null) => void;
  openEdit: (transactionId: string) => void;
  openScan: () => void;
}

const SheetContext = createContext<SheetController | null>(null);

export function useTransactionSheet(): SheetController {
  const context = useContext(SheetContext);
  if (!context) {
    throw new Error('useTransactionSheet harus dipakai di dalam TransactionSheetProvider');
  }
  return context;
}

export function TransactionSheetProvider({
  data,
  receiptAiReady,
  children,
}: {
  data: SheetData;
  receiptAiReady: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [createMode, setCreateMode] = useState<SheetMode>('expense');
  const [editId, setEditId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);

  const openCreate = useCallback(
    (mode: SheetMode = 'expense', nextPrefill: TransactionPrefill | null = null) => {
      setEditId(null);
      setCreateMode(mode);
      setPrefill(nextPrefill);
      setOpen(true);
    },
    [],
  );

  const openEdit = useCallback((transactionId: string) => {
    setPrefill(null);
    setEditId(transactionId);
    setOpen(true);
  }, []);

  const openScan = useCallback(() => setScanOpen(true), []);

  const handleScanned = useCallback((draft: ReceiptScanDraft) => {
    const nextPrefill: TransactionPrefill = {
      amount: draft.total,
      walletId: draft.walletId,
      categoryId: draft.categoryId,
      dateYmd: draft.dateYmd,
      note: draft.note,
      items: draft.items,
      source: 'receipt',
      rawInput: draft.rawInput,
      warnings: draft.warnings,
      confidence: draft.confidence,
    };

    setScanOpen(false);
    setPrefill(nextPrefill);
    // Tutup dialog scan dulu agar tidak berebut focus/scroll lock dengan sheet.
    window.setTimeout(() => {
      setEditId(null);
      setCreateMode('expense');
      setOpen(true);
    }, 180);

    if (draft.warnings.length > 0) {
      toast.info('Struk terbaca — periksa hasilnya', {
        description: draft.warnings.slice(0, 2).join(' '),
        duration: 7000,
      });
    } else {
      toast.success('Struk terbaca — periksa lalu simpan');
    }
  }, []);

  const controller = useMemo(
    () => ({ openCreate, openEdit, openScan }),
    [openCreate, openEdit, openScan],
  );

  return (
    <SheetContext.Provider value={controller}>
      {children}
      <TransactionSheet
        data={data}
        open={open}
        onOpenChange={setOpen}
        createMode={createMode}
        editId={editId}
        prefill={prefill}
      />
      <ReceiptScanner
        open={scanOpen}
        onOpenChange={setScanOpen}
        aiReady={receiptAiReady}
        onScanned={handleScanned}
      />
    </SheetContext.Provider>
  );
}
