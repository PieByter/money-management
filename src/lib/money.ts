/**
 * Uang selalu disimpan sebagai integer dalam satuan terkecil (IDR: rupiah utuh).
 * Tidak ada float di jalur uang.
 */

const numberFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function formatAmount(amount: number): string {
  return numberFormatter.format(amount);
}

export function formatIdr(amount: number): string {
  if (amount < 0) return `−Rp ${numberFormatter.format(Math.abs(amount))}`;
  return `Rp ${numberFormatter.format(amount)}`;
}

/** Contoh: +Rp 25.000 / −Rp 25.000 / Rp 0 */
export function formatIdrSigned(amount: number): string {
  if (amount > 0) return `+Rp ${numberFormatter.format(amount)}`;
  if (amount < 0) return `−Rp ${numberFormatter.format(Math.abs(amount))}`;
  return 'Rp 0';
}

const compactFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

/** Format ringkas untuk grafik/label sempit: 1,5 jt · 250 rb · 900 */
export function formatIdrCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${compactFormatter.format(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${sign}${compactFormatter.format(abs / 1_000_000)} jt`;
  if (abs >= 10_000) return `${sign}${compactFormatter.format(abs / 1_000)} rb`;
  return `${sign}${numberFormatter.format(abs)}`;
}

/** "25.000" atau "25000" → 25000. Kembalikan null bila tidak valid. */
export function parseAmountInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

/** Nominal maksimum yang diterima form (1 triliun rupiah). */
export const MAX_AMOUNT = 1_000_000_000_000;
