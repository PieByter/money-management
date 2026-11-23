'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { formatIdr, formatAmount, parseAmountInput } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  deleteGoalAction,
  saveGoalAction,
  setGoalArchivedAction,
} from '@/server/actions/goals';

export interface GoalWalletOption {
  id: string;
  name: string;
  icon: string | null;
}

export interface GoalTarget {
  id: string;
  name: string;
  targetAmount: number;
  saved: number;
  remaining: number;
  ratio: number;
  walletId: string;
  walletName: string;
  walletIcon: string | null;
  targetYmd: string | null;
  daysLeft: number | null;
  monthlyNeeded: number | null;
  note: string | null;
  archived: boolean;
}

function progressWidth(ratio: number): number {
  return Math.min(Math.max(Math.round(ratio * 100), 0), 100);
}

function targetLabel(goal: GoalTarget): string | null {
  if (!goal.targetYmd) return null;
  if (goal.daysLeft === null) return goal.targetYmd;
  if (goal.daysLeft < 0) return `Lewat ${Math.abs(goal.daysLeft)} hari`;
  if (goal.daysLeft === 0) return 'Target hari ini';
  return `${goal.daysLeft} hari lagi`;
}

export function GoalManager({
  goals,
  wallets,
}: {
  goals: GoalTarget[];
  wallets: GoalWalletOption[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GoalTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const active = goals.filter((goal) => !goal.archived);
  const archived = goals.filter((goal) => goal.archived);
  const usedWallets = useMemo(
    () =>
      new Set(
        active
          .filter((goal) => goal.id !== editing?.id)
          .map((goal) => goal.walletId),
      ),
    [active, editing?.id],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(goal: GoalTarget) {
    setEditing(goal);
    setFormOpen(true);
  }

  async function archive(goal: GoalTarget, next: boolean) {
    setBusy(goal.id);
    const result = await setGoalArchivedAction({ goalId: goal.id, archived: next });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(next ? 'Tujuan diarsipkan' : 'Tujuan dipulihkan');
  }

  async function remove(goal: GoalTarget) {
    if (!window.confirm(`Hapus tujuan "${goal.name}"? Progres dari saldo kantong tidak berubah.`)) {
      return;
    }
    setBusy(goal.id);
    const result = await deleteGoalAction(goal.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Tujuan dihapus');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Progres dihitung dari saldo kantong, jadi transfer ke kantong tujuan langsung menambah
          tabungan.
        </p>
        <Button size="sm" className="shrink-0" onClick={openCreate} disabled={wallets.length === 0}>
          <Plus className="h-4 w-4" /> Tujuan
        </Button>
      </div>

      {wallets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm font-medium">Belum ada kantong yang bisa dipakai</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Buat kantong tabungan dulu (bukan kartu kredit), lalu kembali ke halaman ini.
          </p>
          <Link href="/wallets" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
            Buka kantong
          </Link>
        </div>
      ) : null}

      {active.length === 0 && wallets.length > 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm font-medium">Belum ada tujuan tabungan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mulai dari dana darurat, liburan, atau gadget baru.
          </p>
        </div>
      ) : null}

      <ul className="space-y-3">
        {active.map((goal) => (
          <li key={goal.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{goal.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {goal.walletIcon ? `${goal.walletIcon} ` : ''}
                  {goal.walletName}
                  {targetLabel(goal) ? ` · ${targetLabel(goal)}` : ''}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Aksi untuk ${goal.name}`}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openEdit(goal)}>
                    <Pencil className="h-4 w-4" /> Ubah
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void archive(goal, true)}>
                    <Archive className="h-4 w-4" /> Arsipkan
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-expense"
                    onSelect={() => void remove(goal)}
                  >
                    <Trash2 className="h-4 w-4" /> Hapus
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
              <p className="font-semibold tabular-nums">
                {formatIdr(goal.saved)}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  / {formatIdr(goal.targetAmount)}
                </span>
              </p>
              <p className={cn('text-xs tabular-nums', goal.ratio >= 1 ? 'text-income' : 'text-muted-foreground')}>
                {goal.ratio >= 1 ? 'Tercapai' : `${Math.round(goal.ratio * 100)}%`}
              </p>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', goal.ratio >= 1 ? 'bg-income' : 'bg-primary')}
                style={{ width: `${progressWidth(goal.ratio)}%` }}
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
              <span>
                {goal.ratio >= 1
                  ? 'Target terpenuhi'
                  : `Sisa ${formatIdr(goal.remaining)}`}
                {goal.monthlyNeeded !== null && goal.remaining > 0
                  ? ` · sisihkan ±${formatIdr(goal.monthlyNeeded)}/bulan`
                  : ''}
              </span>
              <Link
                href={`/wallets/${goal.walletId}`}
                className="shrink-0 font-medium text-primary hover:underline"
              >
                Isi dana
              </Link>
            </div>
            {goal.note ? (
              <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                {goal.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {archived.length > 0 ? (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Tujuan diarsipkan ({archived.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {archived.map((goal) => (
              <li key={goal.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">{goal.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === goal.id}
                  onClick={() => void archive(goal, false)}
                >
                  <ArchiveRestore className="h-4 w-4" /> Pulihkan
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <GoalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editing}
        wallets={wallets}
        usedWalletIds={usedWallets}
      />
    </div>
  );
}

function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  wallets,
  usedWalletIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: GoalTarget | null;
  wallets: GoalWalletOption[];
  usedWalletIds: Set<string>;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [walletId, setWalletId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState('');

  // Reset form setiap dialog dibuka dengan data yang berbeda.
  useEffect(() => {
    const nextKey = `${open}:${goal?.id ?? 'new'}`;
    if (nextKey === formKey) return;
    setFormKey(nextKey);
    if (!open) return;
    setName(goal?.name ?? '');
    setTarget(goal ? formatAmount(goal.targetAmount) : '');
    setWalletId(goal?.walletId ?? wallets[0]?.id ?? '');
    setTargetDate(goal?.targetYmd ?? '');
    setNote(goal?.note ?? '');
  }, [formKey, goal, open, wallets]);

  async function submit() {
    const amount = parseAmountInput(target);
    if (!name.trim()) {
      toast.error('Nama tujuan wajib diisi');
      return;
    }
    if (amount === null) {
      toast.error('Target tabungan wajib diisi');
      return;
    }
    if (!walletId) {
      toast.error('Pilih kantong tujuan');
      return;
    }
    setBusy(true);
    const result = await saveGoalAction({
      ...(goal ? { id: goal.id } : {}),
      name: name.trim(),
      targetAmount: amount,
      walletId,
      targetDate: targetDate || null,
      note: note.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(goal ? 'Tujuan diperbarui' : 'Tujuan dibuat');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? 'Ubah tujuan' : 'Tujuan tabungan baru'}</DialogTitle>
          <DialogDescription>
            Pilih kantong khusus agar progres tidak tercampur belanja harian.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Nama tujuan</Label>
            <Input
              id="goal-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mis. Dana darurat"
              maxLength={60}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input
                id="goal-target"
                inputMode="numeric"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="10.000.000"
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">Tanggal target</Label>
              <Input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-wallet">Kantong</Label>
            <select
              id="goal-wallet"
              value={walletId}
              onChange={(event) => setWalletId(event.target.value)}
              className="flex h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                Pilih kantong
              </option>
              {wallets.map((wallet) => (
                <option
                  key={wallet.id}
                  value={wallet.id}
                  disabled={usedWalletIds.has(wallet.id)}
                >
                  {wallet.icon ? `${wallet.icon} ` : ''}
                  {wallet.name}
                  {usedWalletIds.has(wallet.id) ? ' (sudah dipakai)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-note">Catatan (opsional)</Label>
            <Input
              id="goal-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="mis. 6× pengeluaran bulanan"
              maxLength={280}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
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
