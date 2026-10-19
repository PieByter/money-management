import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  dayOfMonth,
  jakartaYmd,
  monthGrid,
  monthKey,
  monthRangeFromKey,
  monthRangeUtc,
  shiftMonthKey,
  shiftYmd,
  ymKeyOfDay,
} from '@/lib/dates';

describe('dates (Asia/Jakarta)', () => {
  it('menghitung rentang bulan dalam WIB (UTC+7)', () => {
    const { start, end } = monthRangeUtc({ year: 2026, month: 10 });
    expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });

  it('transaksi 31 Des 23:59 WIB tidak masuk bulan berikutnya', () => {
    const decRange = monthRangeFromKey('2026-12');
    const lastMinuteWib = new Date('2026-12-31T16:59:00.000Z');
    const firstMinuteNextYear = new Date('2026-12-31T17:00:00.000Z');

    expect(lastMinuteWib >= decRange.start && lastMinuteWib < decRange.end).toBe(true);
    expect(firstMinuteNextYear >= decRange.end).toBe(true);
    expect(jakartaYmd(lastMinuteWib)).toBe('2026-12-31');
    expect(jakartaYmd(firstMinuteNextYear)).toBe('2027-01-01');
  });

  it('menggeser bulan melewati batas tahun', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-06', -12)).toBe('2025-06');
    expect(monthKey({ year: 2026, month: 3 })).toBe('2026-03');
  });

  it('memberi label relatif hari', () => {
    const now = new Date('2026-10-18T03:00:00.000Z');
    expect(dayLabel('2026-10-18', now)).toBe('Hari ini');
    expect(dayLabel('2026-10-17', now)).toBe('Kemarin');
    expect(dayLabel('2026-10-15', now)).toContain('15');
  });
});

describe('grid kalender (date picker)', () => {
  it('menyusun hari dengan Senin sebagai kolom pertama', () => {
    // 1 Oktober 2026 = Kamis → 3 sel kosong sebelum tanggal 1.
    const october = monthGrid('2026-10');
    expect(october.cells.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(october.cells.filter(Boolean)).toHaveLength(31);
    expect(october.cells.at(-1)).toBe('2026-10-31');

    // 1 Februari 2026 = Minggu → 6 sel kosong (Sen..Sab).
    const february = monthGrid('2026-02');
    expect(february.cells.slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(february.cells.filter(Boolean)).toHaveLength(28);

    // Tahun kabisat tetap 29 hari.
    expect(monthGrid('2028-02').cells.filter(Boolean)).toHaveLength(29);
  });

  it('menggeser hari lintas bulan dan tahun', () => {
    expect(shiftYmd('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftYmd('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftYmd('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftYmd('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('mengambil nomor hari dan key bulan', () => {
    expect(dayOfMonth('2026-10-05')).toBe(5);
    expect(dayOfMonth('2026-10-25')).toBe(25);
    expect(ymKeyOfDay('2026-10-05')).toBe('2026-10');
    expect(shiftMonthKey(ymKeyOfDay('2026-01-31'), -1)).toBe('2025-12');
  });
});
