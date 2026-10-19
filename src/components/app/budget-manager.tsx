'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatAmount, parseAmountInput } from '@/lib/money';
import { cn } from '@/lib/utils';
import { saveBudgetAction, setBudgetEnabledAction } from '@/server/actions/budgets';

export interface BudgetTarget {
  categoryId: string;
  name: string;
  icon: string | null;
  amount: number | null;
  enabled: boolean;
}

export function BudgetManager({ budgets }: { budgets: BudgetTarget[] }) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      budgets.map((budget) => [budget.categoryId, budget.amount ? formatAmount(budget.amount) : '']),
    ),
  );
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(budgets.map((budget) => [budget.categoryId, budget.enabled])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function save(categoryId: string) {
    const amount = parseAmountInput(amounts[categoryId] ?? '');
    if (amount === null) {
      toast.error('Isi nominal budget dulu (angka rupiah)');
      return;
    }
    setBusyId(categoryId);
    const result = await saveBudgetAction({ categoryId, amount });
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEnabled((prev) => ({ ...prev, [categoryId]: true }));
    toast.success('Budget disimpan dan dinyalakan');
  }

  async function toggle(categoryId: string, next: boolean) {
    setBusyId(categoryId);
    const result = await setBudgetEnabledAction({ categoryId, enabled: next });
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEnabled((prev) => ({ ...prev, [categoryId]: next }));
    toast.success(next ? 'Budget dinyalakan' : 'Budget dimatikan');
  }

  if (budgets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada kategori pengeluaran. Buat kategori dulu di bagian Kategori.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Budget aktif muncul sebagai progress bar di dashboard. Matikan tombolnya kalau kategori
        itu sedang tidak mau dipantau — angkanya tetap tersimpan.
      </p>
      <ul className="space-y-2.5">
        {budgets.map((budget) => {
          const isOn = enabled[budget.categoryId] ?? false;
          const hasAmount = Boolean((amounts[budget.categoryId] ?? '').trim());
          const busy = busyId === budget.categoryId;
          return (
            <li key={budget.categoryId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {budget.icon ? `${budget.icon} ` : ''}
                {budget.name}
              </span>
              <Input
                inputMode="numeric"
                value={amounts[budget.categoryId] ?? ''}
                onChange={(event) =>
                  setAmounts((prev) => ({ ...prev, [budget.categoryId]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void save(budget.categoryId);
                }}
                placeholder="Nominal"
                aria-label={`Budget ${budget.name}`}
                className="h-9 w-28 shrink-0 text-right tabular-nums"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={busy || !hasAmount}
                onClick={() => void save(budget.categoryId)}
              >
                Simpan
              </Button>
              <button
                type="button"
                role="switch"
                aria-checked={isOn}
                aria-label={isOn ? `Matikan budget ${budget.name}` : `Nyalakan budget ${budget.name}`}
                disabled={busy || !hasAmount}
                onClick={() => void toggle(budget.categoryId, !isOn)}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40',
                  isOn ? 'border-primary bg-primary' : 'border-border bg-muted',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-card transition-all',
                    isOn ? 'left-6' : 'left-0.5',
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
