/** Tipe ringan yang aman dipakai di client component (tanpa import server). */

import type { ReceiptConfidence, ReceiptItemDraft } from './receipt';
import type { TemplateFrequency } from './template-schedule';

export type SheetMode = 'expense' | 'income' | 'transfer';

export interface WalletOption {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface ItemChip {
  id: string;
  name: string;
  lastPrice: number | null;
}

/** Rincian item yang disimpan di dalam template (snapshot ringan). */
export interface TemplateItemLine {
  itemId: string | null;
  name: string;
  amount: number;
  qtyMilli: number;
}

/** Template transaksi siap pakai (tanggal dikirim sebagai ISO string). */
export interface TemplateSummary {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  amount: number;
  walletId: string;
  categoryId: string | null;
  note: string | null;
  tags: string[];
  items: TemplateItemLine[];
  frequency: TemplateFrequency;
  weekday: number | null;
  dayOfMonth: number | null;
  nextRunAt: string | null;
  /** Tanggal (kalender Jakarta) kemunculan berikutnya — siap ditampilkan. */
  nextRunYmd: string | null;
  lastRunAt: string | null;
  walletName: string | null;
  walletIcon: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
}

/** Isi form dari hasil scan struk (pengguna tetap harus menekan Simpan). */
export interface TransactionPrefill {
  amount: number;
  walletId: string | null;
  categoryId: string | null;
  dateYmd: string | null;
  note: string | null;
  items: ReceiptItemDraft[];
  source: 'receipt';
  rawInput: string;
  warnings: string[];
  confidence: ReceiptConfidence | null;
}

export interface SheetData {
  wallets: WalletOption[];
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  lastUsedWalletId: string | null;
  /** Item yang sering dibeli — chip cepat untuk mode belanja itemized. */
  frequentItems: ItemChip[];
  /** Template yang bisa sekali tap mengisi seluruh form transaksi. */
  templates: TemplateSummary[];
}

export const WALLET_TYPE_LABELS: Record<string, string> = {
  cash: 'Uang tunai',
  bank: 'Rekening bank',
  ewallet: 'Dompet digital',
  other: 'Lainnya',
};

export const WALLET_TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'other', label: 'Lainnya' },
] as const;

export const WALLET_ICONS = [
  '💵', '💳', '🏦', '👛', '🪙', '💰', '📱', '🏧',
  '🟢', '🟣', '🔵', '🟡', '🟠', '🟤', '⚫', '📈',
] as const;

export const WALLET_COLORS = [
  '#10b981', '#0ea5e9', '#f59e0b', '#ec4899', '#8b5cf6',
  '#f97316', '#14b8a6', '#ef4444', '#6366f1', '#64748b',
] as const;

export const CATEGORY_ICONS = [
  '🍜', '🍛', '☕', '🛒', '🚌', '⛽', '🏠', '🧾',
  '💊', '🏥', '🎬', '🎮', '🎓', '📚', '👕', '💄',
  '📦', '🏦', '💼', '🏪', '🎁', '💹', '🧧', '💰',
] as const;
