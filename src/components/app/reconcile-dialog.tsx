'use client';

import { useState } from 'react';
import { Scale } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatIdr, formatIdrSigned, formatAmount, MAX_AMOUNT } from '@/lib/money';
import { reconcileWalletAction } from '@/server/actions/transactions';

export function ReconcileDialog({
  walletId,
  walletName,
  currentBalance,
}: {
  walletId: string;
  walletName: string;
  currentBalance: number;
}) {
  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const actual = digits === '' ? null : Number(digits);
  const diff = actual === null ? null : actual - currentBalance;

  async function submit() {
    if (actual === null) {
      toast.error('Isi saldo riil kantong');
      return;
    }
    if (!Number.isSafeInteger(actual) || actual > MAX_AMOUNT) {
      toast.error('Saldo tidak valid');
      return;
    }
    setBusy(true);
    const result = await reconcileWalletAction({
      walletId,
      actualBalance: actual,
      note: note.trim() ? note.trim() : null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.diff === 0) {
      toast.success('Saldo sudah cocok, tidak ada penyesuaian.');
    } else {
      toast.success(`Penyesuaian ${formatIdrSigned(result.data.diff)} dicatat.`);
    }
    setOpen(false);
    setDigits('');
    setNote('');
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Scale className="h-4 w-4" /> Rekonsiliasi
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rekonsiliasi {walletName}</DialogTitle>
            <DialogDescription>
              Catat saldo sesuai keadaan sebenarnya. Selisih otomatis disimpan sebagai
              transaksi penyesuaian.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Saldo aplikasi</span>
              <span className="font-semibold tabular-nums">{formatIdr(currentBalance)}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reconcile-balance">Saldo riil</Label>
              <Input
                id="reconcile-balance"
                inputMode="numeric"
                placeholder="0"
                value={digits ? formatAmount(Number(digits)) : ''}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, '').slice(0, 15);
                  setDigits(next.replace(/^0+(?=\d)/, ''));
                }}
                autoFocus
              />
              {diff !== null && diff !== 0 ? (
                <p className="text-xs text-muted-foreground">
                  Selisih:{' '}
                  <span className={diff > 0 ? 'font-medium text-income' : 'font-medium text-expense'}>
                    {formatIdrSigned(diff)}
                  </span>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reconcile-note">Catatan (opsional)</Label>
              <Input
                id="reconcile-note"
                placeholder="Mis. uang kembalian belum dicatat"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan penyesuaian'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
