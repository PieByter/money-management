'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { jakartaYmd } from '@/lib/dates';
import { formatAmount, formatIdr } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { CategoryOption, SheetData, SheetMode, WalletOption } from '@/lib/view-types';
import {
  createTransactionAction,
  createTransferAction,
  deleteTransactionAction,
  getTransactionDetailAction,
  restoreTransactionsAction,
  updateTransactionAction,
  updateTransferAction,
} from '@/server/actions/transactions';
import { Numpad, type NumpadKey } from './numpad';

const SEGMENTS: { value: SheetMode; label: string }[] = [
  { value: 'expense', label: 'Keluar' },
  { value: 'income', label: 'Masuk' },
  { value: 'transfer', label: 'Pindah' },
];

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function appendKey(prev: string, key: NumpadKey): string {
  if (key === 'back') return prev.slice(0, -1);
  if (key === 'clear') return '';
  if (key === 'rb') return prev === '' ? prev : `${prev}000`.slice(0, 15);
  if (key === '000') return prev === '' ? prev : `${prev}000`.slice(0, 15);
  if (prev === '0') return key;
  return `${prev}${key}`.slice(0, 15);
}

function digitsToAmount(digits: string): number {
  const value = Number(digits || '0');
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

interface TransactionSheetProps {
  data: SheetData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createMode: SheetMode;
  editId: string | null;
}

export function TransactionSheet({ data, open, onOpenChange, createMode, editId }: TransactionSheetProps) {
  const [mode, setMode] = useState<SheetMode>('expense');
  const [digits, setDigits] = useState('');
  const [feeDigits, setFeeDigits] = useState('');
  const [fromWalletId, setFromWalletId] = useState<string | null>(null);
  const [toWalletId, setToWalletId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dateYmd, setDateYmd] = useState(jakartaYmd(new Date()));
  const [note, setNote] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editKind, setEditKind] = useState<string | null>(null);
  const router = useRouter();

  const isTransferEdit = editKind === 'transfer_in' || editKind === 'transfer_out';
  const amount = digitsToAmount(digits);
  const fee = digitsToAmount(feeDigits);

  /** Tutup sheet lalu buka halaman terkait (kelola kantong/kategori). */
  const goTo = useCallback(
    (path: string) => {
      onOpenChange(false);
      router.push(path);
    },
    [onOpenChange, router],
  );

  // Reset/init saat sheet dibuka.
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setRequestId(newRequestId());
    setDateYmd(jakartaYmd(new Date()));
    setNote('');
    setTagsRaw('');
    setFeeDigits('');

    if (editId) {
      setLoadingEdit(true);
      void getTransactionDetailAction(editId).then((result) => {
        setLoadingEdit(false);
        if (!result.ok) {
          toast.error(result.error);
          onOpenChange(false);
          return;
        }
        const { transaction, transfer } = result.data;
        setEditKind(transaction.kind);
        setDigits(String(transaction.amount));
        setDateYmd(jakartaYmd(new Date(transaction.occurredAt)));
        setNote(transaction.note ?? '');
        setTagsRaw((transaction.tags ?? []).join(', '));
        if (transfer) {
          setMode('transfer');
          setFromWalletId(transfer.fromWalletId);
          setToWalletId(transfer.toWalletId);
          setCategoryId(null);
          setFeeDigits(transfer.feeAmount > 0 ? String(transfer.feeAmount) : '');
        } else {
          setMode(transaction.kind === 'income' ? 'income' : 'expense');
          setFromWalletId(transaction.walletId);
          setToWalletId(null);
          setCategoryId(transaction.categoryId);
        }
      });
      return;
    }

    setEditKind(null);
    setDigits('');
    setMode(createMode);
    setFromWalletId(data.lastUsedWalletId ?? data.wallets[0]?.id ?? null);
    setToWalletId(null);
    const categories = createMode === 'income' ? data.incomeCategories : data.expenseCategories;
    setCategoryId(createMode === 'transfer' ? null : (categories[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const pressKey = useCallback((key: NumpadKey) => {
    setDigits((prev) => appendKey(prev, key));
  }, []);

  const submit = useCallback(async () => {
    if (busy || loadingEdit) return;
    const parsedTags = tagsRaw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10);
    const cleanNote = note.trim() ? note.trim() : null;

    if (amount <= 0) {
      toast.error('Isi nominal dulu');
      return;
    }
    if (mode === 'transfer') {
      if (!fromWalletId || !toWalletId) {
        toast.error('Pilih kantong asal dan tujuan');
        return;
      }
      if (fromWalletId === toWalletId) {
        toast.error('Kantong asal dan tujuan tidak boleh sama');
        return;
      }
    } else if (!fromWalletId) {
      toast.error('Pilih kantong dulu');
      return;
    }

    setBusy(true);
    try {
      if (editId) {
        const result =
          mode === 'transfer'
            ? await updateTransferAction({
                transactionId: editId,
                fromWalletId,
                toWalletId,
                amount,
                feeAmount: fee,
                date: dateYmd,
                note: cleanNote,
              })
            : await updateTransactionAction({
                transactionId: editId,
                kind: mode,
                amount,
                walletId: fromWalletId,
                categoryId,
                date: dateYmd,
                note: cleanNote,
                tags: parsedTags,
              });
        if (result.ok) {
          toast.success('Perubahan tersimpan');
          onOpenChange(false);
        } else {
          toast.error(result.error);
        }
        return;
      }

      const result =
        mode === 'transfer'
          ? await createTransferAction({
              fromWalletId,
              toWalletId,
              amount,
              feeAmount: fee,
              date: dateYmd,
              note: cleanNote,
              clientRequestId: requestId,
            })
          : await createTransactionAction({
              kind: mode,
              amount,
              walletId: fromWalletId,
              categoryId,
              date: dateYmd,
              note: cleanNote,
              tags: parsedTags,
              clientRequestId: requestId,
            });
      if (result.ok) {
        toast.success(mode === 'transfer' ? 'Transfer tersimpan' : 'Transaksi tersimpan');
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }, [
    amount, busy, categoryId, dateYmd, editId, fee, fromWalletId, loadingEdit, mode, note, onOpenChange, requestId, tagsRaw, toWalletId,
  ]);

  // Dukungan keyboard untuk desktop (angka, backspace, Enter).
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (typing) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        pressKey(event.key as NumpadKey);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        pressKey('back');
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void submitRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, pressKey]);

  async function handleDelete() {
    if (!editId) return;
    setBusy(true);
    const result = await deleteTransactionAction(editId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const removedIds = result.data.ids;
    onOpenChange(false);
    toast.success(isTransferEdit ? 'Transfer dihapus' : 'Transaksi dihapus', {
      duration: 6000,
      action: {
        label: 'Urungkan',
        onClick: () => {
          void (async () => {
            const restored = await restoreTransactionsAction(removedIds);
            if (!restored.ok) {
              toast.error(restored.error);
              return;
            }
            toast.success('Transaksi dikembalikan');
          })();
        },
      },
    });
  }

  const wallets = data.wallets;
  const categories = mode === 'income' ? data.incomeCategories : data.expenseCategories;
  const todayYmd = jakartaYmd(new Date());
  const yesterdayYmd = jakartaYmd(new Date(Date.now() - 86_400_000));

  /** Saat tipe berganti, pastikan kategori terpilih tetap sejenis. */
  const switchMode = useCallback(
    (next: SheetMode) => {
      setMode(next);
      if (next === 'transfer') {
        setCategoryId(null);
        return;
      }
      const list = next === 'income' ? data.incomeCategories : data.expenseCategories;
      setCategoryId((current) =>
        list.some((category) => category.id === current) ? current : (list[0]?.id ?? null),
      );
    },
    [data.expenseCategories, data.incomeCategories],
  );

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        {/* Overlay transparan: tetap ada agar klik di luar menutup panel, tanpa peredupan. */}
        <Drawer.Overlay className="fixed inset-0 z-40 bg-transparent" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[96dvh] flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl outline-none lg:inset-y-0 lg:mx-auto lg:my-auto lg:h-fit lg:max-h-[calc(100dvh-3rem)] lg:w-[min(72rem,94vw)] lg:rounded-3xl lg:border lg:ring-1 lg:ring-black/5 dark:lg:ring-white/10 lg:after:hidden! [will-change:auto]!"
        aria-describedby={undefined}
          >
          <Drawer.Title className="sr-only">
            {editId ? 'Ubah transaksi' : 'Tambah transaksi'}
          </Drawer.Title>
          <div
            className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-border lg:hidden"
            aria-hidden
          />

          <div className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:max-w-6xl lg:py-2">
            <div className="flex items-center justify-between gap-2 px-4 pt-2.5 lg:px-6">
              <div className="flex rounded-xl bg-muted p-1" role="tablist" aria-label="Tipe transaksi">
                {SEGMENTS.map((segment) => {
                  const disabled =
                    Boolean(editId) &&
                    ((isTransferEdit && segment.value !== 'transfer') ||
                      (!isTransferEdit && segment.value === 'transfer'));
                  return (
                    <button
                      key={segment.value}
                      type="button"
                      role="tab"
                      aria-selected={mode === segment.value}
                      disabled={disabled}
                      onClick={() => switchMode(segment.value)}
                      className={cn(
                        'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                        mode === segment.value
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                        disabled && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      {segment.label}
                    </button>
                  );
                })}
              </div>
              {editId ? (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={busy}
                  aria-label={isTransferEdit ? 'Hapus transfer ini' : 'Hapus transaksi ini'}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-destructive/10 px-3 text-sm text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus
                </button>
              ) : null}
            </div>

            {/* Layar lebar: dua kolom — form (kiri) + numpad & simpan (kanan). */}
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8 lg:px-8">
              <div className="flex min-h-0 flex-col overflow-y-auto px-4 pt-2 lg:px-0 lg:pt-4">
                <div className="py-2 text-center lg:pb-4 lg:pt-0 lg:text-left">
                <div
                  className={cn(
                    'text-4xl font-semibold tabular-nums tracking-tight',
                    amount <= 0 && 'text-muted-foreground/50',
                  )}
                >
                  {formatIdr(amount)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {mode === 'expense'
                    ? 'Pengeluaran'
                    : mode === 'income'
                      ? 'Pemasukan'
                      : 'Pindah antar kantong'}
                  {loadingEdit ? ' · memuat…' : ''}
                </p>
              </div>

              <section className="mt-1 space-y-3 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3 sm:space-y-0">
                {mode === 'transfer' ? (
                  <>
                    <LabeledRow
                      label="Dari"
                      className="sm:col-span-2"
                      action={
                        <button
                          type="button"
                          onClick={() => goTo('/wallets')}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Kelola kantong
                        </button>
                      }
                    >
                      <WalletChips
                        wallets={wallets}
                        value={fromWalletId}
                        excludeId={toWalletId}
                        onChange={setFromWalletId}
                        onCreate={() => goTo('/wallets')}
                      />
                    </LabeledRow>
                    <LabeledRow label="Ke" className="sm:col-span-2">
                      <WalletChips
                        wallets={wallets}
                        value={toWalletId}
                        excludeId={fromWalletId}
                        onChange={setToWalletId}
                        onCreate={() => goTo('/wallets')}
                      />
                    </LabeledRow>
                  </>
                ) : (
                  <LabeledRow
                    label="Kantong"
                    className="sm:col-span-2"
                    action={
                      <button
                        type="button"
                        onClick={() => goTo('/wallets')}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Kelola kantong
                      </button>
                    }
                  >
                    <WalletChips
                      wallets={wallets}
                      value={fromWalletId}
                      onChange={setFromWalletId}
                      onCreate={() => goTo('/wallets')}
                    />
                  </LabeledRow>
                )}

                {mode !== 'transfer' ? (
                  <LabeledRow
                    label="Kategori"
                    className="sm:col-span-2"
                    action={
                      <button
                        type="button"
                        onClick={() => goTo('/settings#kategori')}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Kelola kategori
                      </button>
                    }
                  >
                    <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />
                  </LabeledRow>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => setDateYmd(todayYmd)}
                    className={dateChipClass(dateYmd === todayYmd)}
                  >
                    Hari ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateYmd(yesterdayYmd)}
                    className={dateChipClass(dateYmd === yesterdayYmd)}
                  >
                    Kemarin
                  </button>
                  <input
                    type="date"
                    value={dateYmd}
                    onChange={(event) => {
                      if (event.target.value) setDateYmd(event.target.value);
                    }}
                    className="h-9 rounded-xl border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Tanggal transaksi"
                  />
                </div>

                {mode === 'transfer' ? (
                  <div className="flex items-center gap-2 sm:col-span-1">
                    <label
                      htmlFor="fee-input"
                      className="w-24 shrink-0 text-xs font-medium text-muted-foreground"
                    >
                      Biaya admin
                    </label>
                    <Input
                      id="fee-input"
                      inputMode="numeric"
                      placeholder="0"
                      value={feeDigits ? formatAmount(fee) : ''}
                      onChange={(event) => {
                        const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 15);
                        setFeeDigits(digitsOnly === '0' ? '' : digitsOnly);
                      }}
                      className="h-10"
                    />
                  </div>
                ) : null}

                <Input
                  placeholder="Catatan (opsional)"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={280}
                  aria-label="Catatan"
                  className={cn('sm:col-span-1', mode === 'transfer' && 'sm:col-span-2')}
                />
                <Input
                  placeholder="Tag, pisahkan dengan koma (opsional)"
                  value={tagsRaw}
                  onChange={(event) => setTagsRaw(event.target.value)}
                  aria-label="Tag"
                  className="sm:col-span-2"
                />
              </section>
              </div>

              <div className="shrink-0 border-t border-border px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2.5 lg:flex lg:flex-col lg:justify-center lg:border-l lg:border-t-0 lg:pb-6 lg:pl-8 lg:pt-2">
                <Numpad onKey={pressKey} />
                <Button
                  className="mt-2 h-12 w-full text-base"
                  onClick={() => void submit()}
                  disabled={busy || loadingEdit}
                >
                  {busy ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Simpan'}
                </Button>
                <p className="mt-2 hidden text-center text-xs text-muted-foreground lg:block">
                  Tip: ketik angka langsung dari keyboard — Enter menyimpan, Backspace menghapus.
                </p>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function LabeledRow({
  label,
  action,
  className,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function dateChipClass(active: boolean): string {
  return cn(
    'h-9 rounded-xl border px-3 text-sm transition-colors',
    active
      ? 'border-primary bg-accent font-medium text-accent-foreground'
      : 'border-border bg-card text-muted-foreground hover:bg-muted',
  );
}

function WalletChips({
  wallets,
  value,
  onChange,
  excludeId,
  onCreate,
}: {
  wallets: WalletOption[];
  value: string | null;
  onChange: (id: string) => void;
  excludeId?: string | null;
  onCreate?: () => void;
}) {
  if (wallets.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Belum ada kantong.</span>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + Buat kantong
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {wallets.map((wallet) => {
        const active = wallet.id === value;
        const disabled = wallet.id === excludeId;
        return (
          <button
            key={wallet.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(wallet.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              active
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted',
              disabled && 'opacity-40',
            )}
          >
            <span aria-hidden>{wallet.icon ?? '💳'}</span>
            {wallet.name}
          </button>
        );
      })}
    </div>
  );
}

function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: CategoryOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => {
        const active = category.id === value;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onChange(category.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              active
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            <span aria-hidden>{category.icon ?? '🏷️'}</span>
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
