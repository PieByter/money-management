/** Tipe ringan yang aman dipakai di client component (tanpa import server). */

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

export interface SheetData {
  wallets: WalletOption[];
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  lastUsedWalletId: string | null;
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
  '🟢', '🟣', '🔵', '🟡', '📈', '🧧', '🏪', '🎒',
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
