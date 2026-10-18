/**
 * Daftar kantong rekomendasi — dipakai untuk seed user baru, tombol "tambah
 * sekaligus" di halaman kantong, dan preset di dialog tambah kantong.
 * Client-safe (tanpa import server).
 */
export interface WalletPreset {
  name: string;
  type: 'cash' | 'bank' | 'ewallet' | 'other';
  icon: string;
  color: string;
}

export const RECOMMENDED_WALLETS: WalletPreset[] = [
  { name: 'Cash', type: 'cash', icon: '💵', color: '#10b981' },
  { name: 'OVO', type: 'ewallet', icon: '🟣', color: '#8b5cf6' },
  { name: 'GoPay', type: 'ewallet', icon: '🟢', color: '#14b8a6' },
  { name: 'ShopeePay', type: 'ewallet', icon: '🟠', color: '#f97316' },
  { name: 'Bank Mandiri', type: 'bank', icon: '🔵', color: '#0ea5e9' },
  { name: 'Bank Permata', type: 'bank', icon: '🟡', color: '#f59e0b' },
  { name: 'Bank Jago', type: 'bank', icon: '🟤', color: '#ec4899' },
  { name: 'Kartu e-Money', type: 'other', icon: '💳', color: '#64748b' },
];
