/**
 * Semua perhitungan "bulan ini / hari ini" memakai zona Asia/Jakarta (WIB, UTC+7).
 * WIB tidak memakai DST, sehingga offset tetap +07:00 sepanjang tahun.
 */

export const JAKARTA_TIME_ZONE = 'Asia/Jakarta';
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Instant → 'YYYY-MM-DD' menurut kalender Jakarta. */
export function jakartaYmd(date: Date): string {
  return ymdFormatter.format(date);
}

export interface YearMonth {
  year: number;
  /** 1-12 */
  month: number;
}

export function jakartaYearMonth(date: Date = new Date()): YearMonth {
  const [y, m] = jakartaYmd(date).split('-');
  return { year: Number(y), month: Number(m) };
}

/** {2026, 10} → '2026-10' */
export function monthKey(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}

export function parseMonthKey(key: string): YearMonth {
  const [y, m] = key.split('-');
  return { year: Number(y), month: Number(m) };
}

export function shiftMonthKey(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const total = year * 12 + (month - 1) + delta;
  return monthKey({ year: Math.floor(total / 12), month: (total % 12) + 1 });
}

/** Rentang instant [start, end) untuk satu bulan kalender Jakarta. */
export function monthRangeUtc({ year, month }: YearMonth): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - WIB_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0) - WIB_OFFSET_MS);
  return { start, end };
}

export function monthRangeFromKey(key: string): { start: Date; end: Date } {
  return monthRangeUtc(parseMonthKey(key));
}

/** 'YYYY-MM-DD' (kalender Jakarta) → instant pukul 12:00 WIB hari itu. */
export function jakartaDateAtNoonUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0) - WIB_OFFSET_MS);
}

/**
 * Instant untuk tanggal yang dipilih user di form.
 * Hari ini (WIB) → waktu sekarang agar urutan jam akurat;
 * hari lain → 12:00 WIB agar pasti berada di hari tersebut.
 */
export function resolveOccurredAt(ymd: string | null | undefined, reference: Date = new Date()): Date {
  if (!ymd) return reference;
  if (ymd === jakartaYmd(reference)) return reference;
  return jakartaDateAtNoonUtc(ymd);
}

/** Instant DateTimeLocal (yyyy-MM-ddTHH:mm lokal browser) → Date. */
export function parseDateTimeLocal(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const monthLabelFormatter = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const dayLabelFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const longDayLabelFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: JAKARTA_TIME_ZONE,
});

function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function monthLabel(ym: YearMonth): string {
  return monthLabelFormatter.format(new Date(Date.UTC(ym.year, ym.month - 1, 1)));
}

/** 'Hari ini' / 'Kemarin' / 'Sen, 13 Okt' (tambah tahun bila bukan tahun berjalan). */
export function dayLabel(ymd: string, reference: Date = new Date()): string {
  const todayYmd = jakartaYmd(reference);
  if (ymd === todayYmd) return 'Hari ini';
  const yesterdayUtc = new Date(ymdToUtcDate(todayYmd).getTime() - 86_400_000);
  if (ymd === utcDayToYmd(yesterdayUtc)) return 'Kemarin';
  const date = ymdToUtcDate(ymd);
  const sameYear = ymd.slice(0, 4) === todayYmd.slice(0, 4);
  return sameYear ? dayLabelFormatter.format(date) : longDayLabelFormatter.format(date);
}

function utcDayToYmd(utcDay: Date): string {
  const y = utcDay.getUTCFullYear();
  const m = utcDay.getUTCMonth() + 1;
  const d = utcDay.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function longDateLabel(ymd: string): string {
  return longDayLabelFormatter.format(ymdToUtcDate(ymd));
}

export function timeLabel(date: Date): string {
  return timeFormatter.format(date);
}

/** Daftar hari 'YYYY-MM-DD' dalam rentang [start, end). */
export function eachDayInRange(start: Date, end: Date): string[] {
  const days: string[] = [];
  let cursor = ymdToUtcDate(jakartaYmd(start));
  const endYmd = jakartaYmd(end);
  for (;;) {
    const ymd = utcDayToYmd(cursor);
    if (ymd >= endYmd) break;
    days.push(ymd);
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return days;
}

export interface MonthGrid {
  /** Bulan yang ditampilkan, mis. '2026-10'. */
  key: string;
  /** Sel kalender, `null` = padding sebelum hari pertama. */
  cells: (string | null)[];
}

/**
 * Grid kalender satu bulan (Senin sebagai hari pertama, seperti kalender Indonesia).
 * Dipakai date picker agar tidak perlu mengetik tanggal.
 */
export function monthGrid(key: string): MonthGrid {
  const { year, month } = parseMonthKey(key);
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay(): 0 = Minggu → geser agar Senin = 0.
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(`${key}-${String(day).padStart(2, '0')}`);
  }
  return { key, cells };
}

/** Geser 'YYYY-MM-DD' sebanyak n hari (kalender, bukan instant). */
export function shiftYmd(ymd: string, deltaDays: number): string {
  const date = ymdToUtcDate(ymd);
  return utcDayToYmd(new Date(date.getTime() + deltaDays * 86_400_000));
}

/** Nomor hari (1-31) dari 'YYYY-MM-DD'. */
export function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

/** 'YYYY-MM' dari 'YYYY-MM-DD'. */
export function ymKeyOfDay(ymd: string): string {
  return ymd.slice(0, 7);
}

export const WEEKDAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const;
