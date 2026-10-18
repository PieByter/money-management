import type { TransactionListItem } from '@/server/services/transactions';
import { jakartaYmd } from '@/lib/dates';

export type DisplayKind = 'income' | 'expense' | 'transfer' | 'adjustment';

export interface DisplayTransaction {
  /** Key unik untuk list (transfer digabung per group). */
  key: string;
  /** id baris ledger untuk edit/hapus. */
  primaryId: string;
  /** group_id baris transfer (untuk ikut menyembunyikan pasangannya). */
  groupId: string | null;
  kind: DisplayKind;
  amount: number;
  occurredAt: Date;
  title: string;
  subtitle: string | null;
  walletName: string;
  fromWallet?: string;
  toWallet?: string;
  note: string | null;
  icon: string | null;
  color: string | null;
}

function mapSingle(item: TransactionListItem, key: string): DisplayTransaction {
  const base = {
    key,
    primaryId: item.id,
    groupId: item.groupId,
    amount: item.amount,
    occurredAt: new Date(item.occurredAt),
    walletName: item.walletName,
    note: item.note,
    icon: item.categoryIcon,
    color: item.categoryColor,
  };

  if (item.kind === 'income' || item.kind === 'expense') {
    const title =
      item.categoryName ?? (item.kind === 'income' ? 'Pemasukan' : 'Pengeluaran');
    const subtitle = [item.note].filter(Boolean).join(' · ') || null;
    return { ...base, kind: item.kind, title, subtitle };
  }

  if (item.kind === 'transfer_out' || item.kind === 'transfer_in') {
    return {
      ...base,
      kind: 'transfer',
      title: 'Transfer',
      subtitle: null,
      fromWallet: item.kind === 'transfer_out' ? item.walletName : undefined,
      toWallet: item.kind === 'transfer_in' ? item.walletName : undefined,
      icon: item.walletIcon,
      color: item.walletColor,
    };
  }

  return {
    ...base,
    kind: 'adjustment',
    title: item.note ?? (item.kind === 'adjustment_in' ? 'Penyesuaian masuk' : 'Penyesuaian keluar'),
    subtitle: null,
    icon: '⚖️',
    color: null,
  };
}

/**
 * Gabungkan dua leg transfer (dengan group_id sama) menjadi satu baris tampilan.
 * Baris fee admin (expense di group yang sama) tetap tampil terpisah.
 */
export function toDisplayTransactions(items: TransactionListItem[]): DisplayTransaction[] {
  const map = new Map<string, DisplayTransaction>();
  const order: string[] = [];

  for (const item of items) {
    const isTransferLeg = item.kind === 'transfer_in' || item.kind === 'transfer_out';
    const key = isTransferLeg && item.groupId ? `g:${item.groupId}` : `t:${item.id}`;
    const existing = map.get(key);

    if (existing && isTransferLeg) {
      if (item.kind === 'transfer_out') {
        existing.fromWallet = item.walletName;
        existing.primaryId = item.id;
        existing.icon = item.walletIcon;
        existing.color = item.walletColor;
      } else {
        existing.toWallet = item.walletName;
      }
      existing.amount = Math.max(existing.amount, item.amount);
      existing.title = `${existing.fromWallet ?? 'Kantong'} → ${existing.toWallet ?? 'Kantong'}`;
      existing.subtitle = existing.note;
      continue;
    }

    const display = mapSingle(item, key);
    if (display.kind === 'transfer') {
      display.title = `${display.fromWallet ?? 'Kantong'} → ${display.toWallet ?? '…'}`;
    }
    map.set(key, display);
    order.push(key);
  }

  return order.map((key) => map.get(key)!);
}

export interface DayGroup {
  ymd: string;
  items: DisplayTransaction[];
  income: number;
  expense: number;
}

export function groupByDay(items: DisplayTransaction[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const item of items) {
    const ymd = jakartaYmd(item.occurredAt);
    const group = groups.get(ymd) ?? { ymd, items: [], income: 0, expense: 0 };
    group.items.push(item);
    if (item.kind === 'income') group.income += item.amount;
    if (item.kind === 'expense') group.expense += item.amount;
    groups.set(ymd, group);
  }
  return [...groups.values()];
}
