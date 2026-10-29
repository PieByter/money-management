/**
 * Jadwal template transaksi (mis. "tiap Senin beli susu + roti").
 *
 * Semua perhitungan memakai kalender Jakarta dan hanya bekerja dengan string
 * 'YYYY-MM-DD' — tidak ada jam/instan di sini, supaya jadwal tidak bergeser
 * karena zona waktu server.
 */

export const TEMPLATE_FREQUENCIES = ['none', 'daily', 'weekly', 'monthly'] as const;
export type TemplateFrequency = (typeof TEMPLATE_FREQUENCIES)[number];

/** Senin = 1 … Minggu = 7 (kalender Indonesia). */
export const WEEKDAY_NAMES = [
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
  'Minggu',
] as const;

export const FREQUENCY_OPTIONS: { value: TemplateFrequency; label: string }[] = [
  { value: 'none', label: 'Tanpa jadwal' },
  { value: 'daily', label: 'Setiap hari' },
  { value: 'weekly', label: 'Setiap minggu' },
  { value: 'monthly', label: 'Setiap bulan' },
];

export interface TemplateSchedule {
  frequency: TemplateFrequency;
  weekday: number | null;
  dayOfMonth: number | null;
}

export function weekdayName(weekday: number | null | undefined): string {
  if (!weekday) return '';
  return WEEKDAY_NAMES[weekday - 1] ?? '';
}

/** Nomor hari (Senin = 1 … Minggu = 7) dari 'YYYY-MM-DD'. */
export function weekdayOf(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ymdOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Kemunculan berikutnya **setelah** `afterYmd` (eksklusif). `null` untuk
 * template tanpa jadwal. Tanggal 31 pada bulan yang lebih pendek jatuh ke hari
 * terakhir bulan itu.
 */
export function nextRunYmd(schedule: TemplateSchedule, afterYmd: string): string | null {
  if (schedule.frequency === 'none') return null;

  if (schedule.frequency === 'daily') {
    const [year, month, day] = afterYmd.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return ymdOf(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }

  if (schedule.frequency === 'weekly') {
    const target = normalizeWeekday(schedule.weekday);
    const delta = (target - weekdayOf(afterYmd) + 7) % 7 || 7;
    const [year, month, day] = afterYmd.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + delta));
    return ymdOf(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }

  // monthly: masih bulan ini kalau tanggalnya belum lewat, kalau tidak bulan depan.
  const [year, month, day] = afterYmd.split('-').map(Number);
  const target = normalizeDayOfMonth(schedule.dayOfMonth);
  const thisMonth = Math.min(target, lastDayOfMonth(year, month));
  if (thisMonth > day) return ymdOf(year, month, thisMonth);

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return ymdOf(nextYear, nextMonth, Math.min(target, lastDayOfMonth(nextYear, nextMonth)));
}

export function normalizeWeekday(weekday: number | null | undefined): number {
  if (!weekday || weekday < 1 || weekday > 7) return 1;
  return Math.trunc(weekday);
}

export function normalizeDayOfMonth(day: number | null | undefined): number {
  if (!day || day < 1 || day > 31) return 1;
  return Math.trunc(day);
}

/** Label manusiawi: 'Setiap Senin', 'Setiap tanggal 5', dst. */
export function scheduleLabel(schedule: TemplateSchedule): string {
  switch (schedule.frequency) {
    case 'daily':
      return 'Setiap hari';
    case 'weekly':
      return `Setiap ${weekdayName(normalizeWeekday(schedule.weekday))}`;
    case 'monthly':
      return `Setiap tanggal ${normalizeDayOfMonth(schedule.dayOfMonth)}`;
    default:
      return 'Tanpa jadwal';
  }
}
