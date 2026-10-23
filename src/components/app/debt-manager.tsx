'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/app/date-picker';
import { jakartaYmd } from '@/lib/dates';
import { formatAmount, formatIdr, parseAmountInput } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  addDebtPaymentAction,
  createDebtAction,
  deleteDebtAction,
  deleteDebtPaymentAction,
  settleDebtAction,
  updateDebtAction,
} from '@/server/actions/debts';

export interface DebtWalletOption {
  id: string;
  name: string;
  icon: string | null;
}

export interface DebtTarget {
  id: string;
  direction: 'payable' | 'receivable';
  counterparty: string;
  purpose: string | null;
  principal: number;
  paid: number;
  remaining: number;
  status: 'open' | 'paid';
  paymentWalletId: string;
  /** 'YYYY-MM-DD' (kalender WIB) atau null. */
  dueDate: string | null;
  note: string | null;
}

const DIRECTION_COPY = {
  payable: {
    label: 'Hutang',
    hint: 'Uang yang kamu pinjam dan harus dibayar.',
    counterparty: 'Dipinjam dari',
    counterpartyPlaceholder: 'Bank Jago, Budi…',
    funding: 'Uang masuk ke',
    payment: 'Bayar dari',
    payVerb: 'Bayar',
    settle: 'Lunas',
  },
  receivable: {
    label: 'Piutang',
    hint: 'Uang yang kamu pinjamkan dan harus ditagih.',
    counterparty: 'Dipinjamkan ke',
    counterpartyPlaceholder: 'Budi, kantor…',
    funding: 'Uang keluar dari',
    payment: 'Terima ke',
    payVerb: 'Terima',
    settle: 'Lunas',
  },
} as const;

function AmountInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      placeholder={placeholder ?? '0'}
      autoFocus={autoFocus}
      value={value ? formatAmount(Number(value)) : ''}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, '').slice(0, 15);
        onChange(next.replace(/^0+(?=\d)/, ''));
      }}
    />
  );
}

function WalletSelect({
  id,
  label,
  value,
  wallets,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  wallets: DebtWalletOption[];
  onChange: (walletId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
      >
        {wallets.length === 0 ? <option value="">Belum ada kantong</option> : null}
        {wallets.map((wallet) => (
          <option key={wallet.id} value={wallet.id}>
            {wallet.icon ? `${wallet.icon} ` : ''}
            {wallet.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DebtFormDialog({
  open,
  onOpenChange,
  wallets,
  initial,
  defaultDirection = 'payable',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: DebtWalletOption[];
  initial?: DebtTarget | null;
  defaultDirection?: 'payable' | 'receivable';
}) {
  const today = jakartaYmd(new Date());
  const [direction, setDirection] = useState<'payable' | 'receivable'>(defaultDirection);
  const [counterparty, setCounterparty] = useState('');
  const [purpose, setPurpose] = useState('');
  const [principal, setPrincipal] = useState('');
  const [fundingWalletId, setFundingWalletId] = useState('');
  const [paymentWalletId, setPaymentWalletId] = useState('');
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [hasDueDate, setHasDueDate] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fallbackWallet = wallets[0]?.id ?? '';
    setDirection(initial?.direction ?? defaultDirection);
    setCounterparty(initial?.counterparty ?? '');
    setPurpose(initial?.purpose ?? '');
    setPrincipal(initial ? String(initial.principal) : '');
    setFundingWalletId(fallbackWallet);
    setPaymentWalletId(initial?.paymentWalletId ?? fallbackWallet);
    setDate(today);
    setDueDate(initial?.dueDate ?? today);
    setHasDueDate(Boolean(initial?.dueDate));
    setNote(initial?.note ?? '');
  }, [defaultDirection, initial, open, today, wallets]);

  const copy = DIRECTION_COPY[initial?.direction ?? direction];
  const amount = parseAmountInput(principal);

  async function submit() {
    if (!counterparty.trim()) {
      toast.error('Isi dulu nama pihaknya');
      return;
    }
    if (amount === null) {
      toast.error('Nominal pokok belum valid');
      return;
    }
    if (!fundingWalletId || !paymentWalletId) {
      toast.error('Pilih kantong sumber dana dan kantong pembayaran');
      return;
    }

    setBusy(true);
    try {
      if (initial) {
        const result = await updateDebtAction({
          debtId: initial.id,
          counterparty: counterparty.trim(),
          purpose: purpose.trim() || null,
          paymentWalletId,
          dueDate: hasDueDate ? dueDate : null,
          note: note.trim() || null,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success('Data pinjaman diperbarui');
        onOpenChange(false);
        return;
      }

      const result = await createDebtAction({
        direction,
        counterparty: counterparty.trim(),
        purpose: purpose.trim() || null,
        principal: amount,
        fundingWalletId,
        paymentWalletId,
        date,
        dueDate: hasDueDate ? dueDate : null,
        note: note.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        direction === 'payable'
          ? `Hutang ke ${counterparty.trim()} dicatat, dana masuk ke kantong.`
          : `Piutang ke ${counterparty.trim()} dicatat, dana keluar dari kantong.`,
      );
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Ubah pinjaman' : 'Catat pinjaman'}</DialogTitle>
          <DialogDescription>
            {initial
              ? 'Pokok dan kantong sumber dana tidak bisa diubah karena sudah tercatat di ledger.'
              : 'Nominal pokok langsung dicatat ke ledger kantong, jadi saldo dan laporan ikut benar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!initial ? (
            <div className="grid grid-cols-2 gap-2">
              {(['payable', 'receivable'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDirection(option)}
                  aria-pressed={direction === option}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                    direction === option
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted',
                  )}
                >
                  {DIRECTION_COPY[option].label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="debt-counterparty">{copy.counterparty}</Label>
            <Input
              id="debt-counterparty"
              value={counterparty}
              placeholder={copy.counterpartyPlaceholder}
              autoFocus
              onChange={(event) => setCounterparty(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-purpose">Untuk apa</Label>
            <Input
              id="debt-purpose"
              value={purpose}
              placeholder="Mis. beli motor, modal usaha"
              onChange={(event) => setPurpose(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-principal">Nominal pokok</Label>
            <AmountInput
              id="debt-principal"
              value={principal}
              onChange={setPrincipal}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              {initial
                ? `Pokok tercatat ${formatIdr(initial.principal)} · sisa ${formatIdr(initial.remaining)}`
                : copy.hint}
            </p>
          </div>

          {!initial ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <WalletSelect
                id="debt-funding-wallet"
                label={copy.funding}
                value={fundingWalletId}
                wallets={wallets}
                onChange={setFundingWalletId}
              />
              <WalletSelect
                id="debt-payment-wallet"
                label={copy.payment}
                value={paymentWalletId}
                wallets={wallets}
                onChange={setPaymentWalletId}
              />
            </div>
          ) : (
            <WalletSelect
              id="debt-payment-wallet"
              label={copy.payment}
              value={paymentWalletId}
              wallets={wallets}
              onChange={setPaymentWalletId}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Tanggal</span>
            <DatePicker value={date} onChange={setDate} disabled={Boolean(initial)} />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={hasDueDate}
                onChange={(event) => setHasDueDate(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Ada jatuh tempo
            </label>
            {hasDueDate ? <DatePicker value={dueDate} onChange={setDueDate} /> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-note">Catatan (opsional)</Label>
            <Input
              id="debt-note"
              value={note}
              placeholder="Mis. cicilan 12 bulan"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DebtCreateButton({
  wallets,
  label = 'Catat pinjaman',
  defaultDirection = 'payable',
  variant = 'default',
  size = 'default',
  disabled,
}: {
  wallets: DebtWalletOption[];
  label?: string;
  defaultDirection?: 'payable' | 'receivable';
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className="gap-1.5"
        onClick={() => setOpen(true)}
        disabled={disabled || wallets.length === 0}
      >
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <DebtFormDialog
        open={open}
        onOpenChange={setOpen}
        wallets={wallets}
        defaultDirection={defaultDirection}
      />
    </>
  );
}

export function DebtActionsMenu({
  debt,
  wallets,
}: {
  debt: DebtTarget;
  wallets: DebtWalletOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const result = await deleteDebtAction(debt.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Pinjaman dihapus beserta transaksinya');
    setConfirmOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${debt.counterparty}`}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil /> Ubah
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 /> Hapus
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DebtFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        wallets={wallets}
        initial={debt}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus pinjaman?</DialogTitle>
            <DialogDescription>
              Pinjaman {debt.counterparty} beserta semua transaksi pinjaman dan pelunasan di
              Riwayat ikut dihapus, sehingga saldo kantong kembali seperti sebelum dicatat.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              {busy ? 'Menghapus…' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Dialog pembayaran satu pinjaman.
 * `mode="settle"` langsung melunasi sisa (tombol "Lunas"), nominal terkunci.
 */
export function DebtPaymentDialog({
  debt,
  wallets,
  mode,
  open,
  onOpenChange,
}: {
  debt: DebtTarget;
  wallets: DebtWalletOption[];
  mode: 'partial' | 'settle';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = DIRECTION_COPY[debt.direction];
  const [digits, setDigits] = useState('');
  const [walletId, setWalletId] = useState(debt.paymentWalletId);
  const [date, setDate] = useState(jakartaYmd(new Date()));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDigits(mode === 'settle' ? String(debt.remaining) : '');
    setWalletId(debt.paymentWalletId);
    setDate(jakartaYmd(new Date()));
    setNote('');
  }, [debt.paymentWalletId, debt.remaining, mode, open]);

  const amount = mode === 'settle' ? debt.remaining : parseAmountInput(digits);

  async function submit() {
    if (amount === null || amount <= 0) {
      toast.error('Nominal belum valid');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        debtId: debt.id,
        walletId,
        date,
        note: note.trim() || null,
      };
      const result =
        mode === 'settle'
          ? await settleDebtAction(payload)
          : await addDebtPaymentAction({ ...payload, amount });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        mode === 'settle'
          ? debt.direction === 'payable'
            ? `Lunas! ${formatIdr(amount)} tercatat keluar dari kantong.`
            : `Lunas! ${formatIdr(amount)} masuk ke kantong.`
          : 'Pembayaran tercatat',
      );
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'settle' ? `Lunasi ${copy.label.toLowerCase()}` : copy.payVerb}</DialogTitle>
          <DialogDescription>
            {debt.counterparty} · sisa {formatIdr(debt.remaining)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === 'settle' ? (
            <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Nominal pelunasan</span>
              <span className="font-semibold tabular-nums">{formatIdr(debt.remaining)}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="debt-payment-amount">Nominal</Label>
              <AmountInput
                id="debt-payment-amount"
                value={digits}
                onChange={setDigits}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Maksimal {formatIdr(debt.remaining)}. Isi penuh untuk langsung lunas.
              </p>
            </div>
          )}

          <WalletSelect
            id="debt-payment-wallet"
            label={copy.payment}
            value={walletId}
            wallets={wallets}
            onChange={setWalletId}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Tanggal</span>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-payment-note">Catatan (opsional)</Label>
            <Input
              id="debt-payment-note"
              value={note}
              placeholder="Mis. angsuran ke-2"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            {debt.direction === 'payable'
              ? 'Uang keluar dari kantong yang dipilih dan tercatat sebagai pengeluaran.'
              : 'Uang masuk ke kantong yang dipilih dan tercatat sebagai pemasukan.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Menyimpan…' : mode === 'settle' ? 'Lunasi sekarang' : 'Simpan pembayaran'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DebtPaymentActions({
  debt,
  wallets,
}: {
  debt: DebtTarget;
  wallets: DebtWalletOption[];
}) {
  const copy = DIRECTION_COPY[debt.direction];
  const [mode, setMode] = useState<'partial' | 'settle' | null>(null);

  if (debt.status === 'paid') {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-xl bg-income/10 px-3 py-2 text-sm font-medium text-income">
        <CheckCircle2 className="h-4 w-4" /> Sudah lunas
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMode('partial')}>
          {copy.payVerb} sebagian
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => setMode('settle')}>
          <CheckCircle2 className="h-4 w-4" /> {copy.settle}
        </Button>
      </div>
      <DebtPaymentDialog
        debt={debt}
        wallets={wallets}
        mode={mode ?? 'partial'}
        open={mode !== null}
        onOpenChange={(next) => {
          if (!next) setMode(null);
        }}
      />
    </>
  );
}

export function DebtPaymentDeleteButton({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const result = await deleteDebtPaymentAction(paymentId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Pembayaran dibatalkan');
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Batalkan pembayaran ini"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan pembayaran?</DialogTitle>
            <DialogDescription>
              Transaksi pembayaran ini dihapus dari Riwayat dan sisa pinjaman dihitung ulang.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              {busy ? 'Memproses…' : 'Batalkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
