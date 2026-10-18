'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { SheetData, SheetMode } from '@/lib/view-types';
import { TransactionSheet } from './transaction-sheet';

interface SheetController {
  openCreate: (mode?: SheetMode) => void;
  openEdit: (transactionId: string) => void;
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
  children,
}: {
  data: SheetData;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [createMode, setCreateMode] = useState<SheetMode>('expense');
  const [editId, setEditId] = useState<string | null>(null);

  const openCreate = useCallback((mode: SheetMode = 'expense') => {
    setEditId(null);
    setCreateMode(mode);
    setOpen(true);
  }, []);

  const openEdit = useCallback((transactionId: string) => {
    setEditId(transactionId);
    setOpen(true);
  }, []);

  const controller = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);

  return (
    <SheetContext.Provider value={controller}>
      {children}
      <TransactionSheet
        data={data}
        open={open}
        onOpenChange={setOpen}
        createMode={createMode}
        editId={editId}
      />
    </SheetContext.Provider>
  );
}
