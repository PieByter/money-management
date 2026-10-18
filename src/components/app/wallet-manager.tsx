'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Archive, ArchiveRestore, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { formatAmount, parseAmountInput } from '@/lib/money';
import { walletFormSchema, type WalletFormValues } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { WALLET_COLORS, WALLET_ICONS, WALLET_TYPE_OPTIONS } from '@/lib/view-types';
import {
  createWalletAction,
  deleteWalletAction,
  setWalletArchivedAction,
  updateWalletAction,
} from '@/server/actions/wallets';

export interface WalletTarget {
  id: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  balance: number;
  archived: boolean;
}

export function WalletFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: WalletTarget | null;
}) {
  const [openingText, setOpeningText] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useForm<WalletFormValues>({
    resolver: zodResolver(walletFormSchema),
    defaultValues: { name: '', type: 'cash', icon: '💵', color: WALLET_COLORS[0] },
  });
  const icon = form.watch('icon');
  const color = form.watch('color');
  const type = form.watch('type');

  useEffect(() => {
    if (!open) return;
    setOpeningText('');
    form.reset(
      initial
        ? {
            name: initial.name,
            type: initial.type as WalletFormValues['type'],
            icon: initial.icon ?? '💵',
            color: initial.color ?? WALLET_COLORS[0],
          }
        : { name: '', type: 'cash', icon: '💵', color: WALLET_COLORS[0] },
    );
  }, [form, initial, open]);

  async function onSubmit(values: WalletFormValues) {
    setBusy(true);
    try {
      if (initial) {
        const result = await updateWalletAction({
          walletId: initial.id,
          name: values.name,
          type: values.type,
          icon: values.icon,
          color: values.color,
        });
        if (result.ok) {
          toast.success('Kantong diperbarui');
          onOpenChange(false);
        } else {
          toast.error(result.error);
        }
        return;
      }

      const openingBalance = openingText ? (parseAmountInput(openingText) ?? 0) : 0;
      const result = await createWalletAction({
        name: values.name,
        type: values.type,
        icon: values.icon,
        color: values.color,
        openingBalance,
      });
      if (result.ok) {
        toast.success('Kantong dibuat');
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Ubah kantong' : 'Kantong baru'}</DialogTitle>
          {!initial ? (
            <DialogDescription>
              Saldo awal otomatis dicatat sebagai transaksi penyesuaian.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wallet-name">Nama</Label>
            <Input
              id="wallet-name"
              placeholder="BCA, GoPay, Cash…"
              autoFocus
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {WALLET_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => form.setValue('type', option.value)}
                  className={cn(
                    'h-10 rounded-xl border text-sm transition-colors',
                    type === option.value
                      ? 'border-primary bg-accent font-medium text-accent-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ikon</Label>
            <div className="grid grid-cols-8 gap-1">
              {WALLET_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => form.setValue('icon', emoji)}
                  aria-label={`Ikon ${emoji}`}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-lg text-lg transition-colors',
                    icon === emoji ? 'bg-accent ring-2 ring-primary' : 'bg-muted hover:bg-muted/70',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Warna</Label>
            <div className="flex flex-wrap gap-2">
              {WALLET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => form.setValue('color', hex)}
                  aria-label={`Warna ${hex}`}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    color === hex && 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-card',
                  )}
                  style={{ background: hex }}
                />
              ))}
            </div>
          </div>

          {!initial ? (
            <div className="space-y-1.5">
              <Label htmlFor="wallet-opening">Saldo awal (opsional)</Label>
              <Input
                id="wallet-opening"
                inputMode="numeric"
                placeholder="0"
                value={openingText}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '').slice(0, 15);
                  setOpeningText(digits);
                }}
              />
              {openingText ? (
                <p className="text-xs text-muted-foreground">
                  Dicatat sebagai penyesuaian: Rp{formatAmount(Number(openingText))}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : initial ? 'Simpan perubahan' : 'Buat kantong'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WalletCreateButton({ label = 'Tambah' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <WalletFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function WalletActionsMenu({ wallet }: { wallet: WalletTarget }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleArchive() {
    const result = await setWalletArchivedAction({
      walletId: wallet.id,
      archived: !wallet.archived,
    });
    if (result.ok) {
      toast.success(wallet.archived ? 'Kantong diaktifkan kembali' : 'Kantong diarsipkan');
    } else {
      toast.error(result.error);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    const result = await deleteWalletAction(wallet.id);
    setBusy(false);
    setDeleteOpen(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.deleted) {
      toast.success('Kantong dihapus');
    } else {
      toast.error('Kantong punya transaksi — gunakan arsipkan agar riwayat tetap utuh.');
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${wallet.name}`}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil /> Ubah
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void toggleArchive()}>
            {wallet.archived ? <ArchiveRestore /> : <Archive />}
            {wallet.archived ? 'Aktifkan kembali' : 'Arsipkan'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 /> Hapus
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WalletFormDialog open={editOpen} onOpenChange={setEditOpen} initial={wallet} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus kantong “{wallet.name}”?</DialogTitle>
            <DialogDescription>
              Kantong yang sudah punya transaksi tidak bisa dihapus dan hanya bisa diarsipkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={busy}>
              {busy ? 'Menghapus…' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
